import { Injectable } from '@nestjs/common';
import {
  POINTS_SPEND_MODES,
  fromExternalBusiness,
  isBusiness,
  type PointsSpendMode
} from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { audit } from '../common/audit';
import { badRequest, conflict, notFound } from '../common/errors';
import { newId } from '../common/ids';
import type { StaffContext } from '../common/auth.types';
import {
  giftsOf,
  perksOf,
  validateGifts,
  validatePerks,
  type CardPerks,
  type GiftRow
} from '../program/program.rules';

export type BenefitInput = { business: string; title: string; desc?: string };

export type VersionInput = {
  priceCents: number;
  validDays: number;
  benefits?: BenefitInput[];
  pointsSpend?: Record<string, string>;
  gameEnabled?: boolean;
  note?: string;
  /** 付费年卡附带的实物礼（仅发提货券，到店核销） */
  gifts?: unknown;
  /** 跨业务特权配置，如在场优先排位/阶梯价/每月邀请数 */
  perks?: unknown;
};

type Benefit = { business: string; title: string; desc: string };

const MAX_PRICE_CENTS = 10_000_000;
const MAX_VALID_DAYS = 3650;
const PRODUCT_CODE = /^FY_[A-Z0-9_]{2,30}$/;

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

function normalizeBusiness(value: string): string {
  const raw = String(value || '').trim();
  if (isBusiness(raw)) return raw;
  const mapped = fromExternalBusiness(raw);
  if (mapped) return mapped;
  throw badRequest(`未知业务：${value}`);
}

function normalizeBenefits(input: unknown): Benefit[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 3) {
    throw badRequest('权益须为 1–3 条');
  }
  const seen = new Set<string>();
  return input.map((item) => {
    if (!item || typeof item !== 'object') throw badRequest('权益格式不正确');
    const row = item as Record<string, unknown>;
    const business = normalizeBusiness(String(row.business || ''));
    if (seen.has(business)) throw badRequest('同一业务只能配置一条权益');
    seen.add(business);
    const title = String(row.title || '').trim();
    const desc = String(row.desc || '').trim();
    if (title.length < 1 || title.length > 40) throw badRequest('权益标题须为 1–40 个字符');
    if (desc.length > 120) throw badRequest('权益说明不能超过 120 个字符');
    return { business, title, desc };
  });
}

function normalizePointsSpend(input: unknown): Record<string, PointsSpendMode> {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('积分消耗配置格式不正确');
  const out: Record<string, PointsSpendMode> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const business = normalizeBusiness(key);
    if (!POINTS_SPEND_MODES.includes(value as PointsSpendMode)) {
      throw badRequest(`积分消耗模式只支持 ${POINTS_SPEND_MODES.join(' / ')}`);
    }
    out[business] = value as PointsSpendMode;
  }
  return out;
}

export type BrandCardVersionDto = {
  id: string;
  productCode: string;
  version: number;
  status: string;
  priceCents: number;
  validDays: number;
  benefits: Benefit[];
  pointsSpend: Record<string, string>;
  gameEnabled: boolean;
  gifts: GiftRow[];
  perks: CardPerks;
  note: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  activatedAt: Date | null;
  archivedAt: Date | null;
};

@Injectable()
export class BrandCardsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const products = await this.prisma.brandCardProduct.findMany({
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
      include: { versions: { orderBy: { version: 'desc' } } }
    });
    return products.map((product) => this.toProductDto(product));
  }

  async detail(code: string) {
    const product = await this.prisma.brandCardProduct.findUnique({
      where: { code },
      include: { versions: { orderBy: { version: 'desc' } } }
    });
    if (!product) throw notFound('大会员卡产品不存在');
    return this.toProductDto(product);
  }

  async createProduct(
    input: { code?: string; name?: string; sort?: number },
    actor: StaffContext
  ) {
    const code = String(input.code || '').trim().toUpperCase();
    if (!PRODUCT_CODE.test(code)) throw badRequest('产品编码须形如 FY_ANNUAL');
    const name = String(input.name || '').trim();
    if (name.length < 1 || name.length > 30) throw badRequest('产品名称须为 1–30 个字符');
    const sort = input.sort === undefined ? 0 : this.int(input.sort, -9999, 9999, '排序');
    const exists = await this.prisma.brandCardProduct.findUnique({ where: { code } });
    if (exists) throw conflict('产品编码已存在');

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.brandCardProduct.create({ data: { code, name, sort } });
      await audit(tx, {
        actor,
        action: '新增大会员卡产品',
        target: code,
        detail: name
      });
      return created;
    });
    return this.detail(product.code);
  }

  async createVersion(code: string, input: VersionInput, actor: StaffContext) {
    const product = await this.prisma.brandCardProduct.findUnique({ where: { code } });
    if (!product) throw notFound('大会员卡产品不存在');
    if (product.status !== 'ACTIVE') throw conflict('产品已归档，不能新增版本');

    const priceCents = this.int(input.priceCents, 1, MAX_PRICE_CENTS, '价格（分）');
    const validDays = this.int(input.validDays, 1, MAX_VALID_DAYS, '有效期天数');
    const benefits = normalizeBenefits(input.benefits);
    const pointsSpend = normalizePointsSpend(input.pointsSpend);
    const giftsJson = validateGifts(input.gifts);
    const perksJson = validatePerks(input.perks);
    const note = String(input.note || '').trim();
    if (note.length > 200) throw badRequest('版本备注不能超过 200 个字符');
    if (input.gameEnabled !== undefined && typeof input.gameEnabled !== 'boolean') {
      throw badRequest('游戏开关只能是布尔值');
    }

    const last = await this.prisma.brandCardVersion.findFirst({
      where: { productCode: code },
      orderBy: { version: 'desc' }
    });
    const version = (last?.version || 0) + 1;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.brandCardVersion.create({
        data: {
          id: newId('BCV'),
          productCode: code,
          version,
          status: 'DRAFT',
          priceCents,
          validDays,
          benefitsJson: JSON.stringify(benefits),
          pointsSpendJson: JSON.stringify(pointsSpend),
          gameEnabled: input.gameEnabled !== false,
          giftsJson,
          perksJson,
          note,
          createdBy: actor.id,
          createdByName: actor.name
        }
      });
      await audit(tx, {
        actor,
        action: '新增大会员卡版本',
        target: `${code} v${version}`,
        detail: `价格 ${priceCents} 分 / ${validDays} 天`
      });
      return created;
    });
    return this.toVersionDto(row);
  }

  /** 激活后旧版本立即归档；已生效版本不提供原地修改接口。 */
  async activate(code: string, versionNumber: number, actor: StaffContext) {
    const product = await this.prisma.brandCardProduct.findUnique({ where: { code } });
    if (!product) throw notFound('大会员卡产品不存在');
    const target = await this.prisma.brandCardVersion.findUnique({
      where: { productCode_version: { productCode: code, version: versionNumber } }
    });
    if (!target) throw notFound('版本不存在');
    if (product.status !== 'ACTIVE') throw conflict('产品已归档，不能激活版本');
    if (target.status !== 'DRAFT') throw conflict('只有草稿版本可以激活');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.brandCardVersion.updateMany({
        where: { id: target.id, status: 'DRAFT' },
        data: { status: 'ACTIVE', activatedAt: now }
      });
      if (claimed.count !== 1) throw conflict('版本状态已变化，请刷新后重试');
      await tx.brandCardVersion.updateMany({
        where: { productCode: code, status: 'ACTIVE', NOT: { id: target.id } },
        data: { status: 'ARCHIVED', archivedAt: now }
      });
      await tx.brandCardProduct.update({
        where: { code },
        data: { currentVersion: versionNumber }
      });
      await audit(tx, {
        actor,
        action: '激活大会员卡版本',
        target: `${code} v${versionNumber}`,
        detail: `价格 ${target.priceCents} 分 / ${target.validDays} 天`
      });
    });
    return this.detail(code);
  }

  private toProductDto(product: {
    code: string;
    name: string;
    status: string;
    sort: number;
    currentVersion: number | null;
    createdAt: Date;
    updatedAt: Date;
    versions: {
      id: string;
      productCode: string;
      version: number;
      status: string;
      priceCents: number;
      validDays: number;
      benefitsJson: string;
      pointsSpendJson: string;
      gameEnabled: boolean;
      giftsJson: string;
      perksJson: string;
      note: string;
      createdBy: string;
      createdByName: string;
      createdAt: Date;
      activatedAt: Date | null;
      archivedAt: Date | null;
    }[];
  }) {
    const versions = product.versions.map((row) => this.toVersionDto(row));
    const current = versions.find((row) => row.version === product.currentVersion) || null;
    return {
      code: product.code,
      name: product.name,
      status: product.status,
      sort: product.sort,
      currentVersion: product.currentVersion,
      current,
      versions,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };
  }

  private toVersionDto(row: {
    id: string;
    productCode: string;
    version: number;
    status: string;
    priceCents: number;
    validDays: number;
    benefitsJson: string;
    pointsSpendJson: string;
    gameEnabled: boolean;
    giftsJson: string;
    perksJson: string;
    note: string;
    createdBy: string;
    createdByName: string;
    createdAt: Date;
    activatedAt: Date | null;
    archivedAt: Date | null;
  }): BrandCardVersionDto {
    return {
      id: row.id,
      productCode: row.productCode,
      version: row.version,
      status: row.status,
      priceCents: row.priceCents,
      validDays: row.validDays,
      benefits: parseJson<Benefit[]>(row.benefitsJson, []),
      pointsSpend: parseJson<Record<string, string>>(row.pointsSpendJson, {}),
      gameEnabled: row.gameEnabled,
      gifts: giftsOf(row.giftsJson),
      perks: perksOf(row.perksJson),
      note: row.note,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      createdAt: row.createdAt,
      activatedAt: row.activatedAt,
      archivedAt: row.archivedAt
    };
  }

  private int(value: unknown, min: number, max: number, label: string): number {
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
      throw badRequest(`${label}须为 ${min}–${max} 的整数`);
    }
    return value as number;
  }
}
