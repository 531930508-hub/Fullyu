<template>
  <view class="page">
    <PortalNav :title="tr('学员名单', 'Student roster')" :sub="roster?.course.title || ''" fallback="/pages/trainer-portal/courses/index" />

    <PageState v-if="loading" state="loading" :title="tr('正在载入名单', 'Loading roster')" />
    <view v-else-if="locked" class="container">
      <view class="lock-card">
        <PresenceIcon name="lock" :size="48" />
        <text class="lock-title serif">{{ tr('名单还未开放', 'Roster not open yet') }}</text>
        <text class="lock-sub">{{ lockedMessage }}</text>
        <text class="lock-note">{{ tr('开课前 3 小时开放，方便你提前了解学员情况。', 'It opens 3 hours before class so you can prepare.') }}</text>
      </view>
    </view>
    <PageState v-else-if="loadError" state="error" :title="tr('名单加载失败', 'Could not load the roster')" :action="tr('重新加载', 'Reload')" @action="load" />

    <view v-else-if="roster" class="container">
      <view class="summary">
        <view class="summary-item">
          <text class="summary-num latin">{{ roster.students.length }}</text>
          <text class="summary-label">{{ tr('报名人数', 'Enrolled') }}</text>
        </view>
        <view class="summary-item">
          <text class="summary-num latin">{{ checkedCount }}</text>
          <text class="summary-label">{{ tr('已签到', 'Checked in') }}</text>
        </view>
        <view class="summary-item">
          <text class="summary-num latin">{{ roster.students.length - checkedCount }}</text>
          <text class="summary-label">{{ tr('未签到', 'Not yet') }}</text>
        </view>
      </view>

      <view class="course-strip">
        <text class="strip-text">{{ formatDateTime(roster.course.startAt) }}</text>
        <text class="strip-dot">·</text>
        <text class="strip-text">{{ roster.course.venue?.name || tr('场地待定', 'Venue TBC') }}</text>
        <text class="phase">{{ phaseText(roster.course.phase) }}</text>
      </view>

      <view v-if="!roster.students.length" class="card empty-card">
        <text class="empty-title">{{ tr('还没有人报名', 'No one has enrolled yet') }}</text>
        <text class="empty-sub">{{ tr('课程详情页的报名情况会同步到这里。', 'Enrollments sync here automatically.') }}</text>
      </view>

      <view v-else class="card roster-card">
        <view class="roster-head">
          <text class="col-seat">{{ tr('座号', 'Seat') }}</text>
          <text class="col-name">{{ tr('学员', 'Student') }}</text>
          <text class="col-state">{{ tr('状态', 'State') }}</text>
        </view>
        <view v-for="s in roster.students" :key="s.orderId" class="roster-row">
          <text class="col-seat latin">{{ s.seat }}</text>
          <view class="col-name stack">
            <text class="student-name">{{ s.name }}</text>
            <text class="student-phone latin" @tap="copyPhone(s.phone)">{{ s.phone }}<text class="copy-hint">{{ tr(' 复制', ' copy') }}</text></text>
          </view>
          <view class="col-state">
            <text v-if="s.checkInStatus === 'CHECKED'" class="state-tag state-in">{{ tr('已签到', 'Checked in') }}</text>
            <text v-else class="state-tag state-wait">{{ tr('未签到', 'Not yet') }}</text>
          </view>
        </view>
      </view>

      <text class="privacy">{{ tr('名单含学员联系方式，仅用于本课程沟通，请勿转发或另作他用。', 'The roster contains contact details. Use it only for this class.') }}</text>
      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { tr } from '@/locale'
import { getCourseRoster, type CourseRoster } from '@/api/trainer-portal'
import { ensureTrainerAuth } from '@/utils/trainer-request'
import { formatDateTime, phaseText } from '@/utils/trainer-portal-labels'
import PortalNav from '@/components/PortalNav.vue'
import PageState from '@/components/PageState.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'

const courseId = ref('')
const roster = ref<CourseRoster | null>(null)
const loading = ref(true)
const loadError = ref(false)
const locked = ref(false)
const lockedMessage = ref('')

const checkedCount = computed(() => roster.value?.students.filter((s) => s.checkInStatus === 'CHECKED').length || 0)

onLoad((query) => {
  courseId.value = String(query?.courseId || '')
  if (!ensureTrainerAuth()) return
  if (!courseId.value) {
    loadError.value = true
    loading.value = false
    return
  }
  load()
})

async function load() {
  loading.value = true
  loadError.value = false
  locked.value = false
  try {
    roster.value = await getCourseRoster(courseId.value, true)
  } catch (e: any) {
    // 后端以 4003 表达「还没到开放时间」，用专门状态页承接，不当作故障
    if (String(e?.message || '').includes('3 小时')) {
      locked.value = true
      lockedMessage.value = String(e.message)
    } else {
      loadError.value = true
    }
  } finally {
    loading.value = false
  }
}

function copyPhone(phone: string) {
  uni.setClipboardData({ data: phone, success: () => uni.showToast({ title: tr('已复制', 'Copied'), icon: 'none' }) })
}
</script>

<style scoped>
.lock-card {
  margin-top: 60rpx;
  background: var(--c-card);
  border-radius: var(--radius-card);
  padding: 60rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  color: var(--c-brown);
  box-shadow: var(--shadow-card);
}
.lock-title {
  font-size: 34rpx;
  color: var(--c-ink);
}
.lock-sub {
  font-size: 25rpx;
  color: var(--c-brown);
  text-align: center;
  line-height: 1.6;
}
.lock-note {
  font-size: 22rpx;
  color: var(--c-muted);
  text-align: center;
  line-height: 1.6;
}
.summary {
  display: flex;
  background: var(--c-primary);
  border-radius: var(--radius-card);
  padding: 28rpx 12rpx;
  margin-top: 24rpx;
}
.summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}
.summary-num {
  font-size: 42rpx;
  color: var(--c-rice);
}
.summary-label {
  font-size: 21rpx;
  color: rgba(255, 255, 255, 0.75);
}
.course-strip {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 20rpx 4rpx 4rpx;
  flex-wrap: wrap;
}
.strip-text {
  font-size: 23rpx;
  color: var(--c-brown);
}
.strip-dot {
  color: var(--c-muted);
}
.phase {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 12rpx;
  background: var(--c-card-2);
  color: var(--c-primary);
}
.roster-card {
  margin-top: 20rpx;
  padding: 8rpx 28rpx;
}
.roster-head {
  display: flex;
  padding: 20rpx 0 14rpx;
  border-bottom: 1rpx solid var(--line-soft);
  font-size: 21rpx;
  color: var(--c-muted);
}
.roster-row {
  display: flex;
  align-items: center;
  padding: 22rpx 0;
}
.roster-row + .roster-row {
  border-top: 1rpx solid var(--line-soft);
}
.col-seat {
  width: 76rpx;
  font-size: 24rpx;
  color: var(--c-muted);
}
.col-name {
  flex: 1;
  min-width: 0;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.student-name {
  font-size: 28rpx;
  color: var(--c-ink);
}
.student-phone {
  font-size: 23rpx;
  color: var(--c-brown);
}
.copy-hint {
  font-size: 20rpx;
  color: var(--c-muted);
}
.col-state {
  width: 120rpx;
  text-align: right;
}
.state-tag {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: 12rpx;
}
.state-in {
  background: #e8efdc;
  color: #4b5f27;
}
.state-wait {
  background: var(--c-cream);
  color: var(--c-muted);
}
.empty-card {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  align-items: center;
  padding: 48rpx 32rpx;
  margin-top: 24rpx;
}
.empty-title {
  font-size: 28rpx;
  color: var(--c-ink);
}
.empty-sub {
  font-size: 22rpx;
  color: var(--c-muted);
}
.privacy {
  display: block;
  margin-top: 24rpx;
  font-size: 21rpx;
  color: var(--c-muted);
  line-height: 1.6;
  text-align: center;
}
</style>