import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      // Dashboard
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
        meta: { title: '导师管理', icon: 'TeamOutlined', module: 'education' },
      },
      {
        path: 'education/courses',
        name: 'Courses',
        component: () => import('@/views/education/course/index.vue'),
        meta: { title: '课程管理', icon: 'ReadOutlined', module: 'education' },
      },
      {
        path: 'education/checkin',
        name: 'CheckIn',
        component: () => import('@/views/education/checkin/index.vue'),
        meta: { title: '课程签到', icon: 'CheckCircleOutlined', module: 'education' },
      },
      {
        path: 'education/reviews',
        name: 'Reviews',
        component: () => import('@/views/education/review/index.vue'),
        meta: { title: '课程评价', icon: 'StarOutlined', module: 'education' },
      },
      {
        path: 'education/tasks',
        name: 'Tasks',
        component: () => import('@/views/education/task/index.vue'),
        meta: { title: '任务管理', icon: 'CarryOutOutlined', module: 'education' },
      },
      {
        path: 'education/materials',
        name: 'Materials',
        component: () => import('@/views/education/material/index.vue'),
        meta: { title: '物料管理', icon: 'AppstoreOutlined', module: 'education' },
      },
      {
        path: 'education/venues',
        name: 'Venues',
        component: () => import('@/views/education/venue/index.vue'),
        meta: { title: '场地管理', icon: 'HomeOutlined', module: 'education' },
      },
      // 销售模块
      {
        path: 'sales/users',
        name: 'Users',
        component: () => import('@/views/sales/user/index.vue'),
        meta: { title: '用户管理', icon: 'UserOutlined', module: 'sales' },
      },
      {
        path: 'sales/membercards',
        name: 'MemberCards',
        component: () => import('@/views/sales/membercard/index.vue'),
        meta: { title: '会员卡管理', icon: 'IdcardOutlined', module: 'sales' },
      },
      {
        path: 'sales/membercard-products',
        name: 'MemberCardProducts',
        component: () => import('@/views/sales/membercard-product/index.vue'),
        meta: { title: '会员卡商品', icon: 'CreditCardOutlined', module: 'sales' },
      },
      {
        path: 'sales/vouchers',
        name: 'Vouchers',
        component: () => import('@/views/sales/voucher/index.vue'),
        meta: { title: '代金券管理', icon: 'GiftOutlined', module: 'sales' },
      },
      {
        path: 'sales/orders',
        name: 'Orders',
        component: () => import('@/views/sales/order/index.vue'),
        meta: { title: '订单管理', icon: 'ShoppingOutlined', module: 'sales' },
      },
      // 系统管理模块
      {
        path: 'system/settlement',
        name: 'Settlement',
        component: () => import('@/views/system/settlement/index.vue'),
        meta: { title: '结算管理', icon: 'AccountBookOutlined', module: 'system' },
      },
      {
        path: 'system/analytics',
        name: 'Analytics',
        component: () => import('@/views/system/analytics/index.vue'),
        meta: { title: '数据分析', icon: 'LineChartOutlined', module: 'system' },
      },
      {
        path: 'system/rbac',
        name: 'RBAC',
        component: () => import('@/views/system/rbac/index.vue'),
        meta: { title: '权限管理', icon: 'SafetyOutlined', module: 'system' },
      },
      {
        path: 'system/dict',
        name: 'Dict',
        component: () => import('@/views/system/dict/index.vue'),
        meta: { title: '值集管理', icon: 'DatabaseOutlined', module: 'system' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// 路由守卫：校验登录态
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('admin_token')
  if (to.meta?.public) {
    // 已登录访问登录页则跳工作台
    if (token && to.name === 'Login') {
      next('/dashboard')
      return
    }
    next()
    return
  }
  if (!token) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }
  next()
})

export default router
