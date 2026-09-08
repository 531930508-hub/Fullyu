<template>
  <view class="page">
    <view class="nav-bar">
      <view class="back-btn" @tap="goBack"><text>←</text></view>
      <text class="nav-title serif">导师工作台</text>
    </view>

    <!-- 统计卡片 -->
    <view class="stats-section">
      <view class="stat-card">
        <text class="stat-value latin">{{ stats.monthHours }}</text>
        <text class="stat-label">本月课时</text>
      </view>
      <view class="stat-card">
        <text class="stat-value latin">¥{{ stats.monthIncome }}</text>
        <text class="stat-label">本月收入</text>
      </view>
      <view class="stat-card">
        <text class="stat-value latin">{{ stats.rating || '-' }}</text>
        <text class="stat-label">评分</text>
      </view>
    </view>

    <!-- 今日日程 -->
    <view class="section">
      <text class="section-title serif">今日日程</text>
      <view v-if="todaySchedule.length" class="schedule-list">
        <view v-for="item in todaySchedule" :key="item.id" class="schedule-item" :class="{ current: item.current, past: item.past }">
          <view class="schedule-time">
            <text class="time-start">{{ item.startTime }}</text>
            <text class="time-end">{{ item.endTime }}</text>
          </view>
          <view class="schedule-line">
            <view class="line-dot" :class="{ active: item.current }"></view>
            <view class="line-bar"></view>
          </view>
          <view class="schedule-content">
            <text class="schedule-name">{{ item.name }}</text>
            <text class="schedule-venue">{{ item.venue }}</text>
            <view class="schedule-meta">
              <text class="schedule-students">{{ item.enrolled }}/{{ item.maxCapacity }}人</text>
              <text v-if="item.current" class="schedule-badge current">进行中</text>
              <text v-if="item.past" class="schedule-badge past">已完成</text>
            </view>
          </view>
        </view>
      </view>
      <text v-else class="empty-line">今日暂无排课</text>
    </view>

    <!-- 近期课程 -->
    <view class="section">
      <text class="section-title serif">近期课程安排</text>
      <view v-if="upcomingCourses.length" class="course-list">
        <view v-for="course in upcomingCourses" :key="course.id" class="course-item">
          <view class="course-date">
            <text class="date-day">{{ course.day }}</text>
            <text class="date-weekday">{{ course.weekday }}</text>
          </view>
          <view class="course-info">
            <text class="course-name">{{ course.name }}</text>
            <text class="course-time">{{ course.time }} · {{ course.venue }}</text>
          </view>
          <view class="course-enrolled">
            <text class="enrolled-count">{{ course.enrolled }}/{{ course.max }}</text>
          </view>
        </view>
      </view>
      <text v-else class="empty-line">暂无近期课程</text>
    </view>

    <!-- 收入明细 -->
    <view class="section">
      <view class="section-header">
        <text class="section-title serif">收入明细</text>
        <text class="section-more">本月合计 <text class="latin">¥{{ stats.monthIncome }}</text></text>
      </view>
      <view v-if="incomeRecords.length" class="income-list">
        <view v-for="item in incomeRecords" :key="item.id" class="income-item">
          <view class="income-left">
            <text class="income-name">{{ item.course }}</text>
            <text class="income-date">{{ item.date }} · {{ item.hours }}课时 · {{ item.students }}人</text>
          </view>
          <text class="income-amount latin">+¥{{ item.amount }}</text>
        </view>
      </view>
      <text v-else class="empty-line">暂无已完成课程收入</text>
    </view>

    <!-- 学员签到 -->
    <view class="section">
      <text class="section-title serif">本周签到情况</text>
      <view class="checkin-summary">
        <view class="checkin-stat">
          <text class="checkin-value">{{ checkin.weekAttendanceRate }}%</text>
          <text class="checkin-label">本周出勤率</text>
        </view>
        <view class="checkin-stat">
          <text class="checkin-value">{{ checkin.weekAbsent }}</text>
          <text class="checkin-label">缺勤人次</text>
        </view>
        <view class="checkin-stat">
          <text class="checkin-value">{{ checkin.weekStudents }}</text>
          <text class="checkin-label">本周学员人次</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getTrainerWorkspace, type TrainerWorkspace } from '@/api/trainer'

const stats = ref<TrainerWorkspace['stats']>({ monthHours: 0, monthIncome: 0, rating: 0 })
const todaySchedule = ref<TrainerWorkspace['todaySchedule']>([])
const upcomingCourses = ref<TrainerWorkspace['upcomingCourses']>([])
const incomeRecords = ref<TrainerWorkspace['incomeRecords']>([])
const checkin = ref<TrainerWorkspace['checkin']>({ weekAttendanceRate: 0, weekAbsent: 0, weekStudents: 0 })

async function load() {
  try {
    const data = await getTrainerWorkspace()
    if (!data) return
    stats.value = data.stats
    todaySchedule.value = data.todaySchedule || []
    upcomingCourses.value = data.upcomingCourses || []
    incomeRecords.value = data.incomeRecords || []
    checkin.value = data.checkin
  } catch (e) {
    // 错误已由 request 统一提示
  }
}

onShow(() => {
  load()
})

function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.page { min-height: 100vh; background: #EAE0D7; }
.nav-bar { display: flex; align-items: center; padding: 32rpx 32rpx 20rpx; gap: 16rpx; }
.back-btn { width: 48rpx; height: 48rpx; display: flex; align-items: center; justify-content: center; font-size: 32rpx; color: #3F2F10; }
.nav-title { font-size: 38rpx; color: #3F2F10; }

.stats-section { display: flex; padding: 8rpx 32rpx 28rpx; gap: 20rpx; }
.stat-card { flex: 1; background: #FBF8F3; border-radius: 32rpx; padding: 28rpx 16rpx; text-align: center; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.stat-value { font-size: 34rpx; font-weight: 600; color: #584219; display: block; margin-bottom: 6rpx; }
.stat-label { font-size: 22rpx; color: #A78E70; }

.section { margin: 0 32rpx 28rpx; background: #FBF8F3; border-radius: 44rpx; padding: 36rpx 32rpx; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.section-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20rpx; }
.section-header .section-title { margin-bottom: 0; }
.section-title { font-size: 32rpx; color: #584219; margin-bottom: 20rpx; display: block; }
.section-more { font-size: 24rpx; color: #A78E70; }
.empty-line { font-size: 24rpx; color: #A78E70; text-align: center; display: block; padding: 32rpx 0; }

.schedule-list { display: flex; flex-direction: column; }
.schedule-item { display: flex; gap: 20rpx; padding: 20rpx 0; }
.schedule-item.past { opacity: 0.55; }
.schedule-time { width: 84rpx; text-align: right; }
.time-start { font-size: 26rpx; font-weight: 500; color: #3F2F10; display: block; }
.time-end { font-size: 22rpx; color: #A78E70; }
.schedule-line { display: flex; flex-direction: column; align-items: center; width: 24rpx; }
.line-dot { width: 16rpx; height: 16rpx; border-radius: 50%; background: rgba(88, 66, 25, 0.2); margin-top: 8rpx; }
.line-dot.active { background: #584219; box-shadow: 0 0 0 6rpx rgba(88, 66, 25, 0.12); }
.line-bar { width: 2rpx; flex: 1; background: rgba(88, 66, 25, 0.14); margin-top: 4rpx; }
.schedule-content { flex: 1; }
.schedule-name { font-size: 28rpx; font-weight: 500; color: #3F2F10; display: block; margin-bottom: 4rpx; letter-spacing: 1rpx; }
.schedule-venue { font-size: 22rpx; color: #A78E70; display: block; margin-bottom: 8rpx; }
.schedule-meta { display: flex; align-items: center; gap: 12rpx; }
.schedule-students { font-size: 22rpx; color: #6D5934; }
.schedule-badge { font-size: 20rpx; padding: 4rpx 18rpx; border-radius: 999rpx; letter-spacing: 1rpx; }
.schedule-badge.current { background: rgba(211, 149, 110, 0.16); color: #B06A3F; }
.schedule-badge.past { background: rgba(88, 66, 25, 0.08); color: #6D5934; }

.course-list { display: flex; flex-direction: column; gap: 16rpx; }
.course-item { display: flex; align-items: center; gap: 20rpx; padding: 24rpx; background: #F4EEE6; border-radius: 32rpx; }
.course-date { text-align: center; min-width: 72rpx; }
.date-day { font-size: 34rpx; font-weight: 600; color: #584219; display: block; font-family: var(--font-latin); }
.date-weekday { font-size: 20rpx; color: #A78E70; }
.course-info { flex: 1; }
.course-name { font-size: 26rpx; color: #3F2F10; display: block; margin-bottom: 4rpx; }
.course-time { font-size: 22rpx; color: #A78E70; }
.enrolled-count { font-size: 24rpx; color: #584219; font-weight: 500; font-family: var(--font-latin); }

.income-list { display: flex; flex-direction: column; }
.income-item { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0; border-bottom: 2rpx dashed rgba(88, 66, 25, 0.14); }
.income-item:last-child { border-bottom: none; }
.income-name { font-size: 26rpx; color: #3F2F10; display: block; margin-bottom: 4rpx; }
.income-date { font-size: 22rpx; color: #A78E70; }
.income-amount { font-size: 30rpx; font-weight: 600; color: #584219; }

.checkin-summary { display: flex; padding: 20rpx 0 4rpx; }
.checkin-stat { flex: 1; text-align: center; }
.checkin-value { font-size: 34rpx; font-weight: 600; color: #584219; display: block; margin-bottom: 6rpx; font-family: var(--font-latin); }
.checkin-label { font-size: 22rpx; color: #A78E70; }
</style>
