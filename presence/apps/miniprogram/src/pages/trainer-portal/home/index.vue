<template>
  <view class="page">
    <PortalNav :title="tr('导师门户', 'Trainer Portal')" :sub="me?.phone ? masked(me.phone) : ''" :show-back="false">
      <button class="ghost-btn" @tap="logout">{{ tr('退出', 'Sign out') }}</button>
    </PortalNav>

    <PageState v-if="loading && !me" state="loading" :title="tr('正在载入', 'Loading')" />
    <PageState v-else-if="!me" state="error" :title="tr('资料加载失败', 'Could not load your profile')" :action="tr('重新加载', 'Reload')" @action="load" />

    <view v-else class="container body">
      <view class="hero">
        <image v-if="me.avatar" :src="me.avatar" mode="aspectFill" class="hero-avatar" />
        <view v-else class="hero-avatar hero-avatar-fallback serif">{{ me.displayName.slice(0, 1) }}</view>
        <view class="hero-copy">
          <text class="hero-name serif">{{ me.displayName }}</text>
          <view class="hero-meta">
            <text class="pill">{{ tr(`L${me.level} 导师`, `Level ${me.level}`) }}</text>
            <text v-if="me.certBadge" class="pill pill-gold">{{ me.certBadge }}</text>
            <text v-if="me.city" class="hero-city">{{ me.city }}</text>
          </view>
          <text class="hero-headline">{{ me.headline || tr('还没有一句话介绍，去资料页补上', 'Add a one-line intro in your profile') }}</text>
        </view>
      </view>

      <view v-if="me.mustChangePassword" class="alert" @tap="goProfile">
        <PresenceIcon name="lock" :size="30" />
        <view class="alert-copy">
          <text class="alert-title">{{ tr('请先修改初始密码', 'Please change your initial password') }}</text>
          <text class="alert-sub">{{ tr('初始密码由教务发送，首次登录后需更换。', 'Set your own password before continuing.') }}</text>
        </view>
        <PresenceIcon name="arrow" :size="26" />
      </view>

      <view class="stats">
        <view class="stat">
          <text class="stat-num latin">{{ me.stats.upcomingCourses }}</text>
          <text class="stat-label">{{ tr('待开课', 'Upcoming') }}</text>
        </view>
        <view class="stat">
          <text class="stat-num latin">{{ me.stats.pendingProposals }}</text>
          <text class="stat-label">{{ tr('提案处理中', 'In review') }}</text>
        </view>
        <view class="stat">
          <text class="stat-num latin">{{ me.stats.totalStudents }}</text>
          <text class="stat-label">{{ tr('累计学员', 'Students') }}</text>
        </view>
        <view class="stat">
          <text class="stat-num latin">{{ me.stats.rating || '—' }}</text>
          <text class="stat-label">{{ tr('课程评分', 'Rating') }}</text>
        </view>
      </view>

      <view class="actions">
        <button class="action" @tap="go('/pages/trainer-portal/courses/index')">
          <PresenceIcon name="calendar" :size="42" />
          <text class="action-title">{{ tr('我的课程', 'My classes') }}</text>
          <text class="action-sub">{{ tr('看名单、联系学员', 'Roster & contacts') }}</text>
        </button>
        <button class="action" @tap="go('/pages/trainer-portal/proposals/index')">
          <PresenceIcon name="edit" :size="42" />
          <text class="action-title">{{ tr('课程提案', 'Proposals') }}</text>
          <text class="action-sub">{{ tr('提交新课程与审核进度', 'Submit & track review') }}</text>
        </button>
        <button class="action" @tap="goProfile">
          <PresenceIcon name="user" :size="42" />
          <text class="action-title">{{ tr('对外资料', 'Public profile') }}</text>
          <text class="action-sub">{{ tr('学员看到的样子', 'What students see') }}</text>
        </button>
        <button class="action" @tap="go('/pages/trainer-portal/apply/index')">
          <PresenceIcon name="info" :size="42" />
          <text class="action-title">{{ tr('入驻资料', 'Application') }}</text>
          <text class="action-sub">{{ tr('补交申请信息', 'Resubmit details') }}</text>
        </button>
      </view>

      <view class="section-head">
        <text class="section-title">{{ tr('接下来', 'Next up') }}</text>
        <text class="section-more" @tap="go('/pages/trainer-portal/courses/index')">{{ tr('全部课程', 'All classes') }}</text>
      </view>

      <view v-if="upcoming.length" class="card next-list">
        <view v-for="c in upcoming" :key="c.id" class="next-item" @tap="openRoster(c)">
          <view class="next-date">
            <text class="next-day latin">{{ formatDay(c.startAt) }}</text>
            <text class="next-week">{{ weekdayOf(c.startAt) }}</text>
          </view>
          <view class="next-copy">
            <text class="next-title">{{ c.title }}</text>
            <text class="next-sub">{{ c.startTime }}–{{ c.endTime }} · {{ c.venue?.name || tr('场地待定', 'Venue TBC') }}</text>
            <text class="next-sub">{{ tr(`已报名 ${c.enrolled} / ${c.maxCapacity}`, `${c.enrolled} / ${c.maxCapacity} enrolled`) }}</text>
          </view>
          <view class="next-right">
            <text class="phase" :class="'tone-' + phaseTone(c.phase)">{{ phaseText(c.phase) }}</text>
            <PresenceIcon name="arrow" :size="26" />
          </view>
        </view>
      </view>
      <view v-else class="card empty-card">
        <text class="empty-title">{{ tr('近期没有排课', 'No classes scheduled') }}</text>
        <text class="empty-sub">{{ tr('课程上架后会自动出现在这里。', 'Published classes show up here automatically.') }}</text>
      </view>

      <view class="footer-note">
        <text>{{ tr('门户仅展示与你相关的课程与提案；学员电话号码请勿外传。', 'Only your own classes and proposals are shown. Keep student phone numbers private.') }}</text>
      </view>
      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { tr } from '@/locale'
import { getCourses, type PortalCourse } from '@/api/trainer-portal'
import { useTrainerPortalStore } from '@/stores/trainer-portal'
import { ensureTrainerAuth } from '@/utils/trainer-request'
import { formatDay, phaseText, phaseTone, weekdayOf } from '@/utils/trainer-portal-labels'
import PortalNav from '@/components/PortalNav.vue'
import PageState from '@/components/PageState.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'

const store = useTrainerPortalStore()
const me = computed(() => store.me)
const loading = computed(() => store.loading)
const upcomingCourses = ref<PortalCourse[]>([])

/** 首页只露出最近两门，完整列表在「我的课程」 */
const upcoming = computed(() => upcomingCourses.value.slice(0, 2))

const masked = (phone: string) => (phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '')

onShow(async () => {
  if (!ensureTrainerAuth()) return
  await load()
})

async function load() {
  try {
    await store.loadMe(true)
    upcomingCourses.value = await getCourses('upcoming')
  } catch {
    // 错误提示已由请求层统一 toast，这里只保证页面不白屏
  }
}

function go(url: string) {
  uni.navigateTo({ url })
}

function goProfile() {
  uni.navigateTo({ url: '/pages/trainer-portal/profile/index' })
}

function openRoster(course: PortalCourse) {
  uni.navigateTo({ url: `/pages/trainer-portal/roster/index?courseId=${course.id}` })
}

function logout() {
  uni.showModal({
    title: tr('退出导师门户', 'Sign out'),
    content: tr('学员端的微信登录不受影响。', 'Your student login is not affected.'),
    success: (res) => {
      if (res.confirm) store.logout()
    },
  })
}
</script>

<style scoped>
.body {
  padding-top: 28rpx;
}
.ghost-btn {
  padding: 10rpx 24rpx;
  border-radius: 24rpx;
  background: var(--c-card);
  border: 1rpx solid var(--line-soft);
  font-size: 24rpx;
  color: var(--c-brown);
  line-height: 1.6;
}
.hero {
  display: flex;
  gap: 24rpx;
  align-items: flex-start;
  background: var(--c-card);
  border-radius: var(--radius-card);
  padding: 32rpx;
  box-shadow: var(--shadow-card);
}
.hero-avatar {
  width: 112rpx;
  height: 112rpx;
  border-radius: 28rpx;
  flex-shrink: 0;
  background: var(--c-card-2);
}
.hero-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  color: var(--c-primary);
}
.hero-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.hero-name {
  font-size: 40rpx;
  color: var(--c-ink);
}
.hero-meta {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-wrap: wrap;
}
.pill {
  font-size: 20rpx;
  padding: 2rpx 14rpx;
  border-radius: 16rpx;
  background: var(--c-card-2);
  color: var(--c-primary);
}
.pill-gold {
  background: #fbf1df;
  color: #8a5a17;
}
.hero-city {
  font-size: 22rpx;
  color: var(--c-muted);
}
.hero-headline {
  font-size: 24rpx;
  color: var(--c-brown);
  line-height: 1.6;
}
.alert {
  margin-top: 24rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: #fbf1df;
  color: #8a5a17;
}
.alert-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.alert-title {
  font-size: 26rpx;
  font-weight: 600;
}
.alert-sub {
  font-size: 22rpx;
  opacity: 0.85;
  line-height: 1.5;
}
.stats {
  display: flex;
  margin-top: 24rpx;
  background: var(--c-card);
  border-radius: var(--radius-card);
  padding: 28rpx 12rpx;
  box-shadow: var(--shadow-card);
}
.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  position: relative;
}
.stat + .stat::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12rpx;
  bottom: 12rpx;
  width: 1rpx;
  background: var(--line-soft);
}
.stat-num {
  font-size: 40rpx;
  color: var(--c-ink);
  font-weight: 500;
}
.stat-label {
  font-size: 21rpx;
  color: var(--c-muted);
}
.actions {
  margin-top: 24rpx;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
}
.action {
  background: var(--c-card);
  border-radius: 24rpx;
  padding: 28rpx;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  color: var(--c-primary);
  box-shadow: var(--shadow-card);
}
.action-title {
  font-size: 28rpx;
  color: var(--c-ink);
  font-weight: 500;
}
.action-sub {
  font-size: 21rpx;
  color: var(--c-muted);
}
.section-title {
  font-size: 32rpx;
}
.next-list {
  padding: 8rpx 28rpx;
}
.next-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 0;
}
.next-item + .next-item {
  border-top: 1rpx solid var(--line-soft);
}
.next-date {
  width: 96rpx;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.next-day {
  font-size: 30rpx;
  color: var(--c-primary);
  font-weight: 500;
}
.next-week {
  font-size: 20rpx;
  color: var(--c-muted);
}
.next-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.next-title {
  font-size: 28rpx;
  color: var(--c-ink);
  font-weight: 500;
}
.next-sub {
  font-size: 22rpx;
  color: var(--c-muted);
}
.next-right {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.phase {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 14rpx;
}
.tone-live {
  background: #e8efdc;
  color: #4b5f27;
}
.tone-done {
  background: var(--c-card-2);
  color: var(--c-brown);
}
.tone-muted {
  background: #efe9df;
  color: var(--c-muted);
}
.tone-neutral {
  background: var(--c-cream);
  color: var(--c-brown);
}
.empty-card {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  align-items: center;
  padding: 48rpx 32rpx;
}
.empty-title {
  font-size: 28rpx;
  color: var(--c-ink);
}
.empty-sub {
  font-size: 22rpx;
  color: var(--c-muted);
}
.footer-note {
  margin-top: 32rpx;
  font-size: 21rpx;
  color: var(--c-muted);
  line-height: 1.6;
  text-align: center;
}
</style>