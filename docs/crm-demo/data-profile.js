/* Full愈 CRM demo · 会员资料、轨迹、消费统计、业务卡、大会员卡产品、积分调整单（合成数据）
 * 2026-11-08 补充：CRM 集中展示会员明文资料与跨业务消费；业务线会员卡在 CRM 只读。
 * 消费统计口径：已支付订单（含购买大会员卡），按业务汇总；金额整数分。
 * monthly：近 12 个自然月到访/下单次数，下标 0 = 2025-12 … 11 = 2026-11。
 */
CRM.MONTHS = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];

const Z = () => Array(12).fill(0);
const M12 = (pairs) => { const a = Z(); Object.entries(pairs).forEach(([i, v]) => { a[+i] = v; }); return a; };

CRM.PROFILE = {
  'FY-2602-008812': {
    call: '小满', city: '上海', source: '时叙 · 门店桌码', tags: ['三业务通', '头疗偏好', '晚间时段'], note: '偏好低咖啡因；头疗喜欢中等力度',
    logins: { sx: '2026-11-07 08:52', ql: '2026-11-06 22:10', zc: '2026-11-05 20:41' },
    stats: {
      sx: { orders: 14, spend: 52400, first: '2026-02-10', last: '2026-11-04', monthly: [0, 0, 2, 1, 1, 2, 1, 1, 1, 2, 1, 2] },
      ql: { orders: 5, spend: 162300, first: '2026-03-12', last: '2026-11-02', monthly: M12({ 3: 1, 5: 1, 6: 1, 10: 1, 11: 1 }) },
      zc: { orders: 3, spend: 37800, first: '2026-10-20', last: '2026-11-05', monthly: M12({ 10: 2, 11: 1 }) }
    },
    bizCards: [{ b: 'zc', name: '在场 课程季卡', no: 'ZC-QK-00931', type: '期限次卡', status: '生效中', valid: '2026-10-20 → 2027-01-20', remain: '剩余 9 / 12 次', synced: '15:28' }]
  },
  'FY-2607-001204': {
    call: '晚晚', city: '上海', source: '在场 · 课程海报', tags: ['课程常客', '周中晚课'], note: '',
    logins: { zc: '2026-11-06 19:58', ql: '2026-11-03 12:20', sx: '2026-09-18 15:40' },
    stats: {
      zc: { orders: 11, spend: 207900, first: '2026-07-15', last: '2026-11-06', monthly: M12({ 7: 3, 8: 2, 9: 2, 10: 2, 11: 2 }) },
      ql: { orders: 3, spend: 72600, first: '2026-08-10', last: '2026-10-12', monthly: M12({ 8: 1, 9: 1, 10: 1 }) },
      sx: { orders: 2, spend: 4800, first: '2026-09-01', last: '2026-09-18', monthly: M12({ 9: 2 }) }
    },
    bizCards: [
      { b: 'zc', name: '在场 课程月卡', no: 'ZC-YK-01288', type: '期限次卡', status: '生效中', valid: '2026-10-25 → 2026-11-24', remain: '剩余 3 / 8 次', synced: '15:28' },
      { b: 'ql', name: '轻疗 疗程次卡（10 次）', no: 'QL-CK-00412', type: '次卡', status: '生效中', valid: '2026-08-10 → 2027-02-10', remain: '剩余 7 / 10 次', synced: '15:29' }
    ]
  },
  'FY-2608-002871': {
    call: '何先生', city: '杭州', source: '时叙 · 朋友分享', tags: ['高客单'], note: '',
    logins: { sx: '2026-10-28 09:10', ql: '2026-11-01 12:20' },
    stats: {
      sx: { orders: 4, spend: 88700, first: '2026-08-02', last: '2026-09-20', monthly: M12({ 8: 2, 9: 2 }) },
      ql: { orders: 1, spend: 62000, first: '2026-11-01', last: '2026-11-01', monthly: M12({ 11: 1 }) }
    },
    bizCards: []
  },
  'FY-2609-003317': {
    call: '一禾', city: '上海', source: '时叙 · 门店桌码', tags: ['新会员', '退卡处理中'], note: '',
    logins: { sx: '2026-11-03 09:10' },
    stats: { sx: { orders: 4, spend: 76700, first: '2026-09-15', last: '2026-11-03', monthly: M12({ 9: 2, 10: 1, 11: 1 }) } },
    bizCards: []
  },
  'FY-2512-000012': {
    call: '阿未', city: '上海', source: '在场 · 老会员', tags: ['年卡已续费', '课程常客'], note: '周一早课固定',
    logins: { zc: '2026-11-06 07:30', sx: '2026-11-06 18:40' },
    stats: {
      zc: { orders: 26, spend: 289800, first: '2025-12-01', last: '2026-11-02', monthly: [4, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 1] },
      sx: { orders: 1, spend: 69900, first: '2026-11-06', last: '2026-11-06', monthly: M12({ 11: 1 }) }
    },
    bizCards: [{ b: 'zc', name: '在场 私教 5 次卡', no: 'ZC-SJ-00077', type: '次卡', status: '生效中', valid: '2026-09-01 → 2027-03-01', remain: '剩余 2 / 5 次', synced: '14:58' }]
  },
  'FY-2605-000927': {
    call: '果果', city: '苏州', source: '轻疗 · 美团', tags: ['价格敏感'], note: '',
    logins: { ql: '2026-11-07 10:35' },
    stats: { ql: { orders: 3, spend: 27000, first: '2026-05-20', last: '2026-11-07', monthly: M12({ 5: 1, 9: 1, 11: 1 }) } },
    bizCards: [{ b: 'ql', name: '轻疗 疗程次卡（10 次）', no: 'QL-CK-00198', type: '次卡', status: '即将到期', valid: '2026-05-30 → 2026-11-30', remain: '剩余 1 / 10 次', synced: '15:29' }]
  },
  'FY-2503-000431': {
    call: '周老师', city: '上海', source: '在场 · 门店', tags: ['年卡到期未续', '流失预警'], note: '',
    logins: { zc: '2026-10-02 08:11' },
    stats: { zc: { orders: 38, spend: 548000, first: '2025-03-08', last: '2026-08-30', monthly: [3, 3, 3, 3, 3, 3, 3, 3, 2, 0, 0, 0] } },
    bizCards: [{ b: 'zc', name: '在场 课程年卡', no: 'ZC-NK-00015', type: '期限卡', status: '已到期', valid: '2024-09-01 → 2025-09-01', remain: '—', synced: '15:28' }]
  },
  'FY-2608-002210': {
    call: '', city: '上海', source: '时叙 · 小程序搜索', tags: ['开卡异常'], note: '',
    logins: { sx: '2026-11-07 11:36' },
    stats: { sx: { orders: 1, spend: 4500, first: '2026-08-20', last: '2026-08-20', monthly: M12({ 8: 1 }) } },
    bizCards: []
  }
};
CRM.MEMBERS.forEach((m) => Object.assign(m, CRM.PROFILE[m.no]));

/* Full愈 大会员卡：产品基础信息统一在 CRM 管理；新版本只对之后的新购生效，已售卡按开卡快照执行 */
CRM.CARD_PRODUCT = {
  code: 'FULLYU_ANNUAL', name: 'Full愈 年度会员', subtitle: '城市微度假 · 时叙 / 轻疗 / 在场通用',
  price: 69900, days: 365, channels: ['sx', 'ql', 'zc'],
  stats: { active: 1032, expiring30: 46, soldMonth: { sx: 41, ql: 57, zc: 36 } },
  benefits: CRM.BENEFIT_SNAPSHOT,
  rules: [
    '一人同一时间只有一张大会员卡；续费新增卡期，从当前最晚到期日开始',
    '哪里卖哪里收款：业务端报价、自有商户收款，支付回调验签后调 CRM 开卡',
    '7 天内（支付当天算第 1 天）且三端均未使用权益：全额退',
    '其余：实付 − 已享优惠（最低 0），财务审批，原售卖业务退款；只退最后一期'
  ],
  versions: [
    { v: 3, at: '2026-10-15 00:00', by: '李沐', change: '在场接入课程会员价 FULLYU_ANNUAL', status: 'CURRENT' },
    { v: 2, at: '2026-03-01 00:00', by: '李沐', change: '轻疗权益改为提前预约 7.8 折 · 当日 8.8 折', status: 'RETIRED' },
    { v: 1, at: '2025-10-01 00:00', by: '周岚', change: '首发：¥699 / 365 天；时叙每杯减 ¥2、轻疗 8.5 折', status: 'RETIRED' }
  ]
};

/* 业务线会员卡目录：各业务系统自有卡种，CRM 只同步基础信息、不提供任何操作（示例卡种，接入时以业务系统为准） */
CRM.BIZ_CARD_PRODUCTS = [
  { b: 'zc', name: '课程月卡', type: '期限次卡', price: 59900, spec: '30 天 · 8 次', holders: 418, synced: '15:28' },
  { b: 'zc', name: '课程季卡', type: '期限次卡', price: 158000, spec: '90 天 · 12 次', holders: 296, synced: '15:28' },
  { b: 'zc', name: '课程年卡', type: '期限卡', price: 498000, spec: '365 天 · 不限次', holders: 61, synced: '15:28' },
  { b: 'zc', name: '私教 5 次卡', type: '次卡', price: 240000, spec: '180 天 · 5 次', holders: 37, synced: '15:28' },
  { b: 'ql', name: '疗程次卡（10 次）', type: '次卡', price: 268000, spec: '180 天 · 10 次', holders: 203, synced: '15:29' },
  { b: 'ql', name: '储值卡', type: '储值', price: 100000, spec: '充 ¥1,000 送 ¥100 · 长期', holders: 155, synced: '15:29' }
];

/* 积分调整单：单笔 ≤ 500 分直接入账；单笔 > 500 分或批量，需另一人（approve:money）审批后执行 */
CRM.ADJ_REASONS = ['客诉补偿', '活动补发', '系统差错更正', '其他'];
CRM.ADJ_LIMIT = 500;
CRM.ADJUSTS = [
  {
    id: 'ADJ-20261107-0002', kind: 'batch', reason: '活动补发', note: '11/01 会员节签到未入账', at: '2026-11-07 11:20',
    by: { code: 'CRM_OPS', name: '李沐' }, status: 'PENDING',
    lines: [{ no: 'FY-2602-008812', delta: 200 }, { no: 'FY-2607-001204', delta: 200 }, { no: 'FY-2608-002871', delta: 200 }]
  },
  {
    id: 'ADJ-20261107-0001', kind: 'single', reason: '客诉补偿', note: '在场 11/02 早课临时取消', at: '2026-11-07 10:05',
    by: { code: 'CRM_CS', name: '赵一' }, status: 'PENDING',
    lines: [{ no: 'FY-2512-000012', delta: 800 }]
  }
];
