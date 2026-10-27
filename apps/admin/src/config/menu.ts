/**
 * 侧边菜单配置（PC 侧栏与移动抽屉共用同一份）
 *
 * perm 为该菜单项要求的权限码，任一命中即显示；不写 perm 表示所有登录用户可见。
 * 分组下所有子项都不可见时，整个分组自动隐藏。
 */
export interface MenuLeaf {
  key: string
  title: string
  path: string
  /** 任一命中即可见 */
  perm?: string[]
  /** 是否 Demo（mock 数据）阶段 */
  demo?: boolean
  /** 徽标类型，目前仅审批待办用 */
  badge?: 'approvalPending'
}

export interface MenuGroup {
  key: string
  title: string
  icon: string
  perm?: string[]
  demo?: boolean
  children: MenuLeaf[]
}

export type MenuItem = MenuLeaf | MenuGroup

export function isGroup(item: MenuItem): item is MenuGroup {
  return Array.isArray((item as MenuGroup).children)
}

export const MENU_CONFIG: MenuItem[] = [
  { key: 'dashboard', title: '工作台', path: '/dashboard' } as MenuLeaf & { icon?: string },
  {
    key: 'education',
    title: '教务管理',
    icon: 'ReadOutlined',
    children: [
      { key: 'trainers', title: '导师管理', path: '/education/trainers', perm: ['trainer:view'] },
      { key: 'courses', title: '课程管理', path: '/education/courses', perm: ['course:view'] },
      { key: 'checkin', title: '课程签到', path: '/education/checkin', perm: ['checkin:view'] },
      { key: 'reviews', title: '课程评价', path: '/education/reviews', perm: ['review:view'] },
      { key: 'tasks', title: '任务管理', path: '/education/tasks', perm: ['task:view'] },
      { key: 'materials', title: '物料管理', path: '/education/materials', perm: ['material:view'] },
      { key: 'venues', title: '场地管理', path: '/education/venues', perm: ['venue:view'] },
    ],
  },
  {
    key: 'sales',
    title: '销售管理',
    icon: 'ShopOutlined',
    children: [
      { key: 'users', title: '用户管理', path: '/sales/users', perm: ['user:view'] },
      { key: 'membercards', title: '会员卡管理', path: '/sales/membercards', perm: ['membercard:view'] },
      { key: 'membercard-products', title: '会员卡商品', path: '/sales/membercard-products', perm: ['membercard:view'] },
      { key: 'time-discounts', title: '时段折扣', path: '/sales/time-discounts', perm: ['membercard:view'] },
      { key: 'vouchers', title: '代金券管理', path: '/sales/vouchers', perm: ['voucher:view'] },
      { key: 'orders', title: '订单管理', path: '/sales/orders', perm: ['order:view'] },
    ],
  },
  {
    key: 'scm',
    title: '进销存管理',
    icon: 'ShoppingCartOutlined',
    children: [
      { key: 'scm-basic', title: '基础档案', path: '/scm/basic', perm: ['scm:po:view'] },
      { key: 'purchase-orders', title: '采购订单', path: '/scm/purchase-orders', perm: ['scm:po:view'] },
      { key: 'inbound', title: '验收入库', path: '/scm/inbound', perm: ['scm:inbound:view'] },
      { key: 'stock', title: '库存管理', path: '/scm/stock', perm: ['scm:stock:view'] },
      { key: 'scm-adjust', title: '库存调整', path: '/scm/adjust', perm: ['scm:stock:view'] },
    ],
  },
  {
    key: 'finance',
    title: '财务管理',
    icon: 'FundOutlined',
    children: [
      { key: 'finance-dashboard', title: '全业务财务看板', path: '/finance/dashboard', perm: ['finance:dashboard:view'] },
      { key: 'finance-presence', title: '在场业务看板', path: '/finance/presence', perm: ['finance:presence:view'] },
      { key: 'finance-revenue', title: '收入数据源', path: '/finance/revenue', perm: ['finance:revenue:view'] },
      { key: 'finance-expenses', title: '月度支出录入', path: '/finance/expenses', perm: ['finance:expense:view'] },
    ],
  },
  {
    key: 'org',
    title: '组织架构',
    icon: 'ApartmentOutlined',
    children: [
      { key: 'org-setting', title: '组织架构设置', path: '/org/setting', perm: ['org:view'] },
    ],
  },
  {
    key: 'community',
    title: '社群管理',
    icon: 'TeamOutlined',
    perm: ['community:view'],
    children: [
      { key: 'community-workspace', title: '社群工作台', path: '/community/workspace', perm: ['community:view'] },
      { key: 'community-list', title: '社群管理', path: '/community/list', perm: ['community:view'] },
      { key: 'community-hosts', title: '主理人角色', path: '/community/hosts', perm: ['community:view'] },
      { key: 'community-events', title: '活动管理', path: '/community/events', perm: ['community:view'] },
      { key: 'community-posts', title: '内容治理', path: '/community/posts', perm: ['community:view'] },
    ],
  },
  {
    key: 'system',
    title: '系统管理',
    icon: 'SettingOutlined',
    children: [
      { key: 'trainer-level', title: '导师等级', path: '/system/trainer-level', perm: ['trainer:view'] },
      { key: 'settlement', title: '结算管理', path: '/system/settlement', perm: ['settlement:view'] },
      { key: 'analytics', title: '数据分析', path: '/system/analytics', perm: ['analytics:view'] },
      { key: 'rbac', title: '权限管理', path: '/system/rbac', perm: ['rbac:view'] },
      { key: 'system-users', title: '系统用户', path: '/system/users', perm: ['rbac:view'] },
      { key: 'dict', title: '值集管理', path: '/system/dict', perm: ['dict:view'] },
      {
        key: 'approval-flow',
        title: '审批中心',
        path: '/system/approval-flow',
        perm: ['flow:config:view', 'flow:todo:view', 'flow:instance:view'],
        badge: 'approvalPending',
      },
      { key: 'banner', title: '首页Banner', path: '/system/banner', perm: ['banner:view'] },
    ],
  },
]

/** 按权限过滤菜单；空分组自动剔除 */
export function filterMenu(items: MenuItem[], can: (codes?: string[]) => boolean): MenuItem[] {
  const result: MenuItem[] = []
  for (const item of items) {
    if (isGroup(item)) {
      if (!can(item.perm)) continue
      const children = item.children.filter((leaf) => can(leaf.perm)) as MenuLeaf[]
      if (children.length) result.push({ ...item, children })
    } else if (can(item.perm)) {
      result.push(item)
    }
  }
  return result
}

/** 展平出全部可见叶子路径，登录后决定落地页用 */
export function flattenPaths(items: MenuItem[]): string[] {
  const paths: string[] = []
  for (const item of items) {
    if (isGroup(item)) paths.push(...item.children.map((c) => c.path))
    else paths.push(item.path)
  }
  return paths
}
