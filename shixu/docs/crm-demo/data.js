/* Full愈 CRM demo · 合成数据（全部虚构，不连接任何真实系统）
 * 口径来源：docs/superpowers/specs/2026-11-07-fullyu-crm-design.md
 * 金额一律整数分；积分整数；1 分 = 1 元。
 */
window.CRM = window.CRM || {};

CRM.NOW = '2026-11-07 15:30';
CRM.TODAY = '2026-11-07';

CRM.BIZ = {
  sx: { n: '时叙', c: '#a26843', b: '#f1deca' },
  ql: { n: '轻疗', c: '#46684f', b: '#dde5d9' },
  zc: { n: '在场', c: '#5f5482', b: '#e5e0ee' },
  hq: { n: '总部', c: '#68625b', b: '#eeece6' },
  other: { n: '签到等', c: '#86571d', b: '#f5e8d2' }
};

/* 权限点：各页面按这些权限控制 */
CRM.PERMS = [
  ['member:view', '会员查询与 360'],
  ['member:edit', '修改会员资料（带版本号）'],
  ['adjust:create', '发起单笔积分调整'],
  ['adjust:batch', '发起批量积分调整'],
  ['identity:create', '发起换绑 / 合并'],
  ['approve:money', '审批退卡与积分调整'],
  ['approve:identity', '审批换绑与合并'],
  ['queue:handle', '处理人工队列与对账差异'],
  ['card:edit', '编辑大会员卡（发布新版本）'],
  ['config:edit', '修改规则配置'],
  ['sync:view', '查看三端同步'],
  ['sync:retry', '重投 webhook'],
  ['report:view', '月度对账报表'],
  ['audit:view', '审计日志'],
  ['role:edit', '修改角色权限']
];

CRM.ROLES = {
  ADMIN: { code: 'CRM_ADMIN', name: '周岚', title: '总部管理员', perms: CRM.PERMS.map((p) => p[0]) },
  OPS: { code: 'CRM_OPS', name: '李沐', title: '会员运营', perms: ['member:view', 'member:edit', 'adjust:create', 'adjust:batch', 'card:edit', 'config:edit', 'sync:view', 'sync:retry', 'audit:view'] },
  FINANCE: { code: 'CRM_FINANCE', name: '王宁', title: '财务', perms: ['member:view', 'approve:money', 'queue:handle', 'sync:view', 'report:view', 'audit:view'] },
  CS: { code: 'CRM_CS', name: '赵一', title: '客服', perms: ['member:view', 'member:edit', 'adjust:create', 'identity:create'] }
};

/* 开卡时写入卡期的三端权益快照（之后改配置不影响已售卡） */
CRM.BENEFIT_SNAPSHOT = {
  sx: { text: '每杯减 ¥2', rule: '{"type":"per_cup_off","cents":200}' },
  ql: { text: '提前预约 7.8 折 · 当日 8.8 折', rule: '{"type":"booking_rate","advanceRate":0.78,"sameDayRate":0.88}' },
  zc: { text: '课程会员价（FULLYU_ANNUAL）', rule: '{"type":"course_member_price","memberType":"FULLYU_ANNUAL"}' }
};

CRM.CARD_STATUS = {
  ACTIVE: ['生效中', 'green'], PENDING: ['待生效', 'lilac'], EXPIRED: ['已到期', ''],
  REFUND_LOCKED: ['退卡锁定', 'amber'], REFUNDED: ['已退卡', 'red']
};
CRM.BATCH_STATUS = {
  ACTIVE: ['可用', 'green'], PENDING: ['冷静期', 'lilac'], DEPLETED: ['已用完', ''],
  EXPIRED: ['已过期', 'red'], REVOKED: ['已撤回', 'amber']
};
CRM.LEDGER_TYPE = {
  EARN: '发放', CONSUME: '消耗', RELEASE: '释放', REFUND: '退回', REVOKE: '撤回',
  EXPIRE: '过期', ADJUST: '人工调整', MIGRATE: '迁移'
};

/* 过期规则（沿用轻疗）：1–10 月获得 → 次年 1/1；11–12 月 → 后年 1/1 */
CRM.expireAt = (earned) => {
  const y = +earned.slice(0, 4);
  const m = +earned.slice(5, 7);
  return `${m <= 10 ? y + 1 : y + 2}-01-01`;
};

/* 工具：生成批次 */
const B = (id, biz, ref, earned, amount, remaining, status) => ({
  id, biz, ref, earned, amount, remaining, expire: CRM.expireAt(earned),
  status: status || (remaining > 0 ? 'ACTIVE' : 'DEPLETED')
});

CRM.MEMBERS = [
  {
    no: 'FY-2602-008812', name: '林小满', gender: 2, birthday: '1994-05-18', phone: '13812346620',
    union: 'oU_9f2…a71', status: 'ACTIVE', ver: 7, created: '2026-02-10', biz: ['sx', 'ql', 'zc'], last: '2026-11-05',
    ids: [
      { b: 'sx', local: 'customers#20418', app: '时叙小程序', open: 'oTx3…k21', at: '2026-02-10' },
      { b: 'ql', local: 'c_customer#88213', app: 'wxeb4e…f8', open: 'oQl7…p09', at: '2026-03-12' },
      { b: 'zc', local: 'users#5521', app: 'wxa757…e4', open: 'oZc1…m44', at: '2026-10-20' }
    ],
    alias: ['TH-20418', 'ZC-5521'],
    consents: [
      { v: '2026.11', b: 'ql', at: '2026-10-30 14:02', rev: null },
      { v: '2026.10', b: 'sx', at: '2026-02-10 10:11', rev: null, old: true }
    ],
    periods: [{
      card: 'FYC-26-000318', no: 1, start: '2026-10-30', end: '2027-10-30', status: 'ACTIVE', sold: 'ql',
      order: 'QL-20261030-0042', paid: 69900, paidAt: '2026-10-30 14:06',
      usage: [
        { b: 'zc', order: 'ZC-20261105-0019', saved: 1400, rev: 0, at: '2026-11-05' },
        { b: 'sx', order: 'TH-20261104-0331', saved: 400, rev: 0, at: '2026-11-04' },
        { b: 'ql', order: 'QL-20261102-0117', saved: 6600, rev: 0, at: '2026-11-02' },
        { b: 'sx', order: 'TH-20261101-0088', saved: 200, rev: 0, at: '2026-11-01' }
      ]
    }],
    batches: [
      B('PB-0412', 'sx', 'TH-20261104-0331', '2026-11-04', 80, 80),
      B('PB-0398', 'ql', 'QL-20261102-0117', '2026-11-02', 380, 380),
      B('PB-0355', 'zc', 'ZC-20261020-0088', '2026-10-20', 400, 400),
      B('PB-0107', 'ql', 'QL-20260312-0007', '2026-03-12', 600, 420),
      B('PB-0061', 'sx', 'TH-20260210-0051', '2026-02-10', 200, 0)
    ],
    ledger: [
      { at: '2026-02-10 18:22', type: 'EARN', b: 'sx', ref: 'TH-20260210-0051', delta: 200 },
      { at: '2026-03-12 11:40', type: 'EARN', b: 'ql', ref: 'QL-20260312-0007', delta: 600 },
      { at: '2026-06-20 16:05', type: 'CONSUME', b: 'ql', ref: 'QL-20260620-0210', delta: -380, alloc: 'PB-0061:200 · PB-0107:180' },
      { at: '2026-10-20 20:31', type: 'EARN', b: 'zc', ref: 'ZC-20261020-0088', delta: 400 },
      { at: '2026-11-02 15:12', type: 'EARN', b: 'ql', ref: 'QL-20261102-0117', delta: 380 },
      { at: '2026-11-04 09:48', type: 'EARN', b: 'sx', ref: 'TH-20261104-0331', delta: 80 }
    ],
    dice: {
      left: 12, pos: '起点 · 茶园', lap: 2,
      log: [
        { at: '2026-11-07 09:00', b: 'other', ref: '每日签到', d: 1 },
        { at: '2026-11-06 09:02', b: 'other', ref: '每日签到', d: 1 },
        { at: '2026-11-05 21:10', b: 'zc', ref: 'ZC-20261105-0019', d: 2 },
        { at: '2026-11-04 09:48', b: 'sx', ref: 'TH-20261104-0331', d: 2 },
        { at: '2026-11-02 15:12', b: 'ql', ref: 'QL-20261102-0117', d: 5 },
        { at: '2026-11-01 14:30', b: 'sx', ref: 'TH-20261101-0088', d: 1 }
      ],
      prizes: [
        { id: 'PZ-0007', name: '时叙 · 季节茶包', station: '第 03 站 · 竹林', won: '2026-10-28', where: '时叙任一门店', exp: '2026-12-07', status: 'PENDING' },
        { id: 'PZ-0003', name: '轻疗 · 肩颈加时 10 分钟', station: '第 07 站 · 温泉', won: '2026-10-22', where: '轻疗门店', exp: '2026-11-21', status: 'COLLECTED', by: '轻疗·静安店 陈可（人工确认）', at: '2026-10-25 15:40' }
      ]
    },
    activity: [
      { at: '2026-11-05 21:10', b: 'zc', order: 'ZC-20261105-0019', sum: '周三晚课 · 呼吸与伸展', paid: 12600, note: '年卡省 ¥14' },
      { at: '2026-11-04 09:48', b: 'sx', order: 'TH-20261104-0331', sum: '醒 · 晨间乌龙 ×2', paid: 7600, note: '年卡省 ¥4 · 得 80 分' },
      { at: '2026-11-02 15:12', b: 'ql', order: 'QL-20261102-0117', sum: '头疗 60 分钟（提前预约）', paid: 23400, note: '年卡省 ¥66 · 得 380 分' },
      { at: '2026-11-01 14:30', b: 'sx', order: 'TH-20261101-0088', sum: '松 · 桂花冷萃', paid: 3600, note: '年卡省 ¥2' },
      { at: '2026-10-30 14:06', b: 'ql', order: 'QL-20261030-0042', sum: 'Full愈 年度会员', paid: 69900, note: '开卡 FYC-26-000318' }
    ],
    snap: { sx: { ver: 7, at: '15:29' }, ql: { ver: 7, at: '15:29' }, zc: { ver: 7, at: '14:41' } }
  },
  {
    no: 'FY-2607-001204', name: '苏晚', gender: 2, birthday: '1991-09-02', phone: '13620932093',
    union: 'oU_51c…d02', status: 'ACTIVE', ver: 4, created: '2026-07-15', biz: ['zc', 'ql', 'sx'], last: '2026-11-06',
    ids: [
      { b: 'zc', local: 'users#4310', app: 'wxa757…e4', open: 'oZc8…q12', at: '2026-07-15' },
      { b: 'ql', local: 'c_customer#90122', app: 'wxeb4e…f8', open: 'oQl2…t70', at: '2026-08-10' },
      { b: 'sx', local: 'customers#21877', app: '时叙小程序', open: 'oTx9…c30', at: '2026-09-01' }
    ],
    alias: ['ZC-4310'],
    consents: [{ v: '2026.11', b: 'zc', at: '2026-11-06 19:20', rev: null }],
    periods: [{
      card: 'FYC-26-000117', no: 1, start: '2026-07-15', end: '2027-07-15', status: 'ACTIVE', sold: 'zc',
      order: 'ZC-20260715-0031', paid: 69900, paidAt: '2026-07-15 19:02',
      usage: [
        { b: 'ql', order: 'QL-20261012-0090', saved: 6800, rev: 0, at: '2026-10-12' },
        { b: 'sx', order: 'TH-20260918-0142', saved: 1200, rev: 0, at: '2026-09-18' },
        { b: 'zc', order: 'ZC-20260801-0012', saved: 4800, rev: 0, at: '2026-08-01' }
      ]
    }],
    batches: [
      B('PB-0233', 'ql', 'QL-20260810-0021', '2026-08-10', 440, 440),
      B('PB-0201', 'zc', 'ZC-20260715-0035', '2026-07-15', 500, 500)
    ],
    ledger: [
      { at: '2026-07-15 19:30', type: 'EARN', b: 'zc', ref: 'ZC-20260715-0035', delta: 500 },
      { at: '2026-08-10 13:15', type: 'EARN', b: 'ql', ref: 'QL-20260810-0021', delta: 440 }
    ],
    dice: { left: 4, pos: '第 05 站 · 山居', lap: 1, log: [{ at: '2026-11-06 20:00', b: 'zc', ref: 'ZC-20261106-0040', d: 2 }, { at: '2026-10-12 16:20', b: 'ql', ref: 'QL-20261012-0090', d: 2 }], prizes: [] },
    activity: [
      { at: '2026-11-06 20:00', b: 'zc', order: 'ZC-20261106-0040', sum: '周四晚课 · 正念', paid: 12600, note: '积分抵扣 80 分' },
      { at: '2026-10-12 16:20', b: 'ql', order: 'QL-20261012-0090', sum: '全身舒缓 90 分钟', paid: 24200, note: '年卡省 ¥68' }
    ],
    snap: { sx: { ver: 4, at: '15:29' }, ql: { ver: 4, at: '15:29' }, zc: { ver: 4, at: '14:52' } }
  },
  {
    no: 'FY-2608-002871', name: '何知夏', gender: 1, birthday: '1989-12-11', phone: '15877167716',
    union: 'oU_7aa…190', status: 'ACTIVE', ver: 3, created: '2026-08-02', biz: ['sx', 'ql'], last: '2026-11-01',
    ids: [
      { b: 'sx', local: 'customers#19260', app: '时叙小程序', open: 'oTx1…a88', at: '2026-08-02' },
      { b: 'ql', local: 'c_customer#91004', app: 'wxeb4e…f8', open: 'oQl5…n61', at: '2026-11-01' }
    ],
    alias: ['TH-19260'],
    consents: [{ v: '2026.11', b: 'ql', at: '2026-11-01 12:30', rev: null }],
    periods: [{
      card: 'FYC-26-000204', no: 1, start: '2026-09-03', end: '2027-09-03', status: 'ACTIVE', sold: 'sx',
      order: 'TH-20260903-0410', paid: 69900, paidAt: '2026-09-03 10:20',
      usage: [{ b: 'sx', order: 'TH-20260920-0077', saved: 600, rev: 0, at: '2026-09-20' }]
    }],
    batches: [
      B('PB-0389', 'ql', 'QL-20261101-0008', '2026-11-01', 620, 620),
      B('PB-0260', 'sx', 'TH-20260903-0415', '2026-09-03', 900, 900)
    ],
    ledger: [
      { at: '2026-09-03 10:40', type: 'EARN', b: 'sx', ref: 'TH-20260903-0415', delta: 900 },
      { at: '2026-11-01 12:44', type: 'EARN', b: 'ql', ref: 'QL-20261101-0008', delta: 620 }
    ],
    dice: { left: 6, pos: '第 02 站 · 茶园', lap: 1, log: [{ at: '2026-11-01 12:44', b: 'ql', ref: 'QL-20261101-0008', d: 6 }], prizes: [] },
    activity: [
      { at: '2026-11-01 12:44', b: 'ql', order: 'QL-20261101-0008', sum: '头疗 90 分钟', paid: 62000, note: '得 620 分' },
      { at: '2026-09-20 15:02', b: 'sx', order: 'TH-20260920-0077', sum: '庆 · 气泡茶 ×3', paid: 8400, note: '年卡省 ¥6' }
    ],
    snap: { sx: { ver: 3, at: '15:29' }, ql: { ver: 3, at: '15:29' } }
  },
  {
    no: 'FY-2609-003317', name: '陈一禾', gender: 1, birthday: '', phone: '13911801180',
    union: '—', status: 'ACTIVE', ver: 2, created: '2026-09-15', biz: ['sx'], last: '2026-11-03',
    ids: [{ b: 'sx', local: 'customers#22410', app: '时叙小程序', open: 'oTx6…w05', at: '2026-09-15' }],
    alias: [],
    consents: [{ v: '2026.11', b: 'sx', at: '2026-11-03 09:12', rev: null }],
    periods: [{
      card: 'FYC-26-000361', no: 1, start: '2026-11-03', end: '2027-11-03', status: 'REFUND_LOCKED', sold: 'sx',
      order: 'TH-20261103-0012', paid: 69900, paidAt: '2026-11-03 09:15', usage: [],
      lockNote: '7 天内且未使用权益：全额退，无需审批；已锁卡，等待时叙渠道退款结果后 confirm'
    }],
    batches: [B('PB-0281', 'sx', 'TH-20260915-0203', '2026-09-15', 60, 60)],
    ledger: [{ at: '2026-09-15 17:20', type: 'EARN', b: 'sx', ref: 'TH-20260915-0203', delta: 60 }],
    dice: { left: 1, pos: '起点 · 茶园', lap: 1, log: [{ at: '2026-09-15 17:20', b: 'sx', ref: 'TH-20260915-0203', d: 1 }], prizes: [] },
    activity: [{ at: '2026-11-03 09:15', b: 'sx', order: 'TH-20261103-0012', sum: 'Full愈 年度会员', paid: 69900, note: '开卡后申请退卡' }],
    snap: { sx: { ver: 2, at: '15:29' } }
  },
  {
    no: 'FY-2512-000012', name: '钟未', gender: 2, birthday: '1996-03-27', phone: '18633073307',
    union: 'oU_2be…6f1', status: 'ACTIVE', ver: 5, created: '2025-12-01', biz: ['zc', 'sx'], last: '2026-11-06',
    ids: [
      { b: 'zc', local: 'users#3002', app: 'wxa757…e4', open: 'oZc4…h27', at: '2025-12-01' },
      { b: 'sx', local: 'customers#22981', app: '时叙小程序', open: 'oTx2…r19', at: '2026-11-06' }
    ],
    alias: ['ZC-3002'],
    consents: [{ v: '2026.11', b: 'sx', at: '2026-11-06 18:40', rev: null }],
    periods: [
      {
        card: 'FYC-25-000041', no: 2, start: '2026-12-01', end: '2027-12-01', status: 'PENDING', sold: 'sx',
        order: 'TH-20261106-0021', paid: 69900, paidAt: '2026-11-06 18:44', usage: []
      },
      {
        card: 'FYC-25-000041', no: 1, start: '2025-12-01', end: '2026-12-01', status: 'ACTIVE', sold: 'zc',
        order: 'ZC-20251201-0006', paid: 69900, paidAt: '2025-12-01 20:10',
        usage: [{ b: 'zc', order: 'ZC-2026 共 23 笔', saved: 9200, rev: 0, at: '2025-12 至今' }]
      }
    ],
    batches: [B('PB-0149', 'zc', 'ZC-20260301-0052', '2026-03-01', 330, 330)],
    ledger: [{ at: '2026-03-01 21:00', type: 'EARN', b: 'zc', ref: 'ZC-20260301-0052', delta: 330 }],
    dice: { left: 3, pos: '第 09 站 · 湖畔', lap: 3, log: [{ at: '2026-11-06 18:44', b: 'sx', ref: 'TH-20261106-0030', d: 1 }], prizes: [] },
    activity: [{ at: '2026-11-06 18:44', b: 'sx', order: 'TH-20261106-0021', sum: 'Full愈 年度会员（续费）', paid: 69900, note: '新卡期 12/01 生效' }],
    /* 在场 webhook 故障中：快照落后 1 个版本（三端同步页处理补投） */
    snap: { zc: { ver: 4, at: '14:58', stale: true }, sx: { ver: 5, at: '15:29' } }
  },
  {
    no: 'FY-2605-000927', name: '唐果', gender: null, birthday: '1998-11-21', phone: '13900210021',
    union: '—', status: 'ACTIVE', ver: 2, created: '2026-05-20', biz: ['ql'], last: '2026-11-07',
    ids: [{ b: 'ql', local: 'c_customer#86650', app: 'wxeb4e…f8', open: 'oQl0…b33', at: '2026-05-20' }],
    alias: [],
    consents: [{ v: '2026.10', b: 'ql', at: '2026-05-20 13:02', rev: null, old: true }],
    periods: [],
    batches: [B('PB-0170', 'ql', 'QL-20260520-0044', '2026-05-20', 300, 210)],
    ledger: [
      { at: '2026-05-20 13:10', type: 'EARN', b: 'ql', ref: 'QL-20260520-0044', delta: 300 },
      { at: '2026-09-12 11:05', type: 'CONSUME', b: 'ql', ref: 'QL-20260912-0018', delta: -90, alloc: 'PB-0170:90' }
    ],
    dice: { left: 0, pos: '—', lap: 0, log: [], prizes: [], guest: true },
    activity: [{ at: '2026-11-07 10:41', b: 'ql', order: 'QL-20261107-0301', sum: '肩颈 45 分钟', paid: 9000, note: '积分预占超时（见异常队列）' }],
    snap: { ql: { ver: 2, at: '15:29' } }
  },
  {
    no: 'FY-2503-000431', name: '周以安', gender: 1, birthday: '1985-07-30', phone: '13755125512',
    union: 'oU_3c…e90', status: 'ACTIVE', ver: 3, created: '2025-03-08', biz: ['zc'], last: '2026-10-02',
    ids: [{ b: 'zc', local: 'users#1180', app: 'wxa757…e4', open: 'oZc0…s58', at: '2025-03-08' }],
    alias: ['ZC-1180'],
    consents: [{ v: '2026.10', b: 'zc', at: '2025-03-08 19:44', rev: null, old: true }],
    periods: [{
      card: 'FYC-25-000009', no: 1, start: '2025-10-01', end: '2026-10-01', status: 'EXPIRED', sold: 'zc',
      order: 'ZC-20251001-0002', paid: 69900, paidAt: '2025-10-01 10:00',
      usage: [{ b: 'zc', order: 'ZC-2025/26 共 31 笔', saved: 74200, rev: 0, at: '2025-10 至 2026-09' }]
    }],
    batches: [B('PB-0012', 'zc', 'ZC-20250308-0001', '2025-03-08', 120, 0, 'EXPIRED')],
    ledger: [
      { at: '2025-03-08 20:00', type: 'EARN', b: 'zc', ref: 'ZC-20250308-0001', delta: 120 },
      { at: '2026-01-01 00:05', type: 'EXPIRE', b: 'zc', ref: 'PB-0012', delta: -120 }
    ],
    dice: { left: 0, pos: '—', lap: 0, log: [], prizes: [], guest: true },
    activity: [{ at: '2026-08-30 19:30', b: 'zc', order: 'ZC-20260830-0071', sum: '周日晨课', paid: 12600, note: '年卡省 ¥24' }],
    snap: { zc: { ver: 3, at: '14:30' } }
  },
  {
    no: 'FY-2608-002210', name: '许清', gender: 2, birthday: '', phone: '18800452210',
    union: 'oU_3c…e90', status: 'ACTIVE', ver: 1, created: '2026-08-20', biz: ['sx'], last: '2026-11-07',
    ids: [{ b: 'sx', local: 'customers#21002', app: '时叙小程序', open: 'oTx8…z16', at: '2026-08-20' }],
    alias: ['TH-21002'],
    consents: [{ v: '2026.11', b: 'sx', at: '2026-11-07 11:38', rev: null }],
    periods: [],
    batches: [B('PB-0244', 'sx', 'TH-20260820-0119', '2026-08-20', 45, 45)],
    ledger: [{ at: '2026-08-20 16:12', type: 'EARN', b: 'sx', ref: 'TH-20260820-0119', delta: 45 }],
    dice: { left: 0, pos: '—', lap: 0, log: [], prizes: [], guest: true },
    activity: [{ at: '2026-11-07 11:40', b: 'sx', order: 'TH-20261107-0193', sum: 'Full愈 年度会员', paid: 59900, note: '实付与报价不符，未开卡（见异常队列）' }],
    snap: { sx: { ver: 1, at: '15:29' } }
  }
];

/* 总部汇总（合成）：月度对账与此口径对齐 */
CRM.SUMMARY = {
  members: 12486, newThisMonth: 312, activeCards: 1032, cardsExpiring30: 46,
  pointsOutstanding: 82300, pointsExpiringJan1: 31240,
  sync: {
    sx: { ok: true, pending: 0, last: '15:29:41', note: '快照平均 1 分钟内' },
    ql: { ok: true, pending: 2, last: '15:29:12', note: '2 条投递中' },
    zc: { ok: false, pending: 3, last: '14:58:03', note: 'HTTP 503 · 下次重试 15:58' }
  },
  todo: [
    { n: () => CRM.pendingOf('refund'), label: '退卡审批', desc: '非全额退卡，需财务审批', page: 'approvals/refund', perm: 'approve:money' },
    { n: () => CRM.ADJUSTS.filter((a) => a.status === 'PENDING').length, label: '积分调整审批', desc: '单笔超过 500 分或批量调整，需另一人审批', page: 'adjust', perm: 'approve:money' },
    { n: () => CRM.pendingOf('rebind'), label: '换绑手机号审批', desc: '客服发起，需另一人审批', page: 'approvals/rebind', perm: 'approve:identity' },
    { n: () => CRM.pendingOf('export'), label: '明文导出审批', desc: 'CRM 导出默认脱敏，明文需审批', page: 'approvals/export', perm: 'approve:identity' },
    { n: () => CRM.queueOpen ? CRM.queueOpen('manual') : 0, label: '人工队列', desc: '金额不符 / 预占超时 / 出站超 24h', page: 'queue/manual', perm: 'queue:handle' },
    { n: () => CRM.queueOpen ? CRM.queueOpen('recon') : 0, label: '对账差异', desc: '2026-11-06 日对账未对平', page: 'queue/recon', perm: 'queue:handle' },
    { n: () => CRM.queueOpen ? CRM.queueOpen('identity') : 0, label: '身份冲突', desc: '同一 unionId 指向不同会员，不自动合并', page: 'queue/identity', perm: 'identity:create' }
  ]
};

/* 审计日志（只追加）：审计日志页查看 */
CRM.AUDIT = [
  { at: '2026-11-07 14:52', who: '王宁（CRM_FINANCE）', act: '查看月报', obj: '2026-10 月度对账', detail: '' },
  { at: '2026-11-07 11:03', who: '李沐（CRM_OPS）', act: '修改配置', obj: '积分规则 · 轻疗 v2→v3', detail: '生效 2026-11-08 00:00' }
];
