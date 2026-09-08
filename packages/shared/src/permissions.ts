/**
 * 权限点与角色定义 —— 前后端唯一来源
 *
 * 后端：prisma/seed.ts 据此写入 permissions 表；@AdminAuth('code') 引用 code。
 * 前端：router meta.perm、v-perm 指令、菜单与页面内 Tab 过滤均引用 code。
 *
 * 命名规范：`模块:资源:动作`（两段式 `模块:动作` 仅保留给历史存量权限点，不再新增）。
 * 四级粒度：
 *   MENU   —— 菜单项 / 整页访问，缺失则菜单隐藏且路由拦截
 *   TAB    —— 页面内标签页，缺失则该 Tab 不渲染
 *   ACTION —— 按钮动作，缺失则按钮不渲染（后端同时校验）
 *   FIELD  —— 敏感数据块（金额、成本、利润），缺失则该列/卡片不渲染且接口不返回
 */

export type PermLevel = 'MENU' | 'TAB' | 'ACTION' | 'FIELD'

export interface PermissionDef {
  code: string
  name: string
  module: string
  level: PermLevel
  /** 同模块内的折叠分组名，用于权限树展示 */
  group: string
}

/** 模块中文名，权限树一级节点 */
export const PERMISSION_MODULES: { key: string; name: string }[] = [
  { key: 'education', name: '教务管理' },
  { key: 'sales', name: '运营销售' },
  { key: 'org', name: '组织架构' },
  { key: 'scm', name: '进销存' },
  { key: 'finance', name: '财务' },
  { key: 'flow', name: '审批流' },
  { key: 'system', name: '系统设置' },
]

export const PERM_LEVEL_NAMES: Record<PermLevel, string> = {
  MENU: '菜单/页面',
  TAB: '标签页',
  ACTION: '按钮动作',
  FIELD: '敏感数据',
}

/**
 * 数据行级可见范围。按产品决策，仅作用于按组织核算的模块（进销存 / 财务 / 组织架构），
 * 教务与运营销售模块不做行级隔离。
 */
export type DataScope = 'ALL' | 'OWN_AND_SUB' | 'OWN' | 'SELF'

export const DATA_SCOPES: { value: DataScope; name: string; desc: string }[] = [
  { value: 'ALL', name: '全部组织', desc: '可见集团下所有组织的单据与报表' },
  { value: 'OWN_AND_SUB', name: '本组织及下级', desc: '如子公司负责人可见本公司及其下属门店' },
  { value: 'OWN', name: '仅本组织', desc: '只能看到自己所属组织的数据' },
  { value: 'SELF', name: '仅本人创建', desc: '只能看到自己提交的单据' },
]

// ============ 权限点全集 ============

export const PERMISSIONS: PermissionDef[] = [
  // ===== 教务管理 =====
  { code: 'course:view', name: '课程查看', module: 'education', level: 'MENU', group: '课程' },
  { code: 'course:create', name: '课程创建', module: 'education', level: 'ACTION', group: '课程' },
  { code: 'course:update', name: '课程编辑', module: 'education', level: 'ACTION', group: '课程' },
  { code: 'course:delete', name: '课程删除', module: 'education', level: 'ACTION', group: '课程' },
  { code: 'waitlist:manage', name: '候补队列管理', module: 'education', level: 'ACTION', group: '课程' },
  { code: 'trainer:view', name: '导师查看', module: 'education', level: 'MENU', group: '导师' },
  { code: 'trainer:create', name: '导师创建', module: 'education', level: 'ACTION', group: '导师' },
  { code: 'trainer:update', name: '导师编辑', module: 'education', level: 'ACTION', group: '导师' },
  { code: 'venue:view', name: '场地查看', module: 'education', level: 'MENU', group: '场地' },
  { code: 'venue:create', name: '场地创建', module: 'education', level: 'ACTION', group: '场地' },
  { code: 'venue:update', name: '场地编辑', module: 'education', level: 'ACTION', group: '场地' },
  { code: 'venue:delete', name: '场地删除', module: 'education', level: 'ACTION', group: '场地' },
  { code: 'checkin:view', name: '签到查看', module: 'education', level: 'MENU', group: '签到与评价' },
  { code: 'checkin:create', name: '手工签到', module: 'education', level: 'ACTION', group: '签到与评价' },
  { code: 'review:view', name: '评价查看', module: 'education', level: 'MENU', group: '签到与评价' },
  { code: 'review:delete', name: '评价删除', module: 'education', level: 'ACTION', group: '签到与评价' },

  // ===== 运营销售 =====
  { code: 'voucher:view', name: '代金券查看', module: 'sales', level: 'MENU', group: '代金券' },
  { code: 'voucher:create', name: '代金券发放', module: 'sales', level: 'ACTION', group: '代金券' },
  { code: 'voucher:update', name: '代金券管理', module: 'sales', level: 'ACTION', group: '代金券' },
  { code: 'task:view', name: '任务查看', module: 'sales', level: 'MENU', group: '任务与物料' },
  { code: 'task:create', name: '任务发布', module: 'sales', level: 'ACTION', group: '任务与物料' },
  { code: 'task:update', name: '任务编辑', module: 'sales', level: 'ACTION', group: '任务与物料' },
  { code: 'material:view', name: '物料查看', module: 'sales', level: 'MENU', group: '任务与物料' },
  { code: 'material:create', name: '物料创建', module: 'sales', level: 'ACTION', group: '任务与物料' },
  { code: 'material:update', name: '物料编辑', module: 'sales', level: 'ACTION', group: '任务与物料' },
  { code: 'material:delete', name: '物料删除', module: 'sales', level: 'ACTION', group: '任务与物料' },
  { code: 'settlement:view', name: '结算查看', module: 'sales', level: 'MENU', group: '结算' },
  { code: 'settlement:create', name: '结算生成', module: 'sales', level: 'ACTION', group: '结算' },
  { code: 'analytics:view', name: '数据分析', module: 'sales', level: 'MENU', group: '数据' },
  { code: 'upload:create', name: '文件上传', module: 'sales', level: 'ACTION', group: '数据' },
  { code: 'membercard:view', name: '会员卡查看', module: 'sales', level: 'MENU', group: '会员卡' },
  { code: 'membercard:create', name: '会员卡商品创建', module: 'sales', level: 'ACTION', group: '会员卡' },
  { code: 'membercard:update', name: '会员卡管理', module: 'sales', level: 'ACTION', group: '会员卡' },
  { code: 'order:view', name: '订单查看', module: 'sales', level: 'MENU', group: '订单与用户' },
  { code: 'order:update', name: '订单管理', module: 'sales', level: 'ACTION', group: '订单与用户' },
  { code: 'order:refund', name: '订单强制退款', module: 'sales', level: 'ACTION', group: '订单与用户' },
  { code: 'user:view', name: '用户查看', module: 'sales', level: 'MENU', group: '订单与用户' },
  { code: 'user:update', name: '用户管理', module: 'sales', level: 'ACTION', group: '订单与用户' },

  // ===== 组织架构 =====
  { code: 'org:view', name: '组织架构查看', module: 'org', level: 'MENU', group: '组织架构' },
  { code: 'org:create', name: '新增组织节点', module: 'org', level: 'ACTION', group: '组织架构' },
  { code: 'org:update', name: '编辑组织节点', module: 'org', level: 'ACTION', group: '组织架构' },
  { code: 'org:delete', name: '删除组织节点', module: 'org', level: 'ACTION', group: '组织架构' },
  { code: 'org:rate', name: '管理费/培训费比例（敏感）', module: 'org', level: 'FIELD', group: '组织架构' },

  // ===== 进销存 =====
  { code: 'scm:po:view', name: '采购订单查看', module: 'scm', level: 'MENU', group: '采购订单' },
  { code: 'scm:po:create', name: '发起采购申请', module: 'scm', level: 'ACTION', group: '采购订单' },
  { code: 'scm:po:update', name: '编辑采购订单', module: 'scm', level: 'ACTION', group: '采购订单' },
  { code: 'scm:po:cancel', name: '作废采购订单', module: 'scm', level: 'ACTION', group: '采购订单' },
  { code: 'scm:po:price', name: '采购单价与金额（敏感）', module: 'scm', level: 'FIELD', group: '采购订单' },
  { code: 'scm:inbound:view', name: '验收入库查看', module: 'scm', level: 'MENU', group: '验收入库' },
  { code: 'scm:inbound:create', name: '执行验收入库', module: 'scm', level: 'ACTION', group: '验收入库' },
  { code: 'scm:stock:view', name: '库存查看', module: 'scm', level: 'MENU', group: '库存' },
  { code: 'scm:stock:adjust', name: '库存调整', module: 'scm', level: 'ACTION', group: '库存' },
  { code: 'scm:stock:cost', name: '库存成本金额（敏感）', module: 'scm', level: 'FIELD', group: '库存' },

  // ===== 财务 =====
  { code: 'finance:dashboard:view', name: '财务看板访问', module: 'finance', level: 'MENU', group: '财务看板' },
  { code: 'finance:dashboard:profit', name: '利润与成本明细（敏感）', module: 'finance', level: 'FIELD', group: '财务看板' },
  { code: 'finance:dashboard:export', name: '看板导出', module: 'finance', level: 'ACTION', group: '财务看板' },
  { code: 'finance:revenue:view', name: '收入数据源访问', module: 'finance', level: 'MENU', group: '收入' },
  { code: 'finance:revenue:sync', name: '手动触发抽取', module: 'finance', level: 'ACTION', group: '收入' },
  { code: 'finance:revenue:import', name: '手工导入收入', module: 'finance', level: 'ACTION', group: '收入' },
  { code: 'finance:expense:view', name: '支出台账查看', module: 'finance', level: 'MENU', group: '支出' },
  { code: 'finance:expense:create', name: '录入支出', module: 'finance', level: 'ACTION', group: '支出' },
  { code: 'finance:expense:update', name: '编辑支出', module: 'finance', level: 'ACTION', group: '支出' },
  { code: 'finance:expense:delete', name: '删除支出', module: 'finance', level: 'ACTION', group: '支出' },
  { code: 'finance:expense:import', name: '批量导入支出', module: 'finance', level: 'ACTION', group: '支出' },

  // ===== 审批流 =====
  { code: 'flow:config:view', name: '流程配置（标签页）', module: 'flow', level: 'TAB', group: '流程配置' },
  { code: 'flow:config:edit', name: '新建/编辑审批流', module: 'flow', level: 'ACTION', group: '流程配置' },
  { code: 'flow:config:toggle', name: '启用/停用审批流', module: 'flow', level: 'ACTION', group: '流程配置' },
  { code: 'flow:todo:view', name: '审批待办（标签页）', module: 'flow', level: 'TAB', group: '审批待办' },
  { code: 'flow:todo:approve', name: '同意/驳回审批', module: 'flow', level: 'ACTION', group: '审批待办' },
  { code: 'flow:instance:view', name: '审批记录（标签页）', module: 'flow', level: 'TAB', group: '审批记录' },

  // ===== 系统设置 =====
  { code: 'rbac:view', name: '权限查看', module: 'system', level: 'MENU', group: '权限管理' },
  { code: 'rbac:create', name: '权限创建', module: 'system', level: 'ACTION', group: '权限管理' },
  { code: 'rbac:update', name: '权限编辑', module: 'system', level: 'ACTION', group: '权限管理' },
  { code: 'rbac:delete', name: '权限删除', module: 'system', level: 'ACTION', group: '权限管理' },
  { code: 'rbac:scope', name: '配置角色数据范围（敏感）', module: 'system', level: 'ACTION', group: '权限管理' },
  { code: 'dict:view', name: '值集查看', module: 'system', level: 'MENU', group: '值集' },
  { code: 'dict:create', name: '值集创建', module: 'system', level: 'ACTION', group: '值集' },
  { code: 'dict:update', name: '值集编辑', module: 'system', level: 'ACTION', group: '值集' },
  { code: 'dict:delete', name: '值集删除', module: 'system', level: 'ACTION', group: '值集' },
  { code: 'banner:view', name: '首页Banner查看', module: 'system', level: 'MENU', group: 'Banner' },
  { code: 'banner:manage', name: '首页Banner管理', module: 'system', level: 'ACTION', group: 'Banner' },

  // ===== 社群（国内版 Skool） =====
  { code: 'community:view', name: '社群管理查看', module: 'community', level: 'MENU', group: '社群管理' },
  { code: 'community:manage', name: '社群管理操作（创建/编辑/审核）', module: 'community', level: 'ACTION', group: '社群管理' },
]

/** 全部权限码，便于超管或校验 */
export const ALL_PERMISSION_CODES = PERMISSIONS.map((p) => p.code)

const codesOf = (predicate: (p: PermissionDef) => boolean) =>
  PERMISSIONS.filter(predicate).map((p) => p.code)

/** 某模块全部权限 */
const moduleAll = (...modules: string[]) => codesOf((p) => modules.includes(p.module))

/** 某模块只读（MENU + TAB，不含敏感字段与动作） */
const moduleReadonly = (...modules: string[]) =>
  codesOf((p) => modules.includes(p.module) && (p.level === 'MENU' || p.level === 'TAB'))

// ============ 内置角色 ============

/**
 * 门店店长的基础权限。分公司负责人是店长的超集，共用这份清单，
 * 避免两边各维护一份后逐渐走差。
 */
const STORE_MANAGER_PERMISSIONS = [
  'org:view',
  'scm:po:view',
  'scm:po:create',
  'scm:inbound:view',
  'scm:inbound:create',
  'scm:stock:view',
  'finance:dashboard:view',
  'finance:revenue:view',
  'finance:expense:view',
  'finance:expense:create',
  'flow:todo:view',
  'flow:instance:view',
  'course:view',
  'checkin:view',
  'checkin:create',
  'order:view',
  'user:view',
]

export interface BuiltinRoleDef {
  /** 角色标识，与 roles.name 一致 */
  name: string
  label: string
  description: string
  dataScope: DataScope
  /** 权限码列表；'*' 表示全部 */
  permissions: string[]
}

export const BUILTIN_ROLES: BuiltinRoleDef[] = [
  {
    name: 'SUPER_ADMIN',
    label: '超级管理员',
    description: '拥有全部权限与全部组织数据，不受任何限制',
    dataScope: 'ALL',
    permissions: ['*'],
  },
  {
    name: 'HQ_FINANCE',
    label: '总部财务',
    description: '财务模块全部权限、进销存查看（含金额）、审批待办处理，可见全部组织',
    dataScope: 'ALL',
    permissions: [
      ...moduleAll('finance'),
      'scm:po:view',
      'scm:po:price',
      'scm:inbound:view',
      'scm:stock:view',
      'scm:stock:cost',
      'org:view',
      'org:rate',
      'flow:config:view',
      'flow:todo:view',
      'flow:todo:approve',
      'flow:instance:view',
      'settlement:view',
      'settlement:create',
      'analytics:view',
    ],
  },
  {
    name: 'HQ_PURCHASE',
    label: '总部采购',
    description: '进销存全部权限与审批处理，可见全部组织；不可见财务利润',
    dataScope: 'ALL',
    permissions: [
      ...moduleAll('scm'),
      'org:view',
      'flow:config:view',
      'flow:todo:view',
      'flow:todo:approve',
      'flow:instance:view',
    ],
  },
  {
    name: 'HQ_OPERATION',
    label: '总部运营',
    description: '教务与运营销售全部权限，不涉及财务与进销存',
    dataScope: 'ALL',
    permissions: [...moduleAll('education', 'sales')],
  },
  {
    name: 'BRANCH_MANAGER',
    label: '分公司负责人',
    description:
      '本公司及下属门店：店长全部能力，额外可审批待办并查看采购金额；不可见利润明细',
    dataScope: 'OWN_AND_SUB',
    permissions: [
      ...STORE_MANAGER_PERMISSIONS,
      // 分公司负责人是审批流里「所属分公司负责人」节点的审批人，没有这两个权限
      // 他就只能看到待办却无法表态、也看不到所审采购单的金额
      'flow:todo:approve',
      'scm:po:price',
    ],
  },
  {
    name: 'STORE_MANAGER',
    label: '门店店长',
    description: '本店及下级：可发起采购、验收入库、查看库存与本店收支；看不到利润明细与采购成本价',
    dataScope: 'OWN_AND_SUB',
    permissions: [...STORE_MANAGER_PERMISSIONS],
  },
  {
    name: 'STORE_STAFF',
    label: '门店员工',
    description: '仅本组织：课程签到与基础查看，无任何财务与采购权限',
    dataScope: 'OWN',
    permissions: ['course:view', 'checkin:view', 'checkin:create', 'review:view', 'user:view'],
  },
  {
    name: 'AUDITOR',
    label: '只读审计',
    description: '全部模块只读（含敏感金额），不能做任何写操作',
    dataScope: 'ALL',
    permissions: [
      ...moduleReadonly('education', 'sales', 'org', 'scm', 'finance', 'flow', 'system'),
      'org:rate',
      'scm:po:price',
      'scm:stock:cost',
      'finance:dashboard:profit',
    ],
  },
]

// ============ 判定工具（前后端共用） ============

/**
 * 判断权限集合是否命中所需权限码。
 * - 持有 '*' 视为全部通过
 * - 支持前缀通配，如持有 'scm:*' 命中 'scm:po:view'
 */
export function hasPermission(owned: string[] | undefined, required: string): boolean {
  if (!owned || !owned.length) return false
  if (owned.includes('*')) return true
  if (owned.includes(required)) return true
  return owned.some((code) => {
    if (!code.endsWith(':*')) return false
    return required.startsWith(code.slice(0, -1))
  })
}

/** 满足任意一个即通过 */
export function hasAnyPermission(owned: string[] | undefined, required: string[]): boolean {
  if (!required.length) return true
  return required.some((code) => hasPermission(owned, code))
}

/** 必须全部满足 */
export function hasAllPermissions(owned: string[] | undefined, required: string[]): boolean {
  if (!required.length) return true
  return required.every((code) => hasPermission(owned, code))
}

/**
 * 首页工作台的可渲染块。
 *
 * 首页是所有角色的落地页，不能整页挂一个权限门，否则缺该权限的人一登录就满屏报错。
 * 改成每块各自判权限：后端据此决定查不查库，前端据此决定渲不渲染，两边共用这一份定义。
 */
export interface WorkbenchBlocks {
  courses: boolean
  venues: boolean
  orders: boolean
  stock: boolean
  revenue: boolean
}

export function resolveWorkbenchBlocks(owned: string[] | undefined): WorkbenchBlocks {
  return {
    courses: hasPermission(owned, 'course:view'),
    venues: hasPermission(owned, 'venue:view'),
    orders: hasPermission(owned, 'order:view'),
    stock: hasPermission(owned, 'scm:stock:view'),
    revenue: hasPermission(owned, 'finance:dashboard:view'),
  }
}

/** 多角色取最宽松的数据范围 */
const SCOPE_WEIGHT: Record<DataScope, number> = { ALL: 4, OWN_AND_SUB: 3, OWN: 2, SELF: 1 }

export function widestDataScope(scopes: DataScope[]): DataScope {
  if (!scopes.length) return 'SELF'
  return scopes.reduce((acc, cur) => (SCOPE_WEIGHT[cur] > SCOPE_WEIGHT[acc] ? cur : acc), scopes[0])
}
