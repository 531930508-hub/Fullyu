<template>
  <view class="page">
    <PortalNav :title="tr('我的课程', 'My classes')" :sub="tr('仅显示归属你的课程', 'Only classes assigned to you')" />
    <view class="tabs">
      <view class="tab" :class="{ active: tab === 'upcoming' }" @tap="switchTab('upcoming')">{{ tr('待上课', 'Upcoming') }}</view>
      <view class="tab" :class="{ active: tab === 'finished' }" @tap="switchTab('finished')">{{ tr('已结束', 'Finished') }}</view>
    </view>

    <PageState v-if="loading" state="loading" :title="tr('正在载入课程', 'Loading classes')" />
    <PageState v-else-if="loadError" state="error" :title="tr('课程加载失败', 'Could not load classes')" :action="tr('重新加载', 'Reload')" @action="load" />
    <view v-else class="container list">
      <view v-if="!courses.length" class="card empty-card">
        <text class="empty-title">{{ tab === 'upcoming' ? tr('暂无待上课程', 'No upcoming classes') : tr('暂无已结束课程', 'No finished classes') }}</text>
        <text class="empty-sub">{{ tr('教务排课后会出现在这里；也可以提交课程提案主动提报。', 'Classes scheduled by the team will appear here.') }}</text>
        <button v-if="tab === 'upcoming'" class="btn-secondary empty-action" @tap="goProposals">{{ tr('提交课程提案', 'Submit a proposal') }}</button>
      </view>

      <view v-for="c in courses" :key="c.id" class="course-card">
        <view class="course-head">
          <view class="date-block">
            <text class="date-day latin">{{ formatDay(c.startAt) }}</text>
            <text class="date-week">{{ weekdayOf(c.startAt) }}</text>
          </view>
          <view class="head-copy">
            <text class="course-title serif">{{ c.title }}</text>
            <text class="course-time latin">{{ c.startTime }} – {{ c.endTime }}</text>
          </view>
          <text class="phase" :class="'tone-' + phaseTone(c.phase)">{{ phaseText(c.phase) }}</text>
        </view>

        <view class="course-meta">
          <view class="meta-row">
            <text class="meta-label">{{ tr('场地', 'Venue') }}</text>
            <text class="meta-value">{{ c.venue ? `${c.venue.name}${c.venue.city ? ' · ' + c.venue.city : ''}` : tr('待确认', 'TBC') }}</text>
          </view>
          <view class="meta-row">
            <text class="meta-label">{{ tr('报名', 'Enrolled') }}</text>
            <view class="meta-value">
              <text class="latin">{{ c.enrolled }} / {{ c.maxCapacity }}</text>
              <text v-if="c.enrolled < c.minCapacity" class="warn">{{ tr(`未达开课人数 ${c.minCapacity}`, `Below minimum ${c.minCapacity}`) }}</text>
            </view>
          </view>
          <view class="meta-row">
            <text class="meta-label">{{ tr('课时', 'Duration') }}</text>
            <text class="meta-value">{{ durationText(c.startTime, c.endTime) }}</text>
          </view>
        </view>

        <view class="roster-bar">
          <view class="roster-copy">
            <PresenceIcon :name="c.rosterUnlocked ? 'users' : 'lock'" :size="26" />
            <text class="roster-text">{{ rosterHint(c.rosterUnlocked, c.startAt) }}</text>
          </view>
          <button
            class="roster-btn"
            :class="{ locked: !c.rosterUnlocked }"
            :disabled="!c.rosterUnlocked"
            @tap="openRoster(c)"
          >
            {{ tr('学员名单', 'Roster') }}
          </button>
        </view>
      </view>
      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { tr } from '@/locale'
import { getCourses, type PortalCourse } from '@/api/trainer-portal'
import { ensureTrainerAuth } from '@/utils/trainer-request'
import { formatDay, phaseText, phaseTone, rosterHint, weekdayOf } from '@/utils/trainer-portal-labels'
import PortalNav from '@/components/PortalNav.vue'
import PageState from '@/components/PageState.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'

const tab = ref<'upcoming' | 'finished'>('upcoming')
const courses = ref<PortalCourse[]>([])
const loading = ref(true)
const loadError = ref(false)

onShow(() => {
  if (!ensureTrainerAuth()) return
  load()
})

async function load() {
  loading.value = true
  loadError.value = false
  try {
    courses.value = await getCourses(tab.value)
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function switchTab(next: 'upcoming' | 'finished') {
  if (tab.value === next) return
  tab.value = next
  courses.value = []
  load()
}

/** 课时按 HH:mm 差值算，跨天课程后端会拆成不同 startAt，这里不做跨天兜底 */
function durationText(start: string, end: string) {
  const toMin = (t: string) => {
    const [h, m] = String(t || '0:0').split(':').map(Number)
    return h * 60 + (m || 0)
  }
  const diff = toMin(end) - toMin(start)
  if (!Number.isFinite(diff) || diff <= 0) return tr('按课表执行', 'As scheduled')
  const h = Math.floor(diff / 60)
  const m = diff % 60
  return tr(`${h ? h + ' 小时' : ''}${m ? m + ' 分钟' : ''}`, `${h ? h + 'h ' : ''}${m ? m + 'm' : ''}`.trim())
}

function openRoster(c: PortalCourse) {
  if (!c.rosterUnlocked) return
  uni.navigateTo({ url: `/pages/trainer-portal/roster/index?courseId=${c.id}` })
}

function goProposals() {
  uni.navigateTo({ url: '/pages/trainer-portal/proposals/index' })
}
</script>

<style scoped>
.tabs {
  display: flex;
  gap: 12rpx;
  padding: 20rpx 32rpx 0;
}
.tab {
  padding: 14rpx 30rpx;
  border-radius: 28rpx;
  font-size: 26rpx;
  color: var(--c-brown);
  background: var(--c-card);
  border: 1rpx solid var(--line-soft);
}
.tab.active {
  background: var(--c-primary);
  color: var(--c-rice);
  border-color: var(--c-primary);
}
.list {
  padding-top: 24rpx;
}
.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 52rpx 32rpx;
}
.empty-title {
  font-size: 28rpx;
  color: var(--c-ink);
}
.empty-sub {
  font-size: 22rpx;
  color: var(--c-muted);
  text-align: center;
  line-height: 1.6;
}
.empty-action {
  margin-top: 16rpx;
}
.course-card {
  background: var(--c-card);
  border-radius: var(--radius-card);
  padding: 30rpx;
  margin-bottom: 24rpx;
  box-shadow: var(--shadow-card);
}
.course-head {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
}
.date-block {
  width: 100rpx;
  background: var(--c-cream);
  border-radius: 18rpx;
  padding: 12rpx 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.date-day {
  font-size: 30rpx;
  color: var(--c-primary);
  font-weight: 500;
}
.date-week {
  font-size: 20rpx;
  color: var(--c-muted);
}
.head-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.course-title {
  font-size: 32rpx;
  color: var(--c-ink);
  line-height: 1.4;
}
.course-time {
  font-size: 24rpx;
  color: var(--c-muted);
}
.phase {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 14rpx;
  flex-shrink: 0;
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
.course-meta {
  margin-top: 22rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid var(--line-soft);
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.meta-row {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}
.meta-label {
  width: 76rpx;
  font-size: 22rpx;
  color: var(--c-muted);
}
.meta-value {
  flex: 1;
  font-size: 24rpx;
  color: var(--c-ink);
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.warn {
  font-size: 20rpx;
  color: #8a5a17;
  background: #fbf1df;
  padding: 2rpx 10rpx;
  border-radius: 12rpx;
}
.roster-bar {
  margin-top: 22rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.roster-copy {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: var(--c-muted);
}
.roster-text {
  font-size: 21rpx;
  line-height: 1.5;
}
.roster-btn {
  padding: 12rpx 28rpx;
  border-radius: 22rpx;
  background: var(--c-primary);
  color: var(--c-rice);
  font-size: 24rpx;
  line-height: 1.6;
  flex-shrink: 0;
}
.roster-btn.locked {
  background: #e9e4d4;
  color: #9b9382;
}
</style>