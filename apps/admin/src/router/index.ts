import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { MENU_CONFIG, filterMenu, flattenPaths } from '@/config/menu'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无访问权限' },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      // Dashboard（所有登录用户可见）
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '工作台', icon: 'DashboardOutlined' },
      },
      // 教务模块
      {
        path: 'education/trainers',
        name: 'Trainers',
        component: () => import('@/views/education/trainer/index.vue'),
        meta: { title: '导师管理', icon: 'TeamOutlined', module: 'education', perm: ['trainer:view'] },
      },
      {
        path: 'education/courses',
        name: 'Courses',
        component: () => import('@/views/education/course/index.vue'),
        meta: { title: '课程管理', icon: 'ReadOutlined', module: 'education', perm: ['course:view'] },
      },
      {
        path: 'education/checkin',
        name: 'CheckIn',
        component: () => import('@/views/education/checkin/index.vue'),
        meta: { title: '课程签到', icon: 'CheckCircleOutlined', module: 'education', perm: ['checkin:view'] },
      },
      {
        path: 'education/reviews',
        name: 'Reviews',
        component: () => import('@/views/education/review/index.vue'),
        meta: { title: '课程评价', icon: 'StarOutlined', module: 'education', perm: ['review:view'] },
      },
      {
        path: 'education/tasks',
        name: 'Tasks',
        component: () => import('@/views/education/task/index.vue'),
        meta: { title: '任务管理', icon: 'CarryOutOutlined', module: 'education', perm: ['task:view'] },
      },
      {
        path: 'education/materials',
        name: 'Materials',
        component: () => import('@/views/education/material/index.vue'),
        meta: { title: '物料管理', icon: 'AppstoreOutlined', module: 'education', perm: ['material:view'] },
      },
      {
        path: 'education/venues',
        name: 'Venues',
        component: () => import('@/views/education/venue/index.vue'),
        meta: { title: '场地管理', icon: 'HomeOutlined', module: 'education', perm: ['venue:view'] },
      },
      // 销售模块
      {
        path: 'sales/users',
        name: 'Users',
        component: () => import('@/views/sales/user/index.vue'),
        meta: { title: '用户管理', icon: 'UserOutlined', module: 'sales', perm: ['user:view'] },
      },
      {
        path: 'sales/membercards',
        name: 'MemberCards',
        component: () => import('@/views/sales/membercard/index.vue'),
        meta: { title: '会员卡管理', icon: 'IdcardOutlined', module: 'sales', perm: ['membercard:view'] },
      },
      {
        path: 'sales/membercard-products',
        name: 'MemberCardProducts',
        component: () => import('@/views/sales/membercard-product/index.vue'),
        meta: { title: '会员卡商品', icon: 'CreditCardOutlined', module: 'sales', perm: ['membercard:view'] },
      },
      {
        path: 'sales/vouchers',
        name: 'Vouchers',
        component: () => import('@/views/sales/voucher/index.vue'),
        meta: { title: '代金券管理', icon: 'GiftOutlined', module: 'sales', perm: ['voucher:view'] },
      },
      {
        path: 'sales/orders',
        name: 'Orders',
        component: () => import('@/views/sales/order/index.vue'),
        meta: { title: '订单管理', icon: 'ShoppingOutlined', module: 'sales', perm: ['order:view'] },
      },
      // 组织架构（全系统主数据）
      {
        path: 'org/setting',
        name: 'OrgSetting',
        component: () => import('@/views/org/setting/index.vue'),
        meta: { title: '组织架构设置', icon: 'ApartmentOutlined', module: 'org', perm: ['org:view'] },
      },
      // 社群模块（国内版 Skool）
      {
        path: 'community/list',
        name: 'CommunityList',
        component: () => import('@/views/community/list/index.vue'),
        meta: { title: '社群管理', icon: 'TeamOutlined', module: 'community', perm: ['community:view'] },
      },
      {
        path: 'community/events',
        name: 'CommunityEvents',
        component: () => import('@/views/community/events/index.vue'),
        meta: { title: '活动管理', icon: 'CalendarOutlined', module: 'community', perm: ['community:view'] },
      },
      {
        path: 'community/posts',
        name: 'CommunityPosts',
        component: () => import('@/views/community/posts/index.vue'),
        meta: { title: '动态审核', icon: 'AuditOutlined', module: 'community', perm: ['community:view'] },
      },
      // 进销存模块
      {
        path: 'scm/basic',
        name: 'ScmBasic',
        component: () => import('@/views/scm/basic/index.vue'),
        meta: { title: '基础档案', icon: 'ProfileOutlined', module: 'scm', perm: ['scm:po:view'] },
      },
      {
        path: 'scm/purchase-orders',
        name: 'PurchaseOrders',
        component: () => import('@/views/scm/purchase-order/index.vue'),
        meta: { title: '采购订单', icon: 'ShoppingCartOutlined', module: 'scm', perm: ['scm:po:view'] },
      },
      {
        path: 'scm/inbound',
        name: 'Inbound',
        component: () => import('@/views/scm/inbound/index.vue'),
        meta: { title: '验收入库', icon: 'InboxOutlined', module: 'scm', perm: ['scm:inbound:view'] },
      },
      {
        path: 'scm/stock',
        name: 'Stock',
        component: () => import('@/views/scm/stock/index.vue'),
        meta: { title: '库存管理', icon: 'DatabaseOutlined', module: 'scm', perm: ['scm:stock:view'] },
      },
      {
        path: 'scm/adjust',
        name: 'StockAdjust',
        component: () => import('@/views/scm/adjust/index.vue'),
        meta: { title: '库存调整', icon: 'DiffOutlined', module: 'scm', perm: ['scm:stock:view'] },
      },
      // 财务模块
      {
        path: 'finance/dashboard',
        name: 'FinanceDashboard',
        component: () => import('@/views/finance/dashboard/index.vue'),
        meta: { title: '财务看板', icon: 'FundOutlined', module: 'finance', perm: ['finance:dashboard:view'] },
      },
      {
        path: 'finance/revenue',
        name: 'FinanceRevenue',
        component: () => import('@/views/finance/revenue/index.vue'),
        meta: { title: '收入数据源', icon: 'ApiOutlined', module: 'finance', perm: ['finance:revenue:view'] },
      },
      {
        path: 'finance/expenses',
        name: 'FinanceExpenses',
        component: () => import('@/views/finance/expense/index.vue'),
        meta: { title: '月度支出录入', icon: 'PayCircleOutlined', module: 'finance', perm: ['finance:expense:view'] },
      },
      // 系统管理模块
      {
        path: 'system/trainer-level',
        name: 'TrainerLevel',
        component: () => import('@/views/education/trainer-level/index.vue'),
        meta: { title: '导师等级', icon: 'TeamOutlined', module: 'system', perm: ['trainer:view'] },
      },
      {
        path: 'system/settlement',
        name: 'Settlement',
        component: () => import('@/views/system/settlement/index.vue'),
        meta: { title: '结算管理', icon: 'AccountBookOutlined', module: 'system', perm: ['settlement:view'] },
      },
      {
        path: 'system/analytics',
        name: 'Analytics',
        component: () => import('@/views/system/analytics/index.vue'),
        meta: { title: '数据分析', icon: 'LineChartOutlined', module: 'system', perm: ['analytics:view'] },
      },
      {
        path: 'system/rbac',
        name: 'RBAC',
        component: () => import('@/views/system/rbac/index.vue'),
        meta: { title: '权限管理', icon: 'SafetyOutlined', module: 'system', perm: ['rbac:view'] },
      },
      {
        path: 'system/users',
        name: 'SystemUsers',
        component: () => import('@/views/system/system-user/index.vue'),
        meta: { title: '系统用户', icon: 'UserOutlined', module: 'system', perm: ['rbac:view'] },
      },
      {
        path: 'system/dict',
        name: 'Dict',
        component: () => import('@/views/system/dict/index.vue'),
        meta: { title: '值集管理', icon: 'DatabaseOutlined', module: 'system', perm: ['dict:view'] },
      },
      {
        path: 'system/approval-flow',
        name: 'ApprovalFlow',
        component: () => import('@/views/system/approval-flow/index.vue'),
        meta: {
          title: '审批中心',
          icon: 'NodeIndexOutlined',
          module: 'system',
          perm: ['flow:config:view', 'flow:todo:view', 'flow:instance:view'],
        },
      },
      {
        path: 'system/banner',
        name: 'Banner',
        component: () => import('@/views/system/banner/index.vue'),
        meta: { title: '首页Banner', icon: 'PictureOutlined', module: 'system', perm: ['banner:view'] },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

/** 当前身份第一个可访问的菜单路径，供登录落地与 403 兜底使用 */
export function firstAvailablePath(hasAny: (codes: string[]) => boolean): string {
  const visible = filterMenu(MENU_CONFIG, (codes) => hasAny(codes ?? []))
  return flattenPaths(visible)[0] || '/403'
}

/**
 * 路由守卫：登录态 -> 权限画像 -> 页面级权限码
 * 前端拦截只为体验，真正的鉴权在后端 Guard。
 */
router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore()

  if (to.meta?.public) {
    if (auth.isLoggedIn && to.name === 'Login') {
      next('/dashboard')
      return
    }
    next()
    return
  }

  if (!auth.isLoggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  // 首次进入或刷新后拉一次权限画像，失败时放行由 401/403 拦截器处理
  if (!auth.loaded) {
    try {
      await auth.ensureProfile()
    } catch {
      next()
      return
    }
  }

  const perm = to.meta?.perm as string[] | undefined
  if (perm?.length && !auth.hasAny(perm)) {
    next({ name: 'Forbidden' })
    return
  }

  next()
})

export default router
