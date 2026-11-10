/**
 * 简易 i18n 多语言支持
 * 使用方式: import { t } from '@/locale'
 * 在模板中: {{ t('key') }}
 */
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'

const zh: Record<string, string> = {
  // TabBar
  'tab.home': '首页',
  'tab.courses': '预约',
  'tab.member': '会员',
  'tab.profile': '我的',

  // 首页
  'home.all': '全部',
  'home.today': '今日',
  'home.week': '本周',
  'home.month': '本月',
  'home.noCourses': '暂无课程',
  'home.seats.left': '余{n}位',
  'home.seats.full': '已满',

  // 我的课程
  'myCourses.title': '我的预约',
  'myCourses.upcoming': '待上课',
  'myCourses.completed': '已完成',
  'myCourses.cancelled': '已取消',
  'myCourses.emptyUpcoming': '暂无即将开始的课程',
  'myCourses.emptyCompleted': '暂无已完成课程',
  'myCourses.emptyCancelled': '暂无取消记录',
  'myCourses.pending': '待签到',
  'myCourses.checkedIn': '✓ 已签到',
  'myCourses.missed': '缺勤',
  'myCourses.review': '去评价',
  'myCourses.reviewed': '已评价',

  // 会员中心
  'member.title': '在场畅练卡',
  'member.benefits': '会员权益',
  'member.upgrade': '升级 / 续费',
  'member.buyNow': '立即购买',
  'member.validUntil': '有效期至 ',
  'member.notMember': '暂未开通会员',
  'member.normalUser': '普通用户',

  // 个人中心
  'profile.title': '我的',
  'profile.notLoggedIn': '未登录',
  'profile.loginHint': '登录后享受完整服务',
  'profile.login': '登录',
  'profile.points': '积分',
  'profile.completed': '已完课',
  'profile.upcoming': '待上课',
  'profile.memberStatus': '会员',
  'profile.myAssets': '我的资产',
  'profile.bookings': '我的预约',
  'profile.myReviews': '我的评价',
  'profile.memberCard': '在场畅练卡',
  'profile.trainerWorkspace': '导师工作台',
  'profile.trainerRole': '导师身份',
  'profile.language': '语言切换',
  'profile.contactService': '联系客服',
  'profile.about': '关于 Full愈',
  'profile.editProfile': '编辑资料',
  'profile.memberActive': '年卡有效',

  // 通用
  'common.back': '返回',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.save': '保存',
  'common.loading': '加载中...',
}

const en: Record<string, string> = {
  // TabBar
  'tab.home': 'Home',
  'tab.courses': 'Bookings',
  'tab.member': 'Member',
  'tab.profile': 'Me',

  // 首页
  'home.all': 'All',
  'home.today': 'Today',
  'home.week': 'Week',
  'home.month': 'Month',
  'home.noCourses': 'No courses available',
  'home.seats.left': '{n} left',
  'home.seats.full': 'Full',

  // 我的课程
  'myCourses.title': 'My Bookings',
  'myCourses.upcoming': 'Upcoming',
  'myCourses.completed': 'Completed',
  'myCourses.cancelled': 'Cancelled',
  'myCourses.emptyUpcoming': 'No upcoming courses',
  'myCourses.emptyCompleted': 'No completed courses',
  'myCourses.emptyCancelled': 'No cancelled records',
  'myCourses.pending': 'Pending',
  'myCourses.checkedIn': '✓ Checked in',
  'myCourses.missed': 'Absent',
  'myCourses.review': 'Review',
  'myCourses.reviewed': 'Reviewed',

  // 会员中心
  'member.title': 'Presence Pass',
  'member.benefits': 'Benefits',
  'member.upgrade': 'Upgrade / Renew',
  'member.buyNow': 'Buy Now',
  'member.validUntil': 'Valid until ',
  'member.notMember': 'Not a member yet',
  'member.normalUser': 'Regular User',

  // 个人中心
  'profile.title': 'Me',
  'profile.notLoggedIn': 'Not logged in',
  'profile.loginHint': 'Login to enjoy full services',
  'profile.login': 'Login',
  'profile.points': 'Points',
  'profile.completed': 'Done',
  'profile.upcoming': 'Upcoming',
  'profile.memberStatus': 'Member',
  'profile.myAssets': 'My Assets',
  'profile.bookings': 'Bookings',
  'profile.myReviews': 'My Reviews',
  'profile.memberCard': 'Presence Pass',
  'profile.trainerWorkspace': 'Trainer Studio',
  'profile.trainerRole': 'Trainer',
  'profile.language': 'Language',
  'profile.contactService': 'Contact Us',
  'profile.about': 'About Full愈',
  'profile.editProfile': 'Edit Profile',
  'profile.memberActive': 'Active',

  // 通用
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.save': 'Save',
  'common.loading': 'Loading...',
}

const messages: Record<string, Record<string, string>> = { zh, en }

/**
 * 翻译函数
 * @param key 翻译 key
 * @param params 插值参数, e.g. { n: 3 }
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const userStore = useUserStore()
  const lang = userStore.language || 'zh'
  let text = messages[lang]?.[key] || messages['zh']?.[key] || key
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v))
    })
  }
  return text
}

/**
 * 内联双语：系统文案随语言即时切换，用户生成内容保持原文。
 * 例：tr('报名中', 'Enrolling')
 */
export function tr(zh: string, en: string): string {
  const userStore = useUserStore()
  return (userStore.language || 'zh') === 'en' ? en : zh
}

/** 当前是否英文界面 */
export function isEnglish(): boolean {
  const userStore = useUserStore()
  return (userStore.language || 'zh') === 'en'
}

/**
 * 切换语言后更新 TabBar 文字
 */
export function updateTabBarLanguage() {
  const userStore = useUserStore()
  const lang = userStore.language || 'zh'
  const tabs = [
    { index: 0, key: 'tab.home' },
    { index: 1, key: 'tab.courses' },
    { index: 2, key: 'tab.member' },
    { index: 3, key: 'tab.profile' },
  ]
  tabs.forEach(({ index, key }) => {
    // 项目使用自定义 FloatingTabBar，原生 tabBar 接口在部分端/非 tabbar 页面会 fail，
    // 必须传 fail 回调吞掉（否则 Promise 化后产生 unhandledrejection）
    uni.setTabBarItem({
      index,
      text: messages[lang]?.[key] || messages['zh']?.[key] || '',
      fail: () => {},
    })
  })
}
