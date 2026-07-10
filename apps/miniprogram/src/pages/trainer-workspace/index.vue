<template>
  <view class="page">
    <view class="nav-bar">
      <view class="back-btn" @tap="goBack"><text>←</text></view>
      <text class="nav-title">导师工作台</text>
    </view>

    <!-- 统计卡片 -->
    <view class="stats-section">
      <view class="stat-card">
        <text class="stat-value">18</text>
        <text class="stat-label">本月课时</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">¥5,400</text>
        <text class="stat-label">本月收入</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">98%</text>
        <text class="stat-label">好评率</text>
      </view>
    </view>

    <!-- 今日日程 -->
    <view class="section">
      <text class="section-title">今日日程</text>
      <view class="schedule-list">
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
            <text class="schedule-venue">📍 {{ item.venue }}</text>
            <view class="schedule-meta">
              <text class="schedule-students">{{ item.enrolled }}/{{ item.maxCapacity }}人</text>
              <text v-if="item.current" class="schedule-badge current">进行中</text>
              <text v-if="item.past" class="schedule-badge past">已完成</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 近期课程 -->
    <view class="section">
      <text class="section-title">近期课程安排</text>
      <view class="course-list">
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
    </view>

    <!-- 收入明细 -->
    <view class="section">
      <view class="section-header">
        <text class="section-title">收入明细</text>
        <text class="section-more">本月合计 ¥5,400</text>
      </view>
      <view class="income-list">
        <view v-for="item in incomeRecords" :key="item.id" class="income-item">
          <view class="income-left">
            <text class="income-name">{{ item.course }}</text>
            <text class="income-date">{{ item.date }} · {{ item.students }}人</text>
          </view>
          <text class="income-amount">+¥{{ item.amount }}</text>
        </view>
      </view>
    </view>

    <!-- 学员签到 -->
    <view class="section">
      <text class="section-title">最近签到情况</text>
      <view class="checkin-summary">
        <view class="checkin-stat">
          <text class="checkin-value">95%</text>
          <text class="checkin-label">本周出勤率</text>
        </view>
        <view class="checkin-stat">
          <text class="checkin-value">2</text>
          <text class="checkin-label">缺勤人次</text>
        </view>
        <view class="checkin-stat">
          <text class="checkin-value">38</text>
          <text class="checkin-label">本周学员人次</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const todaySchedule = ref([
  { id: '1', name: '正念冥想入门·第2节：身体扫描', startTime: '10:00', endTime: '11:30', venue: '冥想室 A', enrolled: 6, maxCapacity: 8, current: false, past: true },
  { id: '2', name: '深度冥想进阶', startTime: '14:00', endTime: '15:30', venue: '冥想室 A', enrolled: 6, maxCapacity: 6, current: true, past: false },
  { id: '3', name: '正念生活分享会', startTime: '19:00', endTime: '20:30', venue: '沙龙区', enrolled: 12, maxCapacity: 20, current: false, past: false },
])

const upcomingCourses = ref([
  { id: '1', day: '30', weekday: '周一', name: '正念冥想入门·第3节', time: '10:00-11:30', venue: '冥想室 A', enrolled: 5, max: 8 },
  { id: '2', day: '02', weekday: '周三', name: '深度冥想进阶', time: '09:00-10:30', venue: '冥想室 A', enrolled: 6, max: 6 },
  { id: '3', day: '03', weekday: '周四', name: '正念冥想入门（新班）', time: '10:00-11:30', venue: '冥想室 A', enrolled: 2, max: 8 },
  { id: '4', day: '05', weekday: '周六', name: '正念冥想入门·第3节', time: '10:00-11:30', venue: '冥想室 A', enrolled: 5, max: 8 },
])

const incomeRecords = ref([
  { id: '1', course: '正念冥想入门·第2节', date: '6月29日', students: 6, amount: 700 },
  { id: '2', course: '深度冥想进阶', date: '6月28日', students: 6, amount: 900 },
  { id: '3', course: '正念冥想入门·第1节', date: '6月28日', students: 5, amount: 700 },
  { id: '4', course: '正念生活分享会', date: '6月27日', students: 12, amount: 500 },
  { id: '5', course: '深度冥想进阶', date: '6月25日', students: 6, amount: 900 },
])

function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.page { min-height: 100vh; background: #F5E8D8; }
.nav-bar { display: flex; align-items: center; padding: 24rpx 32rpx; gap: 16rpx; }
.back-btn { width: 48rpx; height: 48rpx; display: flex; align-items: center; justify-content: center; font-size: 32rpx; color: #4B3621; }
.nav-title { font-size: 34rpx; font-weight: 700; color: #4B3621; }

.stats-section { display: flex; padding: 0 32rpx 24rpx; gap: 16rpx; }
.stat-card { flex: 1; background: #FFF; border-radius: 16rpx; padding: 24rpx 16rpx; text-align: center; }
.stat-value { font-size: 32rpx; font-weight: 700; color: #6B463C; display: block; margin-bottom: 4rpx; }
.stat-label { font-size: 22rpx; color: #A08A72; }

.section { margin: 0 32rpx 24rpx; background: #FFF; border-radius: 20rpx; padding: 28rpx; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.section-title { font-size: 30rpx; font-weight: 700; color: #4B3621; margin-bottom: 16rpx; display: block; }
.section-more { font-size: 24rpx; color: #6B463C; font-weight: 500; }

.schedule-list { display: flex; flex-direction: column; }
.schedule-item { display: flex; gap: 16rpx; padding: 16rpx 0; }
.schedule-item.past { opacity: 0.6; }
.schedule-time { width: 80rpx; text-align: right; }
.time-start { font-size: 26rpx; font-weight: 500; color: #4B3621; display: block; }
.time-end { font-size: 22rpx; color: #A08A72; }
.schedule-line { display: flex; flex-direction: column; align-items: center; width: 24rpx; }
.line-dot { width: 16rpx; height: 16rpx; border-radius: 50%; background: #D8CBBB; margin-top: 8rpx; }
.line-dot.active { background: #6B463C; box-shadow: 0 0 0 4rpx rgba(107,70,60,0.2); }
.line-bar { width: 2rpx; flex: 1; background: #E8DDD4; margin-top: 4rpx; }
.schedule-content { flex: 1; }
.schedule-name { font-size: 28rpx; font-weight: 500; color: #4B3621; display: block; margin-bottom: 4rpx; }
.schedule-venue { font-size: 22rpx; color: #A08A72; display: block; margin-bottom: 8rpx; }
.schedule-meta { display: flex; align-items: center; gap: 12rpx; }
.schedule-students { font-size: 22rpx; color: #7D665C; }
.schedule-badge { font-size: 20rpx; padding: 4rpx 12rpx; border-radius: 8rpx; }
.schedule-badge.current { background: #E8F5E9; color: #27AE60; }
.schedule-badge.past { background: #F5F5F5; color: #999; }

.course-list { display: flex; flex-direction: column; gap: 12rpx; }
.course-item { display: flex; align-items: center; gap: 16rpx; padding: 16rpx; background: #FAF5F0; border-radius: 12rpx; }
.course-date { text-align: center; min-width: 70rpx; }
.date-day { font-size: 32rpx; font-weight: 700; color: #4B3621; display: block; }
.date-weekday { font-size: 20rpx; color: #A08A72; }
.course-info { flex: 1; }
.course-name { font-size: 26rpx; color: #4B3621; display: block; margin-bottom: 4rpx; }
.course-time { font-size: 22rpx; color: #A08A72; }
.course-enrolled { }
.enrolled-count { font-size: 24rpx; color: #6B463C; font-weight: 500; }

.income-list { display: flex; flex-direction: column; gap: 12rpx; }
.income-item { display: flex; justify-content: space-between; align-items: center; padding: 12rpx 0; border-bottom: 1rpx solid #F5F0EB; }
.income-item:last-child { border-bottom: none; }
.income-left { }
.income-name { font-size: 26rpx; color: #4B3621; display: block; margin-bottom: 4rpx; }
.income-date { font-size: 22rpx; color: #A08A72; }
.income-amount { font-size: 28rpx; font-weight: 600; color: #27AE60; }

.checkin-summary { display: flex; padding: 16rpx 0; }
.checkin-stat { flex: 1; text-align: center; }
.checkin-value { font-size: 32rpx; font-weight: 700; color: #4B3621; display: block; margin-bottom: 4rpx; }
.checkin-label { font-size: 22rpx; color: #A08A72; }
</style>
