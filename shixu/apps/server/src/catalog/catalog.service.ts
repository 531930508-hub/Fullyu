import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { badRequest, notFound } from '../common/errors';
import { mapProduct, mapPublicProduct, mapStore, productImageUrl } from '../common/mappers';

/** 品牌固定顺序：醒 → 松 → 庆 → 眠。数据库按 series 字符串排序会变成 mian 在前。 */
const SERIES_RANK: Record<string, number> = { xing: 0, song: 1, qing: 2, mian: 3 };
const seriesRank = (series: string) => (series in SERIES_RANK ? SERIES_RANK[series] : 99);
type Orderable = {
  id: string;
  series: string;
  categoryId: string;
  sortOrder: number;
  stock?: Array<{ sortOrder: number | null }>;
};

/** 门店覆盖优先；未设置时跟随总部默认顺序。 */
const effectiveSort = (row: Orderable) => row.stock?.[0]?.sortOrder ?? row.sortOrder;
const byCatalogOrder = (a: Orderable, b: Orderable) =>
  seriesRank(a.series) - seriesRank(b.series) ||
  a.categoryId.localeCompare(b.categoryId) ||
  effectiveSort(a) - effectiveSort(b) ||
  a.id.localeCompare(b.id);

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listStores() {
    const rows = await this.prisma.store.findMany({ orderBy: [{ city: 'asc' }, { id: 'asc' }] });
    return rows.map(mapStore);
  }

  async getStore(id: string) {
    const row = await this.prisma.store.findUnique({ where: { id } });
    if (!row) throw notFound('门店不存在');
    return mapStore(row);
  }

  async listCategories() {
    return this.prisma.category.findMany({ orderBy: { id: 'asc' } });
  }

  async catalogForStore(storeId: string) {
    const store = await this.getStore(storeId);
    const categories = await this.listCategories();
    const products = await this.prisma.product.findMany({
      where: { status: 'published' },
      include: { stock: { where: { storeId } } },
      orderBy: [{ id: 'asc' }]
    });
    products.sort(byCatalogOrder);
    return {
      store,
      categories,
      products: products.map((row) => {
        const product = mapPublicProduct(row);
        const stock = row.stock[0];
        const stockGrams = stock?.grams ?? 0;
        const soldOut = stock?.soldOut ?? false;
        // 可售判定用库内剂量（doseG），公共视图里已剥离投料字段（SEC-02）。
        const available = !soldOut && (row.kind === 'tea' ? stockGrams >= row.doseG : stockGrams > 0);
        return { ...product, stockGrams, soldOut, available };
      })
    };
  }

  /**
   * 员工目录视图（SEC-02 回归修复）：营业台代点、报损与杯贴需要投茶量，
   * 因此员工视图保留 doseGrams；成本字段（costCents）任何公共/员工目录都不出接口。
   */
  async catalogForStoreStaff(storeId: string) {
    const store = await this.getStore(storeId);
    const categories = await this.listCategories();
    const products = await this.prisma.product.findMany({
      where: { status: 'published' },
      include: { stock: { where: { storeId } } },
      orderBy: [{ id: 'asc' }]
    });
    products.sort(byCatalogOrder);
    return {
      store,
      categories,
      products: products.map((row) => {
        const { costCents: _costCents, ...product } = mapProduct(row);
        const stock = row.stock[0];
        const stockGrams = stock?.grams ?? 0;
        const soldOut = stock?.soldOut ?? false;
        const available = !soldOut && (row.kind === 'tea' ? stockGrams >= row.doseG : stockGrams > 0);
        return { ...product, stockGrams, soldOut, available };
      })
    };
  }

  async stockForStore(storeId: string) {
    const products = await this.prisma.product.findMany({
      where: { status: { in: ['published', 'archived', 'draft'] } },
      include: { stock: { where: { storeId } } },
      orderBy: [{ kind: 'asc' }, { id: 'asc' }]
    });
    products.sort(byCatalogOrder);
    return products.map((row) => {
      const stock = row.stock[0];
      return {
        productId: row.id,
        name: row.name,
        nameEn: row.nameEn,
        series: row.series,
        categoryId: row.categoryId,
        kind: row.kind,
        doseGrams: row.doseG,
        unit: row.kind === 'tea' ? 'g' : row.unitZh,
        unitEn: row.kind === 'tea' ? 'g' : row.unitEn,
        grams: stock?.grams ?? 0,
        soldOut: stock?.soldOut ?? false,
        // 门店是否覆盖过顺序；为 false 时茶单跟随总部。
        customOrder: stock?.sortOrder != null,
        sortOrder: stock?.sortOrder ?? row.sortOrder
      };
    });
  }

  /** 门店自定义顺序：只允许同一系列、同一分类内整体提交，避免把茶单拆乱。 */
  async updateStoreOrder(storeId: string, productIds: string[]) {
    await this.getStore(storeId);
    const ids = [...new Set(productIds)];
    if (ids.length !== productIds.length) throw badRequest('排序列表不能包含重复商品');
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    if (products.length !== ids.length) throw badRequest('排序列表包含不存在的商品');
    this.assertSameGroup(products);
    const stocks = await this.prisma.stock.findMany({ where: { storeId, productId: { in: ids } } });
    if (stocks.length !== ids.length) throw badRequest('本店没有这些商品，无法调整顺序');
    await this.prisma.$transaction(
      ids.map((productId, index) =>
        this.prisma.stock.update({
          where: { storeId_productId: { storeId, productId } },
          data: { sortOrder: (index + 1) * 10 }
        })
      )
    );
    return this.stockForStore(storeId);
  }

  /** 恢复总部顺序：清空本店覆盖。 */
  async resetStoreOrder(storeId: string) {
    await this.getStore(storeId);
    await this.prisma.stock.updateMany({ where: { storeId, sortOrder: { not: null } }, data: { sortOrder: null } });
    return this.stockForStore(storeId);
  }

  private assertSameGroup(products: Array<{ series: string; categoryId: string }>) {
    if (!products.length) return;
    const { series, categoryId } = products[0];
    if (products.some((row) => row.series !== series || row.categoryId !== categoryId)) {
      throw badRequest('只能在同系列、同分类内调整顺序');
    }
  }

  async retailAvailability() {
    const [stores, products] = await Promise.all([
      this.prisma.store.count({ where: { retailPickup: true, open: true } }),
      this.prisma.product.findMany({ where: { kind: { in: ['retail', 'bottle'] }, status: 'published' } })
    ]);
    const stock = await this.prisma.stock.groupBy({
      by: ['productId'],
      _sum: { grams: true }
    });
    const stockMap = new Map(stock.map((x) => [x.productId, x._sum.grams ?? 0]));
    products.sort(byCatalogOrder);
    return products.map((product) => ({
      id: product.id,
      name: product.name,
      priceCents: product.priceCents,
      totalStock: stockMap.get(product.id) ?? 0,
      stores,
      imageUrl: productImageUrl(product.imageUrl)
    }));
  }

  async categoriesAdmin() {
    const rows = await this.prisma.category.findMany({ orderBy: { id: 'asc' } });
    return rows.map((row) => ({ id: row.id, name: row.name, nameEn: row.nameEn, kind: row.kind }));
  }

  async updateStock(
    storeId: string,
    items: Array<{ productId: string; grams?: number; soldOut?: boolean }>
  ) {
    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const exists = await tx.stock.findUnique({
          where: { storeId_productId: { storeId, productId: item.productId } }
        });
        if (!exists) throw badRequest('库存商品不存在');
        await tx.stock.update({
          where: { storeId_productId: { storeId, productId: item.productId } },
          data: {
            ...(item.grams != null ? { grams: Math.round(item.grams * 10) / 10 } : {}),
            ...(item.soldOut != null ? { soldOut: item.soldOut } : {})
          }
        });
      }
    });
    return this.stockForStore(storeId);
  }
}
