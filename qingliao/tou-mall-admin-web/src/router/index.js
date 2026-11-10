import Vue from 'vue'
import Router from 'vue-router'

Vue.use(Router)

/* Layout */
import Layout from '../views/layout/Layout'

/**
 * hidden: true                   if `hidden:true` will not show in the sidebar(default is false)
 * alwaysShow: true               if set true, will always show the root menu, whatever its child routes length
 *                                if not set alwaysShow, only more than one route under the children
 * it will becomes nested mode, otherwise not show the root menu
 * redirect: noredirect           if `redirect:noredirect` will not redirct in the breadcrumb
 * name:'router-name'             the name is used by <keep-alive> (must set!!!)
 * meta : {
    title: 'title'               the name show in submenu and breadcrumb (recommend set)
    icon: 'svg-name'             the icon show in the sidebar,
    subGroup: '小标题'            同一分组内按小标题分段展示（侧边栏用 el-menu-item-group 渲染）
  }
 **/
export const constantRouterMap = [
  {path: '/login', component: () => import('@/views/login/index'), hidden: true},
  {path: '/hebing', component: () => import('@/views/hebing/hebing'), hidden: true},
  {path: '/my-rewards', component: () => import('@/views/incentive/mobile/index'), hidden: true},
  {path: '/trainer-assess', component: () => import('@/views/incentive/trainer/index'), hidden: true},
  {path: '/404', component: () => import('@/views/404'), hidden: true},
  {path: '/customer', redirect: '/crm/customer', hidden: true},
  {path: '/customer/customer', redirect: '/crm/customer', hidden: true},
  {
    path: '',
    component: Layout,
    redirect: '/home',
    meta: {title: '首页', icon: 'home'},
    children: [{
      path: 'home',
      name: 'home',
      component: () => import('@/views/home/index'),
      meta: {title: '首页', icon: 'home'}
    }]
  },
  {
    // 原全屏排班看板已并入预约管理，旧地址保留跳转
    path: '/board',
    redirect: '/appointment/board',
    hidden: true
  },
  {
    // 待办中心：审批到人级别，所有登录账号都可进入，常驻一级菜单
    path: '/todo',
    component: Layout,
    meta: {title: '待办中心', icon: 'form'},
    children: [{
      path: 'index',
      name: 'todoCenter',
      component: () => import('@/views/todo/index'),
      meta: {title: '待办中心', icon: 'form', badge: 'todo'}
    }]
  },

  // ---------------------------------------------------------------------------
  // 旧地址兼容：同类页面合并成一个菜单项（tab）后，旧地址统一跳到新入口并带
  // ?tab=xxx，书签、外部链接与历史页面跳转继续可用
  // ---------------------------------------------------------------------------
  {path: '/appointment', redirect: '/appointment/list', hidden: true},
  {path: '/appointment/schedules', redirect: to => ({path: '/appointment/shift', query: Object.assign({}, to.query, {tab: 'schedules'})}), hidden: true},
  {path: '/appointment/leave', redirect: to => ({path: '/appointment/shift', query: Object.assign({}, to.query, {tab: 'leave'})}), hidden: true},

  {path: '/order', redirect: '/order/list', hidden: true},
  {path: '/order/ordinary', redirect: to => ({path: '/order/list', query: Object.assign({}, to.query, {tab: 'ordinary'})}), hidden: true},
  {path: '/order/coupons', redirect: to => ({path: '/order/list', query: Object.assign({}, to.query, {tab: 'coupons'})}), hidden: true},
  {path: '/order/coupon', redirect: '/promotion/giftCard', hidden: true},

  {path: '/crm', redirect: '/crm/customer', hidden: true},
  {path: '/promotion', redirect: '/promotion/giftCard', hidden: true},
  {path: '/promotion/activity', redirect: to => ({path: '/promotion/marketing', query: Object.assign({}, to.query, {tab: 'activity'})}), hidden: true},
  {path: '/promotion/discount', redirect: to => ({path: '/promotion/marketing', query: Object.assign({}, to.query, {tab: 'discount'})}), hidden: true},
  {path: '/promotion/coupon', redirect: '/promotion/giftCard', hidden: true},
  {path: '/goods/product', redirect: '/system/product', hidden: true},

  {path: '/statistics', redirect: '/statistics/overview', hidden: true},
  {path: '/statistics/revenue', redirect: to => ({path: '/statistics/overview', query: Object.assign({}, to.query, {tab: 'revenue'})}), hidden: true},
  {path: '/statistics/serviceDuration', redirect: to => ({path: '/statistics/overview', query: Object.assign({}, to.query, {tab: 'serviceDuration'})}), hidden: true},
  {path: '/statistics/therapistStats', redirect: to => ({path: '/statistics/overview', query: Object.assign({}, to.query, {tab: 'therapistStats'})}), hidden: true},
  {path: '/statistics/monthly', redirect: to => ({path: '/statistics/overview', query: Object.assign({}, to.query, {tab: 'monthly'})}), hidden: true},
  {path: '/statistics/salarySet', redirect: '/salary/config', hidden: true},
  {path: '/statistics/salaryDetail', redirect: '/salary/detail', hidden: true},

  {path: '/salary', redirect: '/salary/detail', hidden: true},
  {path: '/salary/training', redirect: to => ({path: '/salary/incentive', query: Object.assign({}, to.query, {tab: 'training'})}), hidden: true},
  {path: '/salary/settings', redirect: to => ({path: '/salary/incentive', query: Object.assign({}, to.query, {tab: 'settings'})}), hidden: true},
  {path: '/incentive', redirect: '/salary/incentive', hidden: true},
  {path: '/incentive/board', redirect: '/salary/incentive', hidden: true},
  {path: '/incentive/training', redirect: to => ({path: '/salary/incentive', query: Object.assign({}, to.query, {tab: 'training'})}), hidden: true},
  {path: '/incentive/settings', redirect: to => ({path: '/salary/incentive', query: Object.assign({}, to.query, {tab: 'settings'})}), hidden: true},

  {path: '/massagist', redirect: '/staff/team', hidden: true},
  {path: '/massagist/management', redirect: to => ({path: '/staff/team', query: Object.assign({}, to.query, {tab: 'therapist'})}), hidden: true},
  {path: '/massagist/schedules', redirect: to => ({path: '/appointment/shift', query: Object.assign({}, to.query, {tab: 'schedules'})}), hidden: true},
  {path: '/massagist/leave', redirect: to => ({path: '/appointment/shift', query: Object.assign({}, to.query, {tab: 'leave'})}), hidden: true},
  {path: '/massagist/comment', redirect: to => ({path: '/staff/team', query: Object.assign({}, to.query, {tab: 'reviews'})}), hidden: true},
  {path: '/shop/shopList', redirect: to => ({path: '/staff/team', query: Object.assign({}, to.query, {tab: 'shop'})}), hidden: true},
  {path: '/shop/room', redirect: to => ({path: '/staff/team', query: Object.assign({}, to.query, {tab: 'rooms'})}), hidden: true},
  {path: '/shop/bed', redirect: to => ({path: '/staff/team', query: Object.assign({}, to.query, {tab: 'beds'})}), hidden: true},
  {path: '/staff/therapist', redirect: to => ({path: '/staff/team', query: Object.assign({}, to.query, {tab: 'therapist'})}), hidden: true},
  {path: '/staff/reviews', redirect: to => ({path: '/staff/team', query: Object.assign({}, to.query, {tab: 'reviews'})}), hidden: true},
  {path: '/staff/shop', redirect: to => ({path: '/staff/team', query: Object.assign({}, to.query, {tab: 'shop'})}), hidden: true},
  {path: '/staff/rooms', redirect: to => ({path: '/staff/team', query: Object.assign({}, to.query, {tab: 'rooms'})}), hidden: true},
  {path: '/staff/beds', redirect: to => ({path: '/staff/team', query: Object.assign({}, to.query, {tab: 'beds'})}), hidden: true},
  {path: '/staff/accounts', redirect: to => ({path: '/staff/access', query: Object.assign({}, to.query, {tab: 'accounts'})}), hidden: true},
  {path: '/staff/roles', redirect: to => ({path: '/staff/access', query: Object.assign({}, to.query, {tab: 'roles'})}), hidden: true},
  {path: '/store-admin', redirect: '/staff/team', hidden: true},

  {path: '/ums', redirect: to => ({path: '/staff/access', query: Object.assign({}, to.query, {tab: 'menu'})}), hidden: true},
  {path: '/ums/admin', redirect: to => ({path: '/staff/access', query: Object.assign({}, to.query, {tab: 'accounts'})}), hidden: true},
  {path: '/ums/role', redirect: to => ({path: '/staff/access', query: Object.assign({}, to.query, {tab: 'roles'})}), hidden: true},
  {path: '/ums/allocMenu', redirect: to => ({path: '/staff/allocMenu', query: to.query}), hidden: true},
  {path: '/ums/allocResource', redirect: to => ({path: '/staff/allocResource', query: to.query}), hidden: true},
  {path: '/ums/menu', redirect: to => ({path: '/staff/access', query: Object.assign({}, to.query, {tab: 'menu'})}), hidden: true},
  {path: '/ums/addMenu', redirect: '/system/addMenu', hidden: true},
  {path: '/ums/updateMenu', redirect: to => ({path: '/system/updateMenu', query: to.query}), hidden: true},
  {path: '/ums/resource', redirect: to => ({path: '/staff/access', query: Object.assign({}, to.query, {tab: 'resource'})}), hidden: true},
  {path: '/ums/resourceCategory', redirect: '/system/resourceCategory', hidden: true},
  {path: '/ums/miniImage', redirect: to => ({path: '/system/config', query: Object.assign({}, to.query, {tab: 'image'})}), hidden: true},
  {path: '/ums/approvalCategory', redirect: to => ({path: '/system/config', query: Object.assign({}, to.query, {tab: 'approval'})}), hidden: true},

  {path: '/system', redirect: '/system/config', hidden: true},
  {path: '/system/menu', redirect: to => ({path: '/staff/access', query: Object.assign({}, to.query, {tab: 'menu'})}), hidden: true},
  {path: '/system/resource', redirect: to => ({path: '/staff/access', query: Object.assign({}, to.query, {tab: 'resource'})}), hidden: true},
  {path: '/system/approvalCategory', redirect: to => ({path: '/system/config', query: Object.assign({}, to.query, {tab: 'approval'})}), hidden: true},
  {path: '/system/miniImage', redirect: to => ({path: '/system/config', query: Object.assign({}, to.query, {tab: 'image'})}), hidden: true},
]

/**
 * 一级分组 4 个（首页、待办中心为常驻菜单，不参与权限过滤）：
 * 预约与订单 / 客户与营销 / 数据与劳务服务费 / 门店与系统
 *
 * 子路由统一使用绝对路径：页面 URL 与历史链接保持不变，分组只影响侧边栏归属。
 * meta.subGroup 用于分组内的小标题分段。
 */
export const asyncRouterMap = [
  {
    path: '/booking',
    component: Layout,
    name: 'booking',
    redirect: '/appointment/list',
    meta: {title: '预约与订单', icon: 'schedules'},
    children: [
      {
        path: '/appointment/list',
        name: 'appointmentList',
        component: () => import('@/views/appointment/List'),
        meta: {title: '预约列表', icon: 'order'}
      },
      {
        path: '/appointment/board',
        name: 'board',
        component: () => import('@/views/home/Board'),
        meta: {title: '排班看板', icon: 'dashboard', hideNavbar: true}
      },
      {
        path: '/appointment/shift',
        name: 'shiftCenter',
        component: () => import('@/views/appointment/ShiftCenter'),
        meta: {title: '排班与请假', icon: 'schedules'}
      },
      {
        path: '/order/list',
        name: 'orderCenter',
        component: () => import('@/views/order/OrderCenter'),
        meta: {title: '订单列表', icon: 'order'}
      },
      {
        path: '/appointment/create',
        name: 'appointmentCreate',
        component: () => import('@/views/appointment/Create'),
        meta: {title: '预约登记'},
        hidden: true
      },
      {
        path: '/order/approval',
        name: 'approval',
        component: () => import('@/views/order/approval/index'),
        meta: {title: '退款审批'},
        hidden: true
      },
    ]
  },
  {
    path: '/growth',
    component: Layout,
    name: 'growth',
    redirect: '/crm/customer',
    meta: {title: '客户与营销', icon: 'customer'},
    children: [
      {
        path: '/crm/customer',
        name: 'customer',
        component: () => import('@/views/customer/index'),
        meta: {title: '客户列表', icon: 'ums-admin'}
      },
      {
        path: '/system/product',
        name: 'product',
        component: () => import('@/views/goods/product/index'),
        meta: {title: '商品列表', icon: 'product-list'}
      },
      {
        path: '/promotion/giftCard',
        name: 'giftCard',
        component: () => import('@/views/promotion/giftCard/index'),
        meta: {title: '礼品卡', icon: 'room'}
      },
      {
        path: '/promotion/marketing',
        name: 'marketingCenter',
        component: () => import('@/views/promotion/MarketingCenter'),
        meta: {title: '活动与折扣', icon: 'sms-hot'}
      },
    ]
  },
  {
    path: '/analysis',
    component: Layout,
    name: 'analysis',
    redirect: '/statistics/overview',
    meta: {title: '数据与劳务服务费', icon: 'statistics'},
    children: [
      {
        path: '/statistics/overview',
        name: 'statisticsOverview',
        component: () => import('@/views/statistics/OverviewCenter'),
        meta: {title: '经营数据', icon: 'statistics'}
      },
      {
        path: '/salary/detail',
        name: 'salaryDetail',
        component: () => import('@/views/statistics/salaryDetail/index'),
        meta: {title: '劳务服务费明细', icon: 'salary'}
      },
      {
        path: '/salary/config',
        name: 'salarySet',
        component: () => import('@/views/statistics/salaryDetail/salarySetList'),
        meta: {title: '劳务服务费设置', icon: 'salarySet'}
      },
      {
        path: '/salary/incentive',
        name: 'incentiveCenter',
        component: () => import('@/views/incentive/CenterPage'),
        meta: {title: '激励中心', icon: 'dashboard'}
      },
    ]
  },
  {
    // 门店、人员、账号权限与系统配置统一收口，避免一级菜单继续膨胀
    path: '/staff',
    component: Layout,
    name: 'staff',
    redirect: '/staff/team',
    meta: {title: '门店与系统', icon: 'ums-role'},
    children: [
      {
        path: '/staff/team',
        name: 'teamCenter',
        component: () => import('@/views/staff/TeamCenter'),
        meta: {title: '门店团队', icon: 'massagist'}
      },
      {
        path: '/staff/access',
        name: 'accessCenter',
        component: () => import('@/views/staff/AccessCenter'),
        meta: {title: '账号权限', icon: 'ums-admin'}
      },
      {
        path: '/system/config',
        name: 'systemConfig',
        component: () => import('@/views/system/ConfigCenter'),
        meta: {title: '系统配置', icon: 'ums-menu'}
      },
      {
        path: '/staff/allocMenu',
        name: 'allocMenu',
        component: () => import('@/views/ums/role/allocMenu'),
        meta: {title: '分配菜单'},
        hidden: true
      },
      {
        path: '/staff/allocResource',
        name: 'allocResource',
        component: () => import('@/views/ums/role/allocResource'),
        meta: {title: '分配资源'},
        hidden: true
      },
      {
        path: '/system/addMenu',
        name: 'addMenu',
        component: () => import('@/views/ums/menu/add'),
        meta: {title: '添加菜单'},
        hidden: true
      },
      {
        path: '/system/updateMenu',
        name: 'updateMenu',
        component: () => import('@/views/ums/menu/update'),
        meta: {title: '修改菜单'},
        hidden: true
      },
      {
        path: '/system/resourceCategory',
        name: 'resourceCategory',
        component: () => import('@/views/ums/resource/categoryList'),
        meta: {title: '资源分类'},
        hidden: true
      },
    ]
  },
  {path: '*', redirect: '/404', hidden: true}
]

export default new Router({
  // mode: 'history', //后端支持可开
  scrollBehavior: () => ({y: 0}),
  routes: constantRouterMap
})