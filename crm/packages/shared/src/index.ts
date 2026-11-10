export type Business = 'sx' | 'ql' | 'zc';

export const BUSINESSES: { key: Business; name: string }[] = [
  { key: 'sx', name: '时叙' },
  { key: 'ql', name: '轻疗' },
  { key: 'zc', name: '在场' }
];

/** CRM 内部业务键与三端契约键的映射；对外接口只收发 external 值。 */
export const BUSINESS_EXTERNAL: Record<Business, string> = {
  sx: 'teahour',
  ql: 'retreat',
  zc: 'presence'
};

export const EXTERNAL_BUSINESSES = Object.values(BUSINESS_EXTERNAL);

export function toExternalBusiness(business: string): string | null {
  return business === 'sx' || business === 'ql' || business === 'zc'
    ? BUSINESS_EXTERNAL[business]
    : null;
}

export function fromExternalBusiness(value: unknown): Business | null {
  if (typeof value !== 'string') return null;
  const hit = (Object.keys(BUSINESS_EXTERNAL) as Business[]).find(
    (key) => BUSINESS_EXTERNAL[key] === value
  );
  return hit ?? null;
}

export const businessName = (business: string): string =>
  BUSINESSES.find((item) => item.key === business)?.name ?? business;

/** 积分消耗模式：本期仅轻疗可 1 分抵 1 元，其余只展示。 */
export const POINTS_SPEND_MODES = ['display_only', '1_point_1_yuan'] as const;
export type PointsSpendMode = (typeof POINTS_SPEND_MODES)[number];

/** CRM 权限点：一期先列出会被本批代码判定的能力，后续批次按需追加。 */
export const CRM_PERMISSIONS = [
  { code: 'crm:member:view', name: '查看会员档案' },
  { code: 'crm:member:edit', name: '编辑会员资料' },
  { code: 'crm:adjust:create', name: '发起单笔积分调整' },
  { code: 'crm:adjust:batch', name: '发起批量积分调整' },
  { code: 'crm:adjust:approve', name: '审批积分调整' },
  { code: 'crm:audit:view', name: '查看审计日志' },
  { code: 'crm:card:view', name: '查看大会员卡与业务卡目录' },
  { code: 'crm:card:edit', name: '维护大会员卡' },
  { code: 'crm:config:edit', name: '维护规则配置' },
  { code: 'crm:report:view', name: '查看月度对账' },
  { code: 'crm:queue:handle', name: '处理异常队列' },
  { code: 'crm:sync:view', name: '查看三端同步' },
  { code: 'crm:sync:retry', name: '重投同步事件' },
  { code: 'crm:role:edit', name: '维护角色权限' },
  { code: 'crm:gift:edit', name: '维护赠送会员码' },
  { code: 'crm:gift:approve', name: '审批超默认天数的会员码' },
  { code: 'crm:voucher:redeem', name: '核销年卡实物礼券' },
  { code: 'crm:feedback:handle', name: '处理意见反馈与会员故事' },
  { code: 'crm:refund:force', name: '协商退款（强制退卡）' }
] as const;

export const CRM_PERMISSION_CODES = CRM_PERMISSIONS.map((p) => p.code);

/** 设计 §7.6 的四个内置角色；管理员用 '*' 表示全部。 */
export const CRM_ROLE_TEMPLATES = [
  { id: 'crm-admin', name: 'CRM 管理员', perms: ['*'] },
  {
    id: 'crm-ops',
    name: '会员运营',
    perms: [
      'crm:member:view',
      'crm:member:edit',
      'crm:adjust:create',
      'crm:adjust:batch',
      'crm:card:view',
      'crm:card:edit',
      'crm:config:edit',
      'crm:sync:view',
      'crm:sync:retry',
      'crm:audit:view',
      'crm:gift:edit',
      'crm:feedback:handle'
    ]
  },
  {
    id: 'crm-finance',
    name: '财务',
    perms: [
      'crm:member:view',
      'crm:adjust:approve',
      'crm:card:view',
      'crm:queue:handle',
      'crm:sync:view',
      'crm:report:view',
      'crm:audit:view',
      'crm:gift:approve',
      'crm:refund:force'
    ]
  },
  {
    id: 'crm-cs',
    name: '客服',
    perms: [
      'crm:member:view',
      'crm:member:edit',
      'crm:adjust:create',
      'crm:card:view',
      'crm:voucher:redeem',
      'crm:feedback:handle'
    ]
  },
  { id: 'crm-store', name: '门店核销', perms: ['crm:member:view', 'crm:voucher:redeem'] }
] as const;

/** 单笔调整免审阈值；超过（绝对值）需另一人审批。 */
export const ADJUST_FREE_LIMIT = 500;

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 积分到期日：1–10 月获得 → 次年 1 月 1 日 00:00（Asia/Shanghai）；
 * 11–12 月获得 → 后年 1 月 1 日。只取「年 + 1 或 +2」，闰年与周末不影响。
 * 返回 UTC 瞬间：上海 1 月 1 日 00:00 = UTC 前一年 12 月 31 日 16:00。
 */
export function pointExpireAt(earnedAt: Date): Date {
  const shanghai = new Date(earnedAt.getTime() + SHANGHAI_OFFSET_MS);
  const year = shanghai.getUTCFullYear();
  const month = shanghai.getUTCMonth() + 1;
  const targetYear = month >= 11 ? year + 2 : year + 1;
  return new Date(Date.UTC(targetYear, 0, 1) - SHANGHAI_OFFSET_MS);
}

export const isBusiness = (value: unknown): value is Business =>
  value === 'sx' || value === 'ql' || value === 'zc';

/** 愈行之旅棋盘：12 站一圈，3/7/11 为礼物站。站点名为对外展示文案。 */
export const GAME_STATIONS = [
  '起点 · 茶园',
  '第 01 站 · 溪桥',
  '第 02 站 · 松林',
  '第 03 站 · 竹林',
  '第 04 站 · 山居',
  '第 05 站 · 云台',
  '第 06 站 · 石泉',
  '第 07 站 · 温泉',
  '第 08 站 · 湖畔',
  '第 09 站 · 花田',
  '第 10 站 · 月洞',
  '第 11 站 · 归途'
] as const;

export const GAME_CHEST_STATIONS = [3, 7, 11] as const;

export const GAME_LAP_BONUS_STATION = 0;

export type PointsRule = {
  centsPerPoint: number;
  rounding: 'floor' | 'round';
  cardMultiplier: number;
  newMember: number;
  holdTtlMinutes: number;
  earnCoolingDays: number;
};

/**
 * 棋盘体验券：只送免费体验（茶饮一杯 / 体验课一节 / 30 分钟肩颈），不送折扣券。
 * minLap：第几圈（0 起）起才可能出现；minLifetimeDice：累计获得骰子数达到后才可能出现。
 * 概率对会员不展示。
 */
export type DicePrizeRule = {
  name: string;
  business: Business;
  validityDays: number;
  weight: number;
  minLap: number;
  minLifetimeDice: number;
  /** 面值（分），仅用于后台成本测算，不对会员展示。 */
  faceCents: number;
};

/** 每圈棋盘档位：fromLap 起生效，落点积分在 [pointsMin, pointsMax]，礼物站中放 voucherSlots 张券。 */
export type DiceLapTier = {
  fromLap: number;
  pointsMin: number;
  pointsMax: number;
  voucherSlots: number;
};

export type DiceRule = {
  centsPerDie: number;
  checkinDaily: number;
  chestBudgetCents: number;
  guestPlay: 'yes' | 'no';
  prizes: DicePrizeRule[];
  laps: DiceLapTier[];
  /** 少去业态的加权强度：0 = 不加权；1 = 从未消费的业态权重最多翻倍。 */
  diversifyBoost: number;
};

export const DEFAULT_POINTS_RULES: Record<Business, PointsRule> = {
  sx: {
    centsPerPoint: 1000,
    rounding: 'floor',
    cardMultiplier: 2,
    newMember: 20,
    holdTtlMinutes: 30,
    earnCoolingDays: 0
  },
  ql: {
    centsPerPoint: 1000,
    rounding: 'floor',
    cardMultiplier: 1.5,
    newMember: 0,
    holdTtlMinutes: 45,
    earnCoolingDays: 0
  },
  zc: {
    centsPerPoint: 1000,
    rounding: 'round',
    cardMultiplier: 1,
    newMember: 0,
    holdTtlMinutes: 20,
    earnCoolingDays: 0
  }
};

/**
 * 2026-11-09 会议口径：实付（扣除全部优惠后）每满 ¥300 得 1 颗，跨订单累计结转；
 * 不设单笔上限、不设每月上限。退款按 ¥300/颗回收，允许余额为负，
 * 负余额需先用后续消费补回，补回后才重新得到可用骰子。
 * 首圈只出积分与茶饮；轻疗 30 分钟肩颈需累计 10 颗骰子（约消费 ¥3000）后才可能出现。
 * 数值为初版占位，经营确认后在后台新建规则版本调整。
 */
export const DEFAULT_DICE_RULE: DiceRule = {
  centsPerDie: 30000,
  checkinDaily: 0,
  chestBudgetCents: 300000,
  guestPlay: 'no',
  prizes: [
    {
      name: '时叙 · 免费茶饮一杯',
      business: 'sx',
      validityDays: 30,
      weight: 6,
      minLap: 0,
      minLifetimeDice: 0,
      faceCents: 2500
    },
    {
      name: '在场 · 免费体验课一节',
      business: 'zc',
      validityDays: 30,
      weight: 3,
      minLap: 1,
      minLifetimeDice: 0,
      faceCents: 9900
    },
    {
      name: '轻疗 · 30 分钟肩颈',
      business: 'ql',
      validityDays: 30,
      weight: 2,
      minLap: 1,
      minLifetimeDice: 10,
      faceCents: 15800
    }
  ],
  laps: [
    { fromLap: 0, pointsMin: 1, pointsMax: 2, voucherSlots: 1 },
    { fromLap: 1, pointsMin: 3, pointsMax: 5, voucherSlots: 1 },
    { fromLap: 2, pointsMin: 5, pointsMax: 10, voucherSlots: 2 },
    { fromLap: 3, pointsMin: 8, pointsMax: 15, voucherSlots: 2 },
    { fromLap: 5, pointsMin: 10, pointsMax: 30, voucherSlots: 3 }
  ],
  diversifyBoost: 1
};

/** 旧版规则（无 laps / minLap 等字段）读取时补默认值，避免历史版本解析失败。 */
export function normalizeDiceRule(raw: Partial<DiceRule> & Record<string, unknown>): DiceRule {
  const base = DEFAULT_DICE_RULE;
  const prizes = Array.isArray(raw.prizes) && raw.prizes.length ? raw.prizes : base.prizes;
  return {
    ...base,
    ...raw,
    prizes: prizes.map((p) => ({
      ...p,
      minLap: typeof p.minLap === 'number' ? p.minLap : 0,
      minLifetimeDice: typeof p.minLifetimeDice === 'number' ? p.minLifetimeDice : 0,
      faceCents: typeof p.faceCents === 'number' ? p.faceCents : 0
    })) as DicePrizeRule[],
    laps: Array.isArray(raw.laps) && raw.laps.length ? (raw.laps as DiceLapTier[]) : base.laps,
    diversifyBoost:
      typeof raw.diversifyBoost === 'number' ? raw.diversifyBoost : base.diversifyBoost
  } as DiceRule;
}

/** 当前圈适用的档位：取 fromLap ≤ lap 的最后一档。 */
export function lapTier(rule: DiceRule, lap: number): DiceLapTier {
  const sorted = [...rule.laps].sort((a, b) => a.fromLap - b.fromLap);
  let hit = sorted[0];
  for (const tier of sorted) if (tier.fromLap <= lap) hit = tier;
  return hit;
}

export type BoardCell =
  | { station: number; kind: 'points'; points: number }
  | { station: number; kind: 'voucher'; prizeIndex: number; name: string; business: Business };

/**
 * 生成一圈棋盘：每站都有奖励（积分或体验券），券只放在礼物站。
 * rng 返回 [0,1)；businessShare 为会员各业态实付占比（0–1），用于让少去的业态更容易出现。
 */
export function generateBoard(
  rule: DiceRule,
  lap: number,
  lifetimeDice: number,
  businessShare: Partial<Record<Business, number>>,
  rng: () => number
): BoardCell[] {
  const tier = lapTier(rule, lap);
  const span = Math.max(0, tier.pointsMax - tier.pointsMin);
  const pool = rule.prizes
    .map((prize, index) => ({ prize, index }))
    .filter(({ prize }) => prize.minLap <= lap && prize.minLifetimeDice <= lifetimeDice)
    .map(({ prize, index }) => {
      const share = Math.min(1, Math.max(0, businessShare[prize.business] ?? 0));
      const hasHistory = Object.values(businessShare).some((v) => (v ?? 0) > 0);
      const boost = hasHistory ? 1 + rule.diversifyBoost * (1 - share) : 1;
      return { prize, index, weight: Math.max(1, prize.weight) * boost };
    });
  const chests = [...GAME_CHEST_STATIONS] as number[];
  // 礼物站洗牌后取前 voucherSlots 个放券，保证同一圈券的位置不固定。
  for (let i = chests.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [chests[i], chests[j]] = [chests[j], chests[i]];
  }
  const voucherStations = new Set(pool.length ? chests.slice(0, tier.voucherSlots) : []);
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  return GAME_STATIONS.map((_, station) => {
    if (voucherStations.has(station)) {
      let cursor = rng() * total;
      let pick = pool[pool.length - 1];
      for (const item of pool) {
        cursor -= item.weight;
        if (cursor < 0) {
          pick = item;
          break;
        }
      }
      return {
        station,
        kind: 'voucher' as const,
        prizeIndex: pick.index,
        name: pick.prize.name,
        business: pick.prize.business
      };
    }
    return {
      station,
      kind: 'points' as const,
      points: tier.pointsMin + Math.floor(rng() * (span + 1))
    };
  });
}

export const DICE_RULE_FIELDS = [
  { key: 'centsPerDie', label: '每消费多少分得 1 颗', unit: '分', min: 1, max: 1000000 },
  { key: 'checkinDaily', label: '每日签到', unit: '颗', min: 0, max: 3 },
  { key: 'chestBudgetCents', label: '宝箱格月预算', unit: '分', min: 0, max: 10000000 },
  { key: 'guestPlay', label: '非会员可玩', unit: '', min: 0, max: 1 }
] as const;

export const POINTS_RULE_FIELDS = [
  { key: 'centsPerPoint', label: '每消费多少分得 1 分', unit: '分', min: 1, max: 1000000 },
  { key: 'rounding', label: '不足 1 分时', unit: '', min: 0, max: 1 },
  { key: 'cardMultiplier', label: '大会员卡倍数', unit: '倍', min: 1, max: 3 },
  { key: 'newMember', label: '新会员首单奖励', unit: '分', min: 0, max: 500 },
  { key: 'holdTtlMinutes', label: '抵扣预占有效期', unit: '分钟', min: 1, max: 240 },
  { key: 'earnCoolingDays', label: '发放冷静期', unit: '天', min: 0, max: 30 }
] as const;

/** 骰子发放规则（单笔视角，不含结转）：按实付金额向下取整，不设单笔上限。 */
export function diceForPaid(rule: DiceRule, paidCents: number): number {
  if (!Number.isInteger(paidCents) || paidCents <= 0) return 0;
  return Math.floor(paidCents / rule.centsPerDie);
}

/**
 * 累计结转得骰：上次不足 1 颗的金额（carry）与本单实付相加后取整。
 * 不设单笔、每月上限，单笔可无限获得。
 */
export function diceWithCarry(
  rule: DiceRule,
  carryCents: number,
  paidCents: number
): { raw: number; dice: number; carryCents: number } {
  const per = rule.centsPerDie;
  const total = Math.max(0, carryCents) + Math.max(0, paidCents);
  const raw = Math.floor(total / per);
  return { raw, dice: raw, carryCents: total - raw * per };
}

/**
 * 退款从累计进度里回收骰子：本次退款金额直接从 carry 中扣，
 * 每满一颗扣 1 颗；跨过 0 时 diceDelta 为负，余额可因此变成负数。
 * 负数余额由服务层保留，后续消费先补回负数，再得到新的可用骰子。
 */
export function diceRefundCarry(
  rule: DiceRule,
  carryCents: number,
  refundCents: number
): { carryCents: number; diceDelta: number } {
  const per = rule.centsPerDie;
  const amount = Math.max(0, Math.floor(refundCents));
  const net = carryCents - amount;
  const diceDelta = Math.min(0, Math.floor(net / per));
  return { carryCents: net - diceDelta * per, diceDelta };
}

export type DiceTip = {
  business: Business;
  external: string;
  title: string;
  text: string;
};

/**
 * 进度条三档建议（按每颗金额的 1/3、2/3 切分，¥300 时即 0–100 / 100–200 / 200–300）：
 * 差得多 → 轻疗 60/90 分钟；差一百多 → 在场一节课；只差几十 → 时叙一杯茶或茶礼。
 * daysSince 为距上次在该业态消费的天数，有数据时用一句温和的话开头。
 */
export function diceProgress(
  rule: DiceRule,
  carryCents: number,
  daysSince: Partial<Record<Business, number | null>> = {},
  balance = 0
): {
  perDieCents: number;
  progressCents: number;
  remainingCents: number;
  percent: number;
  headline: string;
  /** 负余额颗数；大于 0 时下一颗要先把这些补回。 */
  deficitDice: number;
  /** 从现在到下一颗「可用」骰子还差的实付金额（含补回负数）。 */
  nextUsableCents: number;
  tip: DiceTip;
} {
  const per = rule.centsPerDie;
  const progress = Math.min(per - 1, Math.max(0, carryCents));
  const remaining = per - progress;
  const deficit = Math.max(0, -Math.floor(balance));
  const nextUsableCents = remaining + deficit * per;
  const yuan = (cents: number) => {
    const value = cents / 100;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  };
  const third = per / 3;
  const business: Business = progress < third ? 'ql' : progress < third * 2 ? 'zc' : 'sx';
  const days = daysSince[business];
  const lead =
    typeof days === 'number' && days >= 7
      ? `距离上次来${businessName(business)}已经 ${days} 天了，`
      : '';
  const tips: Record<Business, { title: string; text: string }> = {
    ql: {
      title: '约一次轻疗',
      text: `${lead}给自己留一段完整的放松时间吧。60 或 90 分钟的轻疗正好够凑满这一颗，提前一天预约还能享会员价。`
    },
    zc: {
      title: '去在场上一节课',
      text: `${lead}来在场上一节课，让身体慢慢舒展开，这一颗骰子也就到手了。`
    },
    sx: {
      title: '来时叙喝杯茶',
      text: `${lead}只差一点点了，来时叙喝杯茶，或带一份茶礼回家。`
    }
  };
  return {
    perDieCents: per,
    progressCents: progress,
    remainingCents: remaining,
    percent: Math.round((progress / per) * 100),
    headline: `再消费 ¥${yuan(nextUsableCents)} 可再得 1 颗骰子`,
    deficitDice: deficit,
    nextUsableCents,
    tip: { business, external: BUSINESS_EXTERNAL[business], ...tips[business] }
  };
}

