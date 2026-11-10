import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { PERMISSION_CODES, PERMISSIONS, PERMISSION_MODULES, ROLE_TEMPLATES } from '@teahour/shared';
import { PrismaService } from '../common/prisma.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { hasPerm, type StaffContext } from '../common/auth.types';
import { mapProduct, mapStaffSummary, mapStore } from '../common/mappers';
import { newId } from '../common/ids';
import { logAction } from '../common/logs';
import { UPLOAD_ROOT } from '../common/assets';
import { IMAGE_CONTENT_TYPES, matchesImageSignature } from '../common/image';
import { StaffService } from '../auth/staff.service';

/** 与顾客端一致：醒 → 松 → 庆 → 眠。 */
const SERIES_RANK_ORDER: Record<string, number> = { xing: 0, song: 1, qing: 2, mian: 3 };

export type ProductInput = {
  name?: string;
  nameEn?: string;
  categoryId?: string;
  series?: string;
  kind?: 'tea' | 'retail' | 'bottle';
  priceCents?: number;
  costCents?: number;
  doseGrams?: number;
  status?: string;
  temps?: string[];
  ice?: boolean;
  memberEligible?: boolean;
  desc?: string;
  descEn?: string;
  spec?: string;
  specEn?: string;
  tag?: string;
  tagEn?: string;
  unit?: string;
  unitEn?: string;
};

export type StoreInput = {
  name?: string;
  nameEn?: string;
  short?: string;
  city?: string;
  cityEn?: string;
  address?: string;
  addressEn?: string;
  lat?: number;
  lng?: number;
  open?: boolean;
  retailPickup?: boolean;
  printerStatus?: string;
  channels?: Record<string, boolean>;
  positions?: string[];
  hours?: string;
  waitMinutes?: number;
};

// assisted 是门店营业台代客下单渠道，与小程序、平台并列，必须一起持久化。
const CHANNEL_KEYS = ['mini', 'assisted', 'meituan', 'taobao'] as const;

// 桌签二维码的链接前缀：配置后后台把「https://前缀?store=...&seat=...」编进二维码，
// 微信「扫普通链接二维码打开小程序」识别后直接拉起小程序并带上 q 参数。
const SEAT_QR_KEY = 'seatQr';

export type RoleInput = {
  id?: string;
  name?: string;
  description?: string;
  scope?: string;
  perms?: string[];
};

export type StaffInput = {
  id?: string;
  name?: string;
  username?: string;
  password?: string;
  roleIds?: string[];
  storeIds?: string[];
  allStores?: boolean;
  active?: boolean;
};

export type MappingInput = {
  id?: string;
  externalId?: string;
  productId?: string;
  unit?: string;
  factor?: number;
};

const SERIES_IDS = ['xing', 'song', 'qing', 'mian'];

/** 取餐位置 / 桌位：去空白、去重，单个最多 20 字，最多 60 个。 */
const normalizePositions = (input?: string[]): string[] => {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const entry of input) {
    const value = String(entry).trim().slice(0, 20);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    list.push(value);
    if (list.length >= 60) break;
  }
  return list;
};

/** 下单渠道固定为小程序 / 美团 / 淘宝三项，避免写入无关键。 */
const normalizeChannels = (input?: Record<string, boolean>): Record<string, boolean> => {
  const source = input && typeof input === 'object' ? input : {};
  const channels: Record<string, boolean> = {};
  for (const key of CHANNEL_KEYS) channels[key] = Boolean(source[key]);
  return channels;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffService: StaffService
  ) {}

  private async stockTotals() {
    const [gramSums, soldOut] = await Promise.all([
      this.prisma.stock.groupBy({ by: ['productId'], _sum: { grams: true } }),
      this.prisma.stock.groupBy({
        by: ['productId'],
        where: { soldOut: true },
        _count: { _all: true }
      })
    ]);
    const grams = new Map(gramSums.map((row) => [row.productId, row._sum.grams ?? 0]));
    const soldOutCount = new Map(soldOut.map((row) => [row.productId, row._count._all]));
    return { grams, soldOutCount };
  }

  async listProducts() {
    const [rows, totals] = await Promise.all([
      this.prisma.product.findMany({ orderBy: [{ series: 'asc' }, { id: 'asc' }] }),
      this.stockTotals()
    ]);
    // 茶单品牌顺序固定，组内按总部排序；门店覆盖只影响门店侧展示。
    rows.sort(
      (a, b) =>
        (SERIES_RANK_ORDER[a.series] ?? 99) - (SERIES_RANK_ORDER[b.series] ?? 99) ||
        a.categoryId.localeCompare(b.categoryId) ||
        a.sortOrder - b.sortOrder ||
        a.id.localeCompare(b.id)
    );
    return rows.map((row) => ({
      ...mapProduct(row),
      totalGrams: totals.grams.get(row.id) ?? 0,
      soldOutStores: totals.soldOutCount.get(row.id) ?? 0
    }));
  }

  /** 总部茶单顺序：同系列同分类内整体提交，按提交顺序重排。 */
  async reorderProducts(staff: StaffContext, productIds: string[]) {
    const ids = [...new Set(productIds)];
    if (ids.length !== productIds.length) throw badRequest('排序列表不能包含重复商品');
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    if (rows.length !== ids.length) throw badRequest('排序列表包含不存在的商品');
    if (rows.length > 1) {
      const { series, categoryId } = rows[0];
      if (rows.some((row) => row.series !== series || row.categoryId !== categoryId)) {
        throw badRequest('只能在同系列、同分类内调整顺序');
      }
    }
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.product.update({ where: { id }, data: { sortOrder: (index + 1) * 10, updatedAt: new Date() } })
      )
    );
    await this.prisma.$transaction((tx) =>
      logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '调整茶单顺序',
        detail: `${rows[0]?.name || ids[0]} 等 ${ids.length} 个商品`,
        type: 'product'
      })
    );
    return this.listProducts();
  }

  async findProduct(id: string) {
    const row = await this.prisma.product.findUnique({ where: { id } });
    if (!row) throw notFound('商品不存在');
    const [grams, soldOut] = await Promise.all([
      this.prisma.stock.aggregate({ where: { productId: id }, _sum: { grams: true } }),
      this.prisma.stock.count({ where: { productId: id, soldOut: true } })
    ]);
    return {
      ...mapProduct(row),
      totalGrams: grams._sum.grams ?? 0,
      soldOutStores: soldOut
    };
  }

  async categoriesAdmin() {
    const rows = await this.prisma.category.findMany({ orderBy: { id: 'asc' } });
    return rows.map((row) => ({ id: row.id, name: row.name, nameEn: row.nameEn, kind: row.kind }));
  }

  async createProduct(staff: StaffContext, input: ProductInput) {
    const name = String(input.name || '').trim();
    if (!name) throw badRequest('请填写商品名称');
    const nameEn = String(input.nameEn || '').trim() || name;
    const category = input.categoryId
      ? await this.prisma.category.findUnique({ where: { id: input.categoryId } })
      : null;
    if (!category) throw badRequest('请选择有效分类');
    const series = String(input.series || '');
    if (!SERIES_IDS.includes(series)) throw badRequest('系列无效');
    const kind = input.kind || (category.kind === 'fresh' ? 'tea' : 'retail');
    if (!['tea', 'retail', 'bottle'].includes(kind)) throw badRequest('商品类型无效');
    const priceCents = Math.round(Number(input.priceCents || 0));
    const costCents = Math.round(Number(input.costCents || 0));
    if (!Number.isInteger(priceCents) || priceCents < 0) throw badRequest('售价须为非负整数（分）');
    if (!Number.isInteger(costCents) || costCents < 0) throw badRequest('成本须为非负整数（分）');
    const dose = Number(input.doseGrams ?? (kind === 'tea' ? 3.5 : 1));
    if (!(dose > 0)) throw badRequest('每杯剂量须大于 0');
    const id = newId('P');
    const status = input.status === 'draft' || input.status === 'archived' ? input.status : 'published';
    // 新商品默认排在同类目末尾，避免插入到茶单最前面。
    const tail = await this.prisma.product.aggregate({
      where: { series, categoryId: category.id },
      _max: { sortOrder: true }
    });
    const sortOrder = (tail._max.sortOrder ?? 0) + 10;
    await this.prisma.$transaction(async (tx) => {
      await tx.product.create({
        data: {
          id,
          name,
          nameEn,
          categoryId: category.id,
          series,
          kind,
          priceCents,
          costCents,
          doseG: dose,
          status,
          tempsJson: JSON.stringify(input.temps || (kind === 'tea' ? ['热', '冰'] : [])),
          ice: input.ice !== false,
          memberEligible: input.memberEligible !== false,
          descZh: input.desc || '',
          descEn: input.descEn || '',
          specZh: input.spec || '',
          specEn: input.specEn || '',
          tagZh: input.tag || '',
          tagEn: input.tagEn || '',
          unitZh: input.unit || (kind === 'tea' ? '杯' : '件'),
          unitEn: input.unitEn || (kind === 'tea' ? 'cup' : 'pc'),
          sortOrder,
          updatedAt: new Date()
        }
      });
      const stores = await tx.store.findMany({ select: { id: true } });
      if (stores.length) {
        await tx.stock.createMany({
          data: stores.map((store) => ({ storeId: store.id, productId: id, grams: 0, soldOut: false }))
        });
      }
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '创建商品',
        detail: `${name} · ${series} · ¥${(priceCents / 100).toFixed(2)}`,
        type: 'product'
      });
    });
    return this.findProduct(id);
  }

  async updateProduct(staff: StaffContext, id: string, input: ProductInput) {
    const row = await this.prisma.product.findUnique({ where: { id } });
    if (!row) throw notFound('商品不存在');
    if (input.priceCents != null && !hasPerm(staff, 'product:price')) {
      throw forbidden('当前账号不能调整售价');
    }
    const data: Prisma.ProductUpdateInput = {};
    if (input.name != null) data.name = String(input.name).trim() || row.name;
    if (input.nameEn != null) data.nameEn = String(input.nameEn).trim() || row.nameEn;
    if (input.categoryId != null) {
      const exists = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!exists) throw badRequest('分类不存在');
      data.category = { connect: { id: input.categoryId } };
    }
    if (input.series != null) {
      if (!SERIES_IDS.includes(input.series)) throw badRequest('系列无效');
      data.series = input.series;
    }
    if (input.kind != null) {
      if (!['tea', 'retail', 'bottle'].includes(input.kind)) throw badRequest('商品类型无效');
      data.kind = input.kind;
    }
    if (input.priceCents != null) {
      const cents = Math.round(Number(input.priceCents));
      if (!Number.isInteger(cents) || cents < 0) throw badRequest('售价无效');
      data.priceCents = cents;
    }
    if (input.costCents != null) {
      const cents = Math.round(Number(input.costCents));
      if (!Number.isInteger(cents) || cents < 0) throw badRequest('成本无效');
      data.costCents = cents;
    }
    if (input.doseGrams != null) {
      const dose = Number(input.doseGrams);
      if (!(dose > 0)) throw badRequest('剂量无效');
      data.doseG = dose;
    }
    if (input.status != null) {
      if (!['published', 'draft', 'archived'].includes(input.status)) throw badRequest('状态无效');
      data.status = input.status;
    }
    if (input.temps != null) data.tempsJson = JSON.stringify(input.temps);
    if (input.ice != null) data.ice = input.ice;
    if (input.memberEligible != null) data.memberEligible = input.memberEligible;
    if (input.desc != null) data.descZh = input.desc;
    if (input.descEn != null) data.descEn = input.descEn;
    if (input.spec != null) data.specZh = input.spec;
    if (input.specEn != null) data.specEn = input.specEn;
    if (input.tag != null) data.tagZh = input.tag;
    if (input.tagEn != null) data.tagEn = input.tagEn;
    if (input.unit != null) data.unitZh = input.unit;
    if (input.unitEn != null) data.unitEn = input.unitEn;
    if (!Object.keys(data).length) return this.findProduct(id);
    data.updatedAt = new Date();
    await this.prisma.product.update({ where: { id }, data });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '更新商品',
      detail: `${row.name}${input.priceCents != null ? ` · 售价 ¥${(input.priceCents / 100).toFixed(2)}` : ''}`,
      type: 'product'
    });
    return this.findProduct(id);
  }

  /**
   * 商品图上传：与头像一样走 base64 直传，库里只存 uploads 下的相对 key。
   * 未上传时 imageUrl 为空，小程序沿用内置系列插画。
   */
  async setProductImage(staff: StaffContext, id: string, input: { base64: string; contentType: string }) {
    const row = await this.prisma.product.findUnique({ where: { id } });
    if (!row) throw notFound('商品不存在');

    const raw = String(input.base64 || '').replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    if (!buffer.length) throw badRequest('图片内容为空');
    if (buffer.length > 2 * 1024 * 1024) throw badRequest('商品图片不能超过 2MB');

    const ext = IMAGE_CONTENT_TYPES[String(input.contentType || '').toLowerCase()];
    if (!ext) throw badRequest('仅支持 JPG、PNG 或 WebP 图片');
    if (!matchesImageSignature(buffer, ext)) throw badRequest('图片内容与文件格式不符，请重新选择');

    const dir = join(UPLOAD_ROOT, 'products');
    mkdirSync(dir, { recursive: true });
    const key = `products/${id}-${randomBytes(6).toString('hex')}.${ext}`;
    writeFileSync(join(UPLOAD_ROOT, key), buffer);

    await this.prisma.product.update({ where: { id }, data: { imageUrl: key, updatedAt: new Date() } });
    this.removeLocalProductImage(row.imageUrl);
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '更新商品图片',
      detail: row.name,
      type: 'product'
    });
    return this.findProduct(id);
  }

  /** 移除商品图，恢复内置插画；只清理本系统 uploads/products 下的旧文件。 */
  async clearProductImage(staff: StaffContext, id: string) {
    const row = await this.prisma.product.findUnique({ where: { id } });
    if (!row) throw notFound('商品不存在');
    if (!row.imageUrl) return this.findProduct(id);
    await this.prisma.product.update({ where: { id }, data: { imageUrl: '', updatedAt: new Date() } });
    this.removeLocalProductImage(row.imageUrl);
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '移除商品图片',
      detail: `${row.name} · 恢复内置插画`,
      type: 'product'
    });
    return this.findProduct(id);
  }

  private removeLocalProductImage(key: string | null | undefined) {
    if (!key || !key.startsWith('products/')) return;
    try {
      rmSync(join(UPLOAD_ROOT, key), { force: true });
    } catch {
      /* 文件已不存在不影响商品状态 */
    }
  }

  async saveCategory(staff: StaffContext, input: { id?: string; name?: string; nameEn?: string; kind?: string }) {
    const name = String(input.name || '').trim();
    if (!name) throw badRequest('请填写分类名称');
    const kind = input.kind || 'fresh';
    if (!['fresh', 'retail', 'bottle'].includes(kind)) throw badRequest('分类类型无效');
    const nameEn = String(input.nameEn || '').trim() || name;
    if (input.id) {
      const existing = await this.prisma.category.findUnique({ where: { id: input.id } });
      if (!existing) throw notFound('分类不存在');
      await this.prisma.category.update({ where: { id: input.id }, data: { name, nameEn, kind } });
      await logAction(this.prisma, {
        actorId: staff.id,
        actorName: staff.name,
        action: '更新分类',
        detail: name,
        type: 'product'
      });
      return (await this.categoriesAdmin()).find((x) => x.id === input.id);
    }
    const id = newId('CAT');
    await this.prisma.category.create({ data: { id, name, nameEn, kind } });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '创建分类',
      detail: name,
      type: 'product'
    });
    return (await this.categoriesAdmin()).find((x) => x.id === id);
  }

  async listStoresAdmin() {
    const rows = await this.prisma.store.findMany({ orderBy: [{ city: 'asc' }, { id: 'asc' }] });
    return rows.map(mapStore);
  }

  /** 门店基础资料由总部维护；新门店会为每个在售商品建立 0g 库存记录。 */
  async createStore(staff: StaffContext, input: StoreInput) {
    const name = String(input.name || '').trim();
    const city = String(input.city || '').trim();
    const address = String(input.address || '').trim();
    if (!name) throw badRequest('请填写门店名称');
    if (!city) throw badRequest('请填写所在城市');
    if (!address) throw badRequest('请填写门店地址');
    if (name.length > 40) throw badRequest('门店名称不能超过 40 个字');
    if (city.length > 20) throw badRequest('城市名称不能超过 20 个字');
    if (address.length > 120) throw badRequest('门店地址不能超过 120 个字');

    const lat = input.lat == null ? 0 : Number(input.lat);
    const lng = input.lng == null ? 0 : Number(input.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw badRequest('纬度应在 -90 到 90 之间');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw badRequest('经度应在 -180 到 180 之间');

    const positions = normalizePositions(input.positions);
    if (!positions.length) throw badRequest('至少填写一个取餐位置');
    const channels = input.channels
      ? normalizeChannels(input.channels)
      : { mini: true, assisted: true, meituan: false, taobao: false };
    const wait = Math.round(Number(input.waitMinutes ?? 8));
    if (!(wait >= 0 && wait <= 180)) throw badRequest('等待时间应在 0–180 分钟');
    const printerStatus = input.printerStatus || 'online';
    if (!['online', 'offline'].includes(printerStatus)) throw badRequest('标签机状态无效');

    let id = '';
    for (let i = 0; i < 5 && !id; i += 1) {
      const candidate = `st-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
      const exists = await this.prisma.store.findUnique({ where: { id: candidate } });
      if (!exists) id = candidate;
    }
    if (!id) throw conflict('门店编号生成失败，请重试');

    const store = await this.prisma.$transaction(async (tx) => {
      const created = await tx.store.create({
        data: {
          id,
          name,
          nameEn: String(input.nameEn || '').trim() || name,
          short: String(input.short || '').trim() || name.slice(0, 8),
          city,
          cityEn: String(input.cityEn || '').trim() || city,
          address,
          addressEn: String(input.addressEn || '').trim() || address,
          lat,
          lng,
          open: input.open !== false,
          retailPickup: input.retailPickup !== false,
          printerStatus,
          channelsJson: JSON.stringify(channels),
          positionsJson: JSON.stringify(positions),
          hours: String(input.hours || '10:00–21:00').slice(0, 40),
          waitMinutes: wait
        }
      });
      const products = await tx.product.findMany({ select: { id: true } });
      if (products.length) {
        await tx.stock.createMany({
          data: products.map((product) => ({ storeId: created.id, productId: product.id, grams: 0, soldOut: false }))
        });
      }
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '创建门店',
        detail: `${name} · ${city}`,
        type: 'store',
        storeId: created.id
      });
      return created;
    });
    return mapStore(store);
  }

  async updateStore(staff: StaffContext, id: string, input: StoreInput) {
    const row = await this.prisma.store.findUnique({ where: { id } });
    if (!row) throw notFound('门店不存在');
    const data: Prisma.StoreUpdateInput = {};
    if (input.name != null) {
      const value = String(input.name).trim();
      if (!value) throw badRequest('门店名称不能为空');
      if (value.length > 40) throw badRequest('门店名称不能超过 40 个字');
      data.name = value;
    }
    if (input.nameEn != null) data.nameEn = String(input.nameEn).trim().slice(0, 80);
    if (input.short != null) data.short = String(input.short).trim().slice(0, 20) || row.name.slice(0, 8);
    if (input.city != null) {
      const value = String(input.city).trim();
      if (!value) throw badRequest('城市不能为空');
      if (value.length > 20) throw badRequest('城市名称不能超过 20 个字');
      data.city = value;
    }
    if (input.cityEn != null) data.cityEn = String(input.cityEn).trim().slice(0, 40) || row.city;
    if (input.address != null) {
      const value = String(input.address).trim();
      if (!value) throw badRequest('门店地址不能为空');
      if (value.length > 120) throw badRequest('门店地址不能超过 120 个字');
      data.address = value;
    }
    if (input.addressEn != null) data.addressEn = String(input.addressEn).trim().slice(0, 200) || row.address;
    if (input.lat != null) {
      const value = Number(input.lat);
      if (!Number.isFinite(value) || value < -90 || value > 90) throw badRequest('纬度应在 -90 到 90 之间');
      data.lat = value;
    }
    if (input.lng != null) {
      const value = Number(input.lng);
      if (!Number.isFinite(value) || value < -180 || value > 180) throw badRequest('经度应在 -180 到 180 之间');
      data.lng = value;
    }
    if (input.open != null) data.open = input.open;
    if (input.retailPickup != null) data.retailPickup = input.retailPickup;
    if (input.printerStatus != null) {
      if (!['online', 'offline'].includes(input.printerStatus)) throw badRequest('标签机状态无效');
      data.printerStatus = input.printerStatus;
    }
    if (input.channels != null) data.channelsJson = JSON.stringify(normalizeChannels(input.channels));
    if (input.positions != null) {
      const positions = normalizePositions(input.positions);
      if (!positions.length) throw badRequest('至少保留一个位置');
      data.positionsJson = JSON.stringify(positions);
    }
    if (input.hours != null) data.hours = String(input.hours).slice(0, 40);
    if (input.waitMinutes != null) {
      const wait = Math.round(Number(input.waitMinutes));
      if (!(wait >= 0 && wait <= 180)) throw badRequest('等待时间应在 0–180 分钟');
      data.waitMinutes = wait;
    }
    if (!Object.keys(data).length) return mapStore(row);
    const updated = await this.prisma.store.update({ where: { id }, data });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '更新门店配置',
      detail: updated.name,
      type: 'store',
      storeId: id
    });
    return mapStore(updated);
  }

  /**
   * 桌签二维码链接前缀。
   * 未配置时为空，后台仍导出「门店ID|位置」纯文本码，只能在小程序内扫码识别；
   * 配置后改为 https 链接码，微信原生「扫一扫」识别规则后可直接进小程序并落桌。
   */
  async seatQrSettings(): Promise<{ baseUrl: string }> {
    const row = await this.prisma.setting.findUnique({ where: { key: SEAT_QR_KEY } });
    if (!row) return { baseUrl: '' };
    try {
      const parsed = JSON.parse(row.valueJson) as { baseUrl?: unknown };
      return { baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '' };
    } catch (error) {
      return { baseUrl: '' };
    }
  }

  async saveSeatQrSettings(staff: StaffContext, input: { baseUrl?: string }): Promise<{ baseUrl: string }> {
    const raw = String(input.baseUrl == null ? '' : input.baseUrl).trim();
    let baseUrl = '';
    if (raw) {
      if (raw.length > 300) throw badRequest('链接前缀不能超过 300 个字符');
      let url: URL;
      try {
        url = new URL(raw);
      } catch (error) {
        throw badRequest('请填写完整链接，例如 https://tea.example.com/qr');
      }
      if (url.protocol !== 'https:') {
        throw badRequest('桌签链接需使用 https（微信规则本身也支持 http，但明文链接存在被篡改风险，不建议用于门店）');
      }
      if (url.username || url.password) throw badRequest('链接前缀不能包含账号密码');
      if (url.search || url.hash) throw badRequest('链接前缀不能带查询参数或锚点，门店与位置由系统自动拼接');
      const pathname = url.pathname.replace(/\/+$/, '');
      if (!pathname) {
        throw badRequest('请使用带路径的链接前缀，例如 https://tea.example.com/qr；只填域名会因末尾斜杠差异导致微信扫码不跳转');
      }
      baseUrl = `${url.protocol}//${url.host}${pathname}`;
    }
    await this.prisma.setting.upsert({
      where: { key: SEAT_QR_KEY },
      create: { key: SEAT_QR_KEY, valueJson: JSON.stringify({ baseUrl }) },
      update: { valueJson: JSON.stringify({ baseUrl }) }
    });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: baseUrl ? '更新桌签扫码链接' : '清除桌签扫码链接',
      detail: baseUrl || '恢复「门店ID|位置」纯文本码',
      type: 'store'
    });
    return { baseUrl };
  }

  async listRoles() {
    const rows = await this.prisma.role.findMany({
      orderBy: [{ builtin: 'desc' }, { id: 'asc' }],
      include: { _count: { select: { userRoles: true } } }
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      scope: row.scope,
      builtin: row.builtin,
      perms: JSON.parse(row.permsJson) as string[],
      users: row._count.userRoles
    }));
  }

  permissionCatalog() {
    return { modules: PERMISSION_MODULES, permissions: PERMISSIONS, codes: PERMISSION_CODES };
  }

  roleTemplates() {
    return ROLE_TEMPLATES;
  }

  async saveRole(staff: StaffContext, input: RoleInput) {
    if (!hasPerm(staff, 'rbac:edit')) throw forbidden('没有维护角色的权限');
    const name = String(input.name || '').trim();
    if (!name) throw badRequest('请填写角色名称');
    const scope = input.scope === 'STORES' ? 'STORES' : 'ALL';
    const perms = Array.from(new Set(input.perms || []));
    for (const perm of perms) {
      if (perm === '*') throw badRequest('自定义角色不能使用全部权限通配符');
      if (!(PERMISSION_CODES as readonly string[]).includes(perm)) throw badRequest(`未知权限：${perm}`);
      if (!hasPerm(staff, perm)) throw forbidden(`不能授予自己没有的权限：${perm}`);
    }
    if (!perms.length) throw badRequest('请至少选择一个权限');
    if (input.id) {
      const row = await this.prisma.role.findUnique({ where: { id: input.id } });
      if (!row) throw notFound('角色不存在');
      // 内置岗位角色允许直接调整权限，只有通配的超级管理员保持系统保留，避免误删后失联。
      const fixedSuper = row.builtin && (row.id === 'r-super' || (JSON.parse(row.permsJson) as string[]).includes('*'));
      if (fixedSuper) throw conflict('超级管理员角色不可修改');
      await this.prisma.role.update({
        where: { id: input.id },
        data: {
          name,
          description: String(input.description || '').slice(0, 200),
          scope,
          permsJson: JSON.stringify(perms)
        }
      });
      await logAction(this.prisma, {
        actorId: staff.id,
        actorName: staff.name,
        action: '更新角色',
        detail: name,
        type: 'rbac'
      });
      return (await this.listRoles()).find((x) => x.id === input.id);
    }
    const id = newId('R');
    await this.prisma.role.create({
      data: {
        id,
        name,
        description: String(input.description || '').slice(0, 200),
        scope,
        builtin: false,
        permsJson: JSON.stringify(perms)
      }
    });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '创建角色',
      detail: name,
      type: 'rbac'
    });
    return (await this.listRoles()).find((x) => x.id === id);
  }

  async listStaff() {
    const rows = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    const out = [];
    for (const row of rows) {
      const staff = await this.staffService.load(row.id);
      if (staff) out.push(mapStaffSummary(staff));
    }
    return out;
  }

  async saveStaff(actor: StaffContext, input: StaffInput) {
    if (!hasPerm(actor, 'rbac:edit')) throw forbidden('没有维护账号的权限');
    const name = String(input.name || '').trim();
    if (!name) throw badRequest('请填写姓名');
    const roleIds = Array.from(new Set(input.roleIds || []));
    if (!roleIds.length) throw badRequest('请至少选择一个角色');
    const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) throw badRequest('存在无效角色');
    if (!hasPerm(actor, '*')) {
      for (const role of roles) {
        for (const perm of JSON.parse(role.permsJson) as string[]) {
          if (perm !== '*' && !hasPerm(actor, perm)) throw forbidden('不能授予自己没有的权限');
        }
      }
    }
    const allStores = Boolean(input.allStores);
    const storeIds = allStores ? [] : Array.from(new Set(input.storeIds || []));
    if (!allStores && !storeIds.length) throw badRequest('请选择授权门店');
    for (const storeId of storeIds) {
      const exists = await this.prisma.store.findUnique({ where: { id: storeId } });
      if (!exists) throw badRequest('存在无效门店');
    }

    if (input.id) {
      const existing = await this.prisma.user.findUnique({ where: { id: input.id } });
      if (!existing) throw notFound('账号不存在');
      if (input.password && String(input.password).length < 8) throw badRequest('密码至少 8 位');
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: input.id },
          data: {
            name,
            allStores,
            active: input.active !== false,
            ...(input.password ? { passwordHash: bcrypt.hashSync(String(input.password), 10) } : {}),
            // SEC-03：管理员改动账号（改密 / 换角色 / 调门店范围 / 停用）都会让
            // 会话版本 +1，该账号所有旧令牌立即失效，被降权的会话不会残留旧权限。
            tokenVersion: { increment: 1 }
          }
        });
        await tx.userRole.deleteMany({ where: { userId: input.id } });
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: input.id!, roleId })) });
        await tx.userStore.deleteMany({ where: { userId: input.id } });
        if (storeIds.length) {
          await tx.userStore.createMany({
            data: storeIds.map((storeId) => ({ userId: input.id!, storeId }))
          });
        }
      });
      await logAction(this.prisma, {
        actorId: actor.id,
        actorName: actor.name,
        action: '更新账号',
        detail: existing.username,
        type: 'rbac'
      });
      const staff = await this.staffService.load(input.id);
      if (!staff) throw notFound('账号不存在');
      return mapStaffSummary(staff);
    }

    const username = String(input.username || '').trim();
    if (!/^\d{6,20}$/.test(username)) throw badRequest('账号应为 6–20 位数字手机号');
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw conflict('该账号已存在');
    const password = String(input.password || '');
    if (password.length < 8) throw badRequest('密码至少 8 位');
    const id = newId('U');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id,
          name,
          username,
          passwordHash: bcrypt.hashSync(password, 10),
          allStores,
          active: input.active !== false,
          createdAt: new Date()
        }
      });
      await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
      if (storeIds.length) {
        await tx.userStore.createMany({ data: storeIds.map((storeId) => ({ userId: id, storeId })) });
      }
    });
    await logAction(this.prisma, {
      actorId: actor.id,
      actorName: actor.name,
      action: '创建账号',
      detail: `${name} · ${username}`,
      type: 'rbac'
    });
    const staff = await this.staffService.load(id);
    if (!staff) throw notFound('账号不存在');
    return mapStaffSummary(staff);
  }

  async listLogs(options: {
    /** null = 全部门店范围（总部）；空数组 = 零范围，什么都看不到（SEC-04 fail closed）。 */
    storeIds: string[] | null;
    q?: string;
    type?: string;
    from?: number;
    to?: number;
    limit?: number;
  }) {
    const where: Prisma.LogWhereInput = {};
    if (options.storeIds) {
      if (!options.storeIds.length) return [];
      where.OR = [{ storeId: { in: options.storeIds } }, { storeId: 'brand' }];
    }
    if (options.type && options.type !== 'all') where.type = options.type;
    if (options.from != null || options.to != null) {
      where.at = {
        ...(options.from != null ? { gte: new Date(options.from) } : {}),
        ...(options.to != null ? { lt: new Date(options.to) } : {})
      };
    }
    const rows = await this.prisma.log.findMany({
      where,
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: options.limit || 200
    });
    const stores = await this.prisma.store.findMany();
    const names = new Map(stores.map((store) => [store.id, store.name]));
    const q = (options.q || '').trim().toLowerCase();
    return rows
      .filter((row) => !q || `${row.actorName || ''}${row.action}${row.detail}`.toLowerCase().includes(q))
      .map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorName: row.actorName || '系统',
        action: row.action,
        detail: row.detail,
        type: row.type,
        storeId: row.storeId,
        storeName: row.storeId === 'brand' ? '品牌零售 / 总部' : names.get(row.storeId || '') || row.storeId,
        orderId: row.orderId,
        at: row.at.getTime()
      }));
  }

  async listMappings() {
    const rows = await this.prisma.mapping.findMany({
      include: { product: { select: { name: true, kind: true } } },
      orderBy: { externalId: 'asc' }
    });
    return rows.map((row) => ({
      id: row.id,
      externalId: row.externalId,
      productId: row.productId,
      productName: row.product.name,
      kind: row.product.kind,
      unit: row.unit,
      factor: row.factor,
      updatedAt: row.updatedAt.getTime()
    }));
  }

  async saveMapping(staff: StaffContext, input: MappingInput) {
    if (!hasPerm(staff, 'mapping:edit')) throw forbidden('没有维护映射的权限');
    const externalId = String(input.externalId || '').trim();
    const productId = String(input.productId || '');
    const factor = Number(input.factor);
    if (!externalId) throw badRequest('请填写原料 SKU 编号');
    if (!(factor > 0)) throw badRequest('换算系数须大于 0');
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw badRequest('商品不存在');
    const unit = String(input.unit || '袋');
    const now = new Date();
    if (input.id) {
      await this.prisma.mapping.update({
        where: { id: input.id },
        data: { externalId, productId, unit, factor, updatedAt: now }
      });
    } else {
      await this.prisma.mapping.create({
        data: { id: newId('MAP'), externalId, productId, unit, factor, updatedAt: now }
      });
    }
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '更新原料映射',
      detail: externalId,
      type: 'product'
    });
    return (await this.listMappings()).find((x) => x.externalId === externalId);
  }
}
