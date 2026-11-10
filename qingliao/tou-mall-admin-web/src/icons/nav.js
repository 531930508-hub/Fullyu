// 侧边栏图标统一映射
// 数据库中的菜单可能是历史图标名，这里统一收敛到 nav-* 线性图标族，
// 保证不同账号、不同菜单组合下的视觉一致。
const iconMap = {
  // 一级导航
  home: 'nav-home',
  form: 'nav-todo',
  todo: 'nav-todo',
  customer: 'nav-customer',
  crm: 'nav-customer',
  product: 'nav-product',
  goods: 'nav-product',
  'product-list': 'nav-product',
  ums: 'nav-shield',
  'ums-admin': 'nav-shield',
  'ums-role': 'nav-role',
  'ums-menu': 'nav-menu',
  'ums-resource': 'nav-resource',
  massagist: 'nav-massagist',
  therapist: 'nav-massagist',
  shop: 'nav-shop',
  shopList: 'nav-shop',
  room: 'nav-calendar',
  bed: 'nav-calendar',
  schedules: 'nav-calendar',
  leave: 'nav-leave',
  comment: 'nav-comment',
  review: 'nav-review',
  dashboard: 'nav-stats',
  statistics: 'nav-stats',
  monthly: 'nav-stats',
  salary: 'nav-wallet',
  salarySet: 'nav-wallet',
  wallet: 'nav-wallet',
  order: 'nav-order',
  coupons: 'nav-coupon',
  'sms-coupon': 'nav-coupon',
  'sms-hot': 'nav-promotion',
  'sms-new': 'nav-promotion',
  'sms-subject': 'nav-comment',
  'sms-ad': 'nav-promotion',
  'sms-flash': 'nav-promotion',
  sms: 'nav-comment',
  cms: 'nav-activity',
  'cms-subject': 'nav-activity',
  'cms-topic': 'nav-activity',
  approvalCategory: 'nav-approval',
  approval: 'nav-approval',
  miniImage: 'nav-image',
  image: 'nav-image',
  activity: 'nav-activity',
  discount: 'nav-discount',
  gift: 'nav-incentive',
  giftCard: 'nav-gift',
  incentive: 'nav-incentive',
  reward: 'nav-incentive',
  promotion: 'nav-promotion',
  user: 'nav-customer',
  admin: 'nav-shield',
  role: 'nav-role',
  menu: 'nav-menu',
  resource: 'nav-resource',
  category: 'nav-category',
  brand: 'nav-brand',
  settings: 'nav-settings'
}

const titleMap = [
  [/首页/, 'nav-home'],
  [/待办/, 'nav-todo'],
  [/客户/, 'nav-customer'],
  [/商品|产品/, 'nav-product'],
  [/权限|账号|角色|菜单/, 'nav-shield'],
  [/疗愈师|疗愈师/, 'nav-massagist'],
  [/门店|店铺|房间|床位/, 'nav-shop'],
  [/统计|报表|数据|看板/, 'nav-stats'],
  [/劳务服务费|服务费|薪资|提成|工资/, 'nav-wallet'],
  [/订单/, 'nav-order'],
  [/券/, 'nav-coupon'],
  [/奖励|积分|培训/, 'nav-incentive'],
  [/活动|推广|营销/, 'nav-promotion'],
  [/评价|评论/, 'nav-review'],
  [/审批|请假/, 'nav-approval'],
  [/内容|图文/, 'nav-activity']
]

export function resolveNavIcon(icon, title) {
  if (icon && icon.indexOf('nav-') === 0) {
    return icon
  }
  if (icon && iconMap[icon]) {
    return iconMap[icon]
  }
  if (title) {
    const hit = titleMap.find(([reg]) => reg.test(title))
    if (hit) {
      return hit[1]
    }
  }
  return icon || 'nav-home'
}

export default resolveNavIcon