import type { PrismaClient } from '@prisma/client';
import {
  POINTS_SPEND_MODES,
  fromExternalBusiness,
  isBusiness,
  type PointsSpendMode
} from '@fullyu/crm-shared';
import { giftsOf, perksOf, type CardPerks, type GiftRow } from '../program/program.rules';

/**
 * 在售大会员只有两档时长：月卡（FY_MONTH）与年卡（FY_ANNUAL）。
 * 后台一页同写两档：价格各自定，权益/积分/特权/礼/游戏开关两档共用一份，
 * 避免「年卡改了权益、月卡忘改」的口径漂移；已售卡仍按购买时快照执行。
 */
export const MEMBERSHIP_PLANS = [
  { code: 'FY_MONTH', label: '月卡' },
  { code: 'FY_ANNUAL', label: '年卡' }
] as const;

export type MembershipPlanCode = (typeof MEMBERSHIP_PLANS)[number]['code'];

export const MEMBERSHIP_PLAN_CODES = MEMBERSHIP_PLANS.map((plan) => plan.code);

export type MembershipBenefit = { business: string; title: string; desc: string };

export type MembershipPlan = {
  code: string;
  label: string;
  name: string;
  priceCents: number;
  validDays: number;
};

export type MembershipConfig = {
  benefits: MembershipBenefit[];
  perks: CardPerks;
  gifts: GiftRow[];
  gameEnabled: boolean;
  pointsSpend: Record<string, PointsSpendMode>;
  plans: MembershipPlan[];
  updatedAt: string | null;
  updatedBy: string | null;
};

type VersionRow = {
  productCode: string;
  priceCents: number;
  validDays: number;
  benefitsJson: string;
  pointsSpendJson: string;
  gameEnabled: boolean;
  giftsJson: string;
  perksJson: string;
  createdAt: Date;
  createdByName: string;
};

const readJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw || 'null');
  } catch {
    return null;
  }
};

/** 库里存内部业务键；历史数据里也有对外键，读时统一成内部键，与其它接口口径一致。 */
const businessOf = (raw: string): string | null => {
  const value = String(raw || '').trim();
  if (isBusiness(value)) return value;
  return fromExternalBusiness(value);
};

export const membershipBenefitsOf = (raw: string): MembershipBenefit[] => {
  const parsed = readJson(raw);
  if (!Array.isArray(parsed)) return [];
  const rows: MembershipBenefit[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const business = businessOf(String(row.business || ''));
    if (!business || typeof row.title !== 'string' || !row.title.trim()) continue;
    rows.push({
      business,
      title: row.title.trim(),
      desc: typeof row.desc === 'string' ? row.desc.trim() : ''
    });
  }
  return rows;
};

const membershipSpendOf = (raw: string): Record<string, PointsSpendMode> => {
  const parsed = readJson(raw);
  const source = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const result: Record<string, PointsSpendMode> = {};
  for (const [internal, value] of Object.entries(source)) {
    const business = businessOf(internal);
    if (!business) continue;
    result[business] = (POINTS_SPEND_MODES as readonly string[]).includes(String(value))
      ? (value as PointsSpendMode)
      : 'display_only';
  }
  return result;
};

/**
 * 读出「当前在售的大会员」。权益、特权、礼与游戏开关以年卡为口径
 * （admin 保存时两档同写，见 BrandCardsService.saveMembership），
 * 两档价格与有效期仍按各自产品版本。
 */
export async function loadMembershipConfig(prisma: PrismaClient): Promise<MembershipConfig> {
  const products = await prisma.brandCardProduct.findMany({
    where: { code: { in: [...MEMBERSHIP_PLAN_CODES] }, status: 'ACTIVE' }
  });
  const versions = await prisma.brandCardVersion.findMany({
    where: { productCode: { in: [...MEMBERSHIP_PLAN_CODES] }, status: 'ACTIVE' }
  });
  const versionOf = (code: string) => versions.find((row) => row.productCode === code) || null;

  const plans: MembershipPlan[] = [];
  for (const def of MEMBERSHIP_PLANS) {
    const product = products.find((row) => row.code === def.code);
    const version = versionOf(def.code);
    if (!product || !version) continue;
    plans.push({
      code: product.code,
      label: def.label,
      name: product.name,
      priceCents: version.priceCents,
      validDays: version.validDays
    });
  }

  const canonical: VersionRow | null = versionOf('FY_ANNUAL') || versionOf('FY_MONTH');
  return {
    benefits: canonical ? membershipBenefitsOf(canonical.benefitsJson) : [],
    perks: canonical ? perksOf(canonical.perksJson) : perksOf('{}'),
    gifts: canonical ? giftsOf(canonical.giftsJson) : [],
    gameEnabled: canonical ? canonical.gameEnabled : true,
    pointsSpend: canonical ? membershipSpendOf(canonical.pointsSpendJson) : {},
    plans,
    updatedAt: canonical ? canonical.createdAt.toISOString() : null,
    updatedBy: canonical ? canonical.createdByName : null
  };
}