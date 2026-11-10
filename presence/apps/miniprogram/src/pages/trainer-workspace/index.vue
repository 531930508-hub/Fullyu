<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack fallback="/pages/profile/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }"><view class="back-spacer"></view><text class="nav-title serif">{{ tr('导师工作台', 'Trainer Studio') }}</text></view>
    <PageState v-if="!userStore.isLoggedIn" state="guest" :title="tr('登录后查看工作台', 'Log in to view the studio')" :message="tr('课程安排与合作记录仅本人可见。', 'Your schedule and collaboration records are private.')" :action="tr('去登录', 'Log in')" @action="goProfile" />
    <PageState v-else-if="!userStore.isTrainer" state="empty" :title="tr('工作台仅向合作导师开放', 'The studio is for partner guides only')" :action="tr('返回我的', 'Back to Me')" @action="goProfile" />
    <PageState v-else-if="loading" state="loading" :title="tr('正在载入今日安排', 'Loading the daily schedule')" />
    <PageState v-else-if="loadError" state="error" :title="tr('工作台加载失败', 'Failed to load the studio')" :action="tr('重新加载', 'Reload')" @action="load" />
    <view v-else class="content">
      <view class="greeting"><text class="greeting-title serif">{{ tr(`${userStore.userInfo?.nickname || '老师'}，欢迎回来`, `Welcome back, ${userStore.userInfo?.nickname || 'guide'}`) }}</text><text class="secondary">{{ todayLabel }} · {{ tr(`今天 ${todaySchedule.length} 门课程`, `${todaySchedule.length} classes today`) }}</text></view>

      <view class="section-heading"><text class="serif">{{ tr('今日课程', "Today's classes") }}</text><text class="caption">Today</text></view>
      <view class="card">
        <view v-if="todaySchedule.length" class="schedule-list">
          <view v-for="item in todaySchedule" :key="item.id" class="schedule-item">
            <view class="schedule-time"><text class="time-start latin">{{ item.startTime }}</text><text class="secondary">{{ item.endTime }}</text></view>
            <view class="grow"><text class="course-name">{{ item.name }}</text><text class="secondary">{{ item.venue || tr('场地待确认', 'Venue TBC') }} · {{ tr(`已约 ${item.enrolled} / ${item.maxCapacity} 人`, `${item.enrolled} / ${item.maxCapacity} booked`) }}</text><view class="schedule-actions"><text class="tag" :class="{ active: item.current }">{{ item.current ? tr('进行中', 'In progress') : item.past ? tr('时段已结束', 'Session ended') : tr('待开始', 'Not started') }}</text><button class="outline-btn small-btn" @tap="goDetail(item.id)">{{ tr('查看课程', 'View class') }}<PresenceIcon name="arrow" :size="26" /></button></view></view>
          </view>
        </view>
        <PageState v-else state="empty" :title="tr('今天没有课程', 'No classes today')" :message="tr('留一点时间给自己，也可以看看接下来的安排。', 'Take some time for yourself, or check what is coming up.')" :action="tr('查看近期安排', 'View upcoming')" @action="scrollTo('upcoming')" />
      </view>

      <view class="section-heading"><text class="serif">{{ tr('本月概览', 'This month') }}</text><text class="caption">{{ monthLabel }}</text></view>
      <view class="card">
        <view class="stats-row">
          <view class="stat"><text class="stat-value latin">{{ stats?.monthHours ?? '—' }}</text><text class="secondary">{{ tr('带课时长 / 小时', 'Teaching hours') }}</text></view>
          <view class="stat"><text class="stat-value latin">{{ stats?.monthIncome != null ? `¥${stats.monthIncome}` : '—' }}</text><text class="secondary">{{ tr('课程收益估算', 'Estimated income') }}</text></view>
          <view class="stat"><text class="stat-value latin">{{ stats?.rating || tr('暂无', 'N/A') }}</text><text class="secondary">{{ tr('累计学员评分', 'Overall rating') }}</text></view>
        </view>
        <text class="secondary metric-note">{{ tr('时长与收益按接口返回的已完成课程统计；收益为估算，不代表已结算或到账金额。', 'Hours and income are based on completed classes returned by the API. Income is an estimate, not a settlement or received amount.') }}</text>
      </view>

      <view class="section-heading"><text class="serif">{{ tr('快捷入口', 'Shortcuts') }}</text><text class="caption">Shortcuts</text></view>
      <view class="card shortcuts">
        <button class="shortcut" @tap="scrollTo('upcoming')"><PresenceIcon name="calendar" :size="40" /><text>{{ tr('近期安排', 'Upcoming') }}</text></button>
        <button class="shortcut" @tap="scrollTo('income')"><PresenceIcon name="chart" :size="40" /><text>{{ tr('收益记录', 'Income records') }}</text></button>
        <button class="shortcut" @tap="goCommunities"><PresenceIcon name="users" :size="40" /><text>{{ tr('我的社群', 'My communities') }}</text></button>
      </view>

      <view id="upcoming" class="section-heading"><text class="serif">{{ tr('近期课程安排', 'Upcoming schedule') }}</text><text class="caption">Upcoming</text></view>
      <view class="card">
        <view v-if="upcomingCourses.length" class="course-list"><button v-for="course in upcomingCourses" :key="course.id" class="course-item" @tap="goDetail(course.id)"><view class="date-block"><text class="date-day latin">{{ course.day }}{{ tr('日', '') }}</text><text class="secondary">{{ weekdayLabel(course.weekday) }}</text></view><view class="grow"><text class="course-name">{{ course.name }}</text><text class="secondary">{{ course.time }} · {{ course.venue || tr('场地待确认', 'Venue TBC') }}</text><text class="secondary">{{ tr(`已约 ${course.enrolled} / ${course.max} 人`, `${course.enrolled} / ${course.max} booked`) }}</text></view><PresenceIcon name="arrow" :size="28" /></button></view>
        <PageState v-else state="empty" :title="tr('暂无近期课程', 'No upcoming classes')" :message="tr('新课程发布后会同步到这里。', 'New classes will appear here once published.')" />
      </view>

      <view id="income" class="section-heading"><text class="serif">{{ tr('课程收益记录', 'Class income records') }}</text><text class="caption">Records</text></view>
      <view class="card">
        <text class="secondary">{{ tr(`已完成课程 · 最近 ${incomeRecords.length} 条，非结算明细`, `Completed classes · latest ${incomeRecords.length} records, not a settlement statement`) }}</text>
        <view v-if="incomeRecords.length" class="income-list"><view v-for="item in incomeRecords" :key="item.id" class="income-item"><view class="grow"><text class="course-name">{{ item.course }}</text><text class="secondary">{{ localizeServerDate(item.date) }} · {{ tr(`${item.hours} 小时`, `${item.hours} hrs`) }} · {{ tr(`${item.students} 人`, `${item.students} students`) }}</text></view><text class="income-amount latin">¥{{ item.amount }}</text></view></view>
        <PageState v-else state="empty" :title="tr('暂无已完成课程记录', 'No completed class records')" />
      </view>

      <view class="section-heading"><text class="serif">{{ tr('本周签到概览', 'Weekly attendance') }}</text><text class="caption">Attendance</text></view>
      <view class="card">
        <view class="stats-row"><view class="stat"><text class="stat-value latin">{{ checkin?.weekStudents ? `${checkin.weekAttendanceRate}%` : '—' }}</text><text class="secondary">{{ tr('当前签到率', 'Check-in rate') }}</text></view><view class="stat"><text class="stat-value latin">{{ checkin?.weekAbsent ?? '—' }}</text><text class="secondary">{{ tr('未签到人次', 'Not checked in') }}</text></view><view class="stat"><text class="stat-value latin">{{ checkin?.weekStudents ?? '—' }}</text><text class="secondary">{{ tr('预约人次', 'Bookings') }}</text></view></view>
        <text class="secondary metric-note">{{ tr('本周为周一至周日，包含尚未开始的课程，未签到不等于缺勤。', 'The week runs Monday to Sunday and includes classes that have not started. Not checking in is not the same as absence.') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getTrainerWorkspace, type TrainerWorkspace } from '@/api/trainer'
import { useUserStore } from '@/stores/user'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'
import PageState from '@/components/PageState.vue'
import FloatingBack from '@/components/FloatingBack.vue'

const userStore = useUserStore()
const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const loading = ref(false)
const loadError = ref(false)
const stats = ref<TrainerWorkspace['stats'] | null>(null)
const todaySchedule = ref<TrainerWorkspace['todaySchedule']>([])
const upcomingCourses = ref<TrainerWorkspace['upcomingCourses']>([])
const incomeRecords = ref<TrainerWorkspace['incomeRecords']>([])
const checkin = ref<TrainerWorkspace['checkin'] | null>(null)
const todayLabel = ref('')
const monthLabel = ref('')

async function load() {
  if (loading.value) return
  stats.value = null
  checkin.value = null
  todaySchedule.value = []
  upcomingCourses.value = []
  incomeRecords.value = []
  if (!userStore.isLoggedIn || !userStore.isTrainer) return
  loading.value = true
  loadError.value = false
  const now = new Date()
  todayLabel.value = isEnglish()
    ? now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : `${now.getMonth() + 1}月${now.getDate()}日`
  monthLabel.value = isEnglish()
    ? now.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    : `${now.getFullYear()}年${now.getMonth() + 1}月`
  try {
    const data = await getTrainerWorkspace()
    if (!data) throw new Error(tr('工作台数据暂不可用', 'Studio data is unavailable'))
    stats.value = data.stats ?? null
    todaySchedule.value = data.todaySchedule || []
    upcomingCourses.value = data.upcomingCourses || []
    incomeRecords.value = data.incomeRecords || []
    checkin.value = data.checkin ?? null
  } catch {
    loadError.value = true
  } finally { loading.value = false }
}
onShow(() => { load() })
const WEEKDAY_EN: Record<string, string> = { 周日: 'Sun', 周一: 'Mon', 周二: 'Tue', 周三: 'Wed', 周四: 'Thu', 周五: 'Fri', 周六: 'Sat' }
function weekdayLabel(value: string) { return isEnglish() ? (WEEKDAY_EN[value] || value) : value }
function localizeServerDate(value: string) {
  if (!isEnglish()) return value
  const match = /^(\d{1,2})月(\d{1,2})日$/.exec(value || '')
  if (!match) return value
  const date = new Date(new Date().getFullYear(), Number(match[1]) - 1, Number(match[2]))
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function goBack() { if (getCurrentPages().length > 1) uni.navigateBack(); else goProfile() }
function goProfile() { uni.switchTab({ url: '/pages/profile/index' }) }
function goDetail(id: string) { if (id) uni.navigateTo({ url: `/pages/course-detail/index?id=${id}` }) }
function goCommunities() { uni.navigateTo({ url: '/pages/community-mine/index' }) }
function scrollTo(section: string) { uni.pageScrollTo({ selector: `#${section}`, duration: 250 }) }
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; line-height: 1.6; padding-bottom: env(safe-area-inset-bottom); }
button { margin: 0; font-size: 28rpx; line-height: 1.6; }
button::after { border: 0; }
.nav-bar { display: flex; align-items: center; gap: 24rpx; padding: 16rpx 32rpx 8rpx; }
.back-spacer { width: 80rpx; height: 80rpx; flex-shrink: 0; }
.nav-title { font-size: 34rpx; }
.content { padding: 16rpx 32rpx 32rpx; }
.greeting { padding: 8rpx 0 0; }
.greeting-title { display: block; font-size: 42rpx; margin-bottom: 8rpx; }
.secondary, .caption { display: block; color: var(--c-muted); font-size: 24rpx; font-weight: 400; }
.section-heading { display: flex; align-items: baseline; gap: 14rpx; margin: 40rpx 0 20rpx; font-size: 34rpx; }
.card { padding: 32rpx; border-radius: var(--radius-card); background: var(--c-card); box-shadow: var(--shadow-card); }
.grow { flex: 1; min-width: 0; text-align: left; }
.schedule-item { display: flex; gap: 24rpx; padding: 28rpx 0; border-bottom: 1rpx solid var(--line-soft); }
.schedule-item:first-child { padding-top: 0; }
.schedule-item:last-child { border-bottom: 0; padding-bottom: 0; }
.schedule-time { width: 94rpx; flex-shrink: 0; }
.time-start { display: block; color: var(--c-primary); font-size: 30rpx; font-weight: 600; }
.course-name { display: block; font-weight: 500; font-size: 28rpx; margin-bottom: 8rpx; overflow-wrap: anywhere; }
.schedule-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 16rpx; margin-top: 20rpx; }
.tag { padding: 4rpx 16rpx; color: var(--c-primary); background: var(--c-card-2); border-radius: 16rpx; font-size: 24rpx; }
.tag.active { background: var(--c-gold); }
.outline-btn { display: flex; align-items: center; justify-content: center; gap: 12rpx; padding: 16rpx 24rpx; min-height: 80rpx; color: var(--c-primary); background: var(--c-card); border: 2rpx solid var(--c-primary); border-radius: var(--radius-button); }
.small-btn { font-size: 24rpx; }
.stats-row { display: flex; gap: 16rpx; }
.stat { flex: 1; min-width: 0; text-align: center; }
.stat-value { display: block; font-size: 34rpx; color: var(--c-primary); font-weight: 600; overflow-wrap: anywhere; }
.metric-note { margin-top: 24rpx; padding-top: 24rpx; border-top: 1rpx solid var(--line-soft); }
.shortcuts { display: flex; gap: 12rpx; }
.shortcut { display: flex; flex: 1; flex-direction: column; align-items: center; gap: 16rpx; padding: 16rpx 0; color: var(--c-ink); background: var(--c-card); border-radius: var(--radius-button); font-size: 24rpx; }
.course-item { display: flex; align-items: center; gap: 24rpx; width: 100%; padding: 28rpx 0; color: var(--c-ink); background: var(--c-card); border-bottom: 1rpx solid var(--line-soft); }
.course-item:first-child { padding-top: 0; }
.course-item:last-child { padding-bottom: 0; border: 0; }
.date-block { width: 100rpx; flex-shrink: 0; text-align: center; }
.date-day { display: block; font-size: 32rpx; color: var(--c-primary); font-weight: 600; }
.income-item { display: flex; align-items: center; gap: 24rpx; padding: 24rpx 0; border-bottom: 1rpx solid var(--line-soft); }
.income-item:last-child { border: 0; padding-bottom: 0; }
.income-amount { font-size: 30rpx; font-weight: 600; color: var(--c-primary); }
</style>
