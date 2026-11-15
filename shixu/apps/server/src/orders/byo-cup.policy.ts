import type { PrismaService } from '../common/prisma.service';

/**
 * 自带杯优惠策略。
 *
 * 顾客自带杯只能在门店柜台由伙伴确认：小程序侧不提供勾选入口，代点接口也只认
 * channel=assisted 的请求，避免顾客自己声明后产生无法核销的优惠。
 *
 * 配置放在 settings 表 byoCupPolicy（管理端暂未开放编辑，先用默认值）：
 *   { enabled: boolean, perCupCents: number }
 */
export const BYO_CUP_SETTING_KEY = 'byoCupPolicy';
export const BYO_CUP_DEFAULT_PER_CUP_CENTS = 500;

export interface ByoCupPolicy {
  enabled: boolean;
  perCupCents: number;
}

const DEFAULT_POLICY: ByoCupPolicy = {
  enabled: true,
  perCupCents: BYO_CUP_DEFAULT_PER_CUP_CENTS
};

type SettingReader = Pick<PrismaService, 'setting'>;

export async function loadByoCupPolicy(db: SettingReader): Promise<ByoCupPolicy> {
  const row = await db.setting.findUnique({ where: { key: BYO_CUP_SETTING_KEY } });
  if (!row) return { ...DEFAULT_POLICY };
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.valueJson);
  } catch {
    return { ...DEFAULT_POLICY };
  }
  const input = (parsed || {}) as { enabled?: unknown; perCupCents?: unknown };
  const perCupCents =
    typeof input.perCupCents === 'number' && Number.isFinite(input.perCupCents)
      ? Math.min(Math.max(Math.round(input.perCupCents), 0), 10_000)
      : DEFAULT_POLICY.perCupCents;
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_POLICY.enabled,
    perCupCents
  };
}