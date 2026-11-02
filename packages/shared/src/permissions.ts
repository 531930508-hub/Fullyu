export const PERMISSION_MODULES = [
  { key: 'dashboard', name: '经营数据' },
  { key: 'finance', name: '财务' },
  { key: 'product', name: '商品与配方' },
  { key: 'store', name: '门店与库存' },
  { key: 'order', name: '订单与退款' },
  { key: 'loss', name: '报损与损耗' },
  { key: 'approval', name: '审批' },
  { key: 'coupon', name: '会员与券' },
  { key: 'rbac', name: '账号与权限' },
  { key: 'log', name: '操作记录' }
] as const;

/** 33 个权限点；level: MENU=页面可见 / ACTION=操作 / FIELD=敏感字段。 */
export const PERMISSIONS = [
  { code: 'dashboard:view', name: '经营概览', module: 'dashboard', level: 'MENU' },
  { code: 'dashboard:profit', name: '利润与成本（敏感）', module: 'dashboard', level: 'FIELD' },
  { code: 'finance:view', name: '财务流水', module: 'finance', level: 'MENU' },
  { code: 'finance:export', name: '导出流水', module: 'finance', level: 'ACTION' },
  { code: 'finance:expense', name: '录入与导入运营费用', module: 'finance', level: 'ACTION' },
  { code: 'product:view', name: '商品目录', module: 'product', level: 'MENU' },
  { code: 'product:edit', name: '编辑商品与分类', module: 'product', level: 'ACTION' },
  { code: 'product:price', name: '查看与调整售价（敏感）', module: 'product', level: 'FIELD' },
  { code: 'product:publish', name: '上架 / 下架', module: 'product', level: 'ACTION' },
  { code: 'mapping:view', name: '原料 SKU 映射', module: 'product', level: 'MENU' },
  { code: 'mapping:edit', name: '维护原料映射', module: 'product', level: 'ACTION' },
  { code: 'store:config', name: '门店与渠道配置', module: 'store', level: 'MENU' },
  { code: 'store:config:edit', name: '修改门店与渠道', module: 'store', level: 'ACTION' },
  { code: 'store:stock', name: '本店库存与售罄', module: 'store', level: 'ACTION' },
  { code: 'store:device', name: '本店设备', module: 'store', level: 'MENU' },
  { code: 'pos:use', name: '营业台与代点', module: 'order', level: 'MENU' },
  { code: 'retail:handover', name: '零售实物交付', module: 'order', level: 'ACTION' },
  { code: 'order:view', name: '订单查看', module: 'order', level: 'MENU' },
  { code: 'order:refund', name: '限额内直接退款', module: 'order', level: 'ACTION' },
  { code: 'order:refund:request', name: '发起退款申请', module: 'order', level: 'ACTION' },
  { code: 'order:refund:approve', name: '审批退款', module: 'order', level: 'ACTION' },
  { code: 'loss:view', name: '总部报损与损耗', module: 'loss', level: 'MENU' },
  { code: 'loss:report', name: '门店登记报损', module: 'loss', level: 'ACTION' },
  { code: 'loss:approve', name: '审批超限报损', module: 'loss', level: 'ACTION' },
  { code: 'loss:config', name: '报损规则与预警线', module: 'loss', level: 'ACTION' },
  { code: 'approval:view', name: '审批中心', module: 'approval', level: 'MENU' },
  { code: 'approval:config', name: '审批流配置', module: 'approval', level: 'ACTION' },
  { code: 'coupon:view', name: '优惠券与发券记录', module: 'coupon', level: 'MENU' },
  { code: 'coupon:manage', name: '创建与发放优惠券', module: 'coupon', level: 'ACTION' },
  { code: 'rbac:view', name: '权限管理', module: 'rbac', level: 'MENU' },
  { code: 'rbac:edit', name: '维护账号与角色', module: 'rbac', level: 'ACTION' },
  { code: 'rbac:scope', name: '配置数据范围（敏感）', module: 'rbac', level: 'FIELD' },
  { code: 'log:view', name: '操作记录', module: 'log', level: 'MENU' }
] as const;

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code);

export type RoleTemplate = {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  scope: 'ALL' | 'STORES';
  perms: string[];
};

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'r-super',
    name: '超级管理员',
    description: '全部权限与全部门店，仅用于系统管理',
    builtin: true,
    scope: 'ALL',
    perms: ['*']
  },
  {
    id: 'r-finance',
    name: '总部财务',
    description: '财务流水、运营费用、退款与报损审批、全部门店经营数据',
    builtin: true,
    scope: 'ALL',
    perms: [
      'dashboard:view', 'dashboard:profit', 'finance:view', 'finance:export',
      'finance:expense', 'order:view', 'order:refund:approve', 'loss:view',
      'loss:approve', 'approval:view', 'approval:config', 'coupon:view', 'log:view'
    ]
  },
  {
    id: 'r-ops',
    name: '总部运营',
    description: '商品、分类、映射、门店配置、报损规则与经营数据，不含财务',
    builtin: true,
    scope: 'ALL',
    perms: [
      'dashboard:view', 'product:view', 'product:edit', 'product:price',
      'product:publish', 'mapping:view', 'mapping:edit', 'store:config',
      'store:config:edit', 'order:view', 'loss:view', 'loss:approve',
      'loss:config', 'approval:view', 'coupon:view', 'coupon:manage', 'log:view'
    ]
  },
  {
    id: 'r-region',
    name: '区域店长',
    description: '授权门店的营业、库存、报损与限额内退款',
    builtin: true,
    scope: 'STORES',
    perms: [
      'dashboard:view', 'pos:use', 'retail:handover', 'order:view',
      'order:refund', 'order:refund:request', 'store:stock', 'store:device',
      'loss:report', 'log:view'
    ]
  },
  {
    id: 'r-manager',
    name: '门店店长',
    description: '单店日常营业、库存、报损与限额内退款',
    builtin: true,
    scope: 'STORES',
    perms: [
      'dashboard:view', 'pos:use', 'retail:handover', 'order:view',
      'order:refund', 'order:refund:request', 'store:stock', 'store:device',
      'loss:report', 'log:view'
    ]
  },
  {
    id: 'r-staff',
    name: '门店店员',
    description: '营业台、代点、零售交付与订单查看，退款需申请',
    builtin: true,
    scope: 'STORES',
    perms: ['pos:use', 'retail:handover', 'order:view', 'order:refund:request']
  },
  {
    id: 'r-audit',
    name: '只读审计',
    description: '全部页面只读，含金额、报损与审批记录，不能操作',
    builtin: true,
    scope: 'ALL',
    perms: [
      'dashboard:view', 'dashboard:profit', 'finance:view', 'product:view',
      'mapping:view', 'store:config', 'order:view', 'loss:view',
      'approval:view', 'coupon:view', 'rbac:view', 'log:view'
    ]
  }
];

/** admin 路由 → 所需权限（admin 统一后台：总部页面与平板营业台同一套）。 */
export const PAGE_PERM = {
  workbench: 'pos:use',
  pos: 'pos:use',
  retail: 'retail:handover',
  orders: 'order:view',
  inventory: 'store:stock',
  losses: 'loss:report',
  devices: 'store:device',
  overview: 'dashboard:view',
  finance: 'finance:view',
  expenses: 'finance:expense',
  profit: 'dashboard:profit',
  approvals: 'approval:view',
  coupons: 'coupon:view',
  lossReview: 'loss:view',
  products: 'product:view',
  mappings: 'mapping:view',
  stores: 'store:config',
  staff: 'rbac:view',
  logs: 'log:view'
} as const;

export type PageKey = keyof typeof PAGE_PERM;
