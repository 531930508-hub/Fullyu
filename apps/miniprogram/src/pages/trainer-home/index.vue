<template>
  <view class="page">
    <!-- 导师封面 -->
    <view class="cover">
      <view class="back-btn" @tap="goBack"><text>←</text></view>
      <view class="cover-content">
        <view class="trainer-avatar">{{ trainer.name.charAt(0) }}</view>
        <text class="trainer-name">{{ trainer.name }}</text>
        <view class="trainer-tags">
          <text class="level-tag">LV{{ trainer.level }}</text>
          <text class="title-tag">{{ trainer.title }}</text>
        </view>
      </view>
    </view>

    <!-- 数据统计 -->
    <view v-if="trainer.totalStudents || trainer.rating || trainer.totalHours" class="stats-bar">
      <view v-if="trainer.totalStudents" class="stat-item">
        <text class="stat-value">{{ trainer.totalStudents }}</text>
        <text class="stat-label">总学员</text>
      </view>
      <view v-if="trainer.rating" class="stat-item">
        <text class="stat-value">{{ trainer.rating }}</text>
        <text class="stat-label">好评率</text>
      </view>
      <view v-if="trainer.totalHours" class="stat-item">
        <text class="stat-value">{{ trainer.totalHours }}</text>
        <text class="stat-label">课时数</text>
      </view>
    </view>

    <!-- 简介 -->
    <view class="section">
      <text class="section-title">简介</text>
      <text class="bio-text">{{ trainer.bio }}</text>
      <view class="expertise">
        <text class="expertise-title">擅长领域</text>
        <view class="expertise-tags">
          <text v-for="tag in trainer.expertise" :key="tag" class="expertise-tag">{{ tag }}</text>
        </view>
      </view>
    </view>

    <!-- 近期课程 -->
    <view v-if="trainer.upcomingCourses.length" class="section">
      <text class="section-title">近期课程</text>
      <view class="upcoming-list">
        <view v-for="course in trainer.upcomingCourses" :key="course.id" class="upcoming-item" @tap="goDetail(course.id)">
          <view class="upcoming-left">
            <text class="upcoming-date">{{ course.date }}</text>
            <text class="upcoming-time">{{ course.time }}</text>
          </view>
          <view class="upcoming-content">
            <text class="upcoming-name">{{ course.name }}</text>
            <text class="upcoming-venue">📍 {{ course.venue }}</text>
          </view>
          <view class="upcoming-right">
            <text class="upcoming-seats">余{{ course.seats }}位</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 学员评价 -->
    <view v-if="trainer.reviews.length" class="section">
      <text class="section-title">学员评价</text>
      <view class="review-list">
        <view v-for="review in trainer.reviews" :key="review.id" class="review-item">
          <view class="review-header">
            <view class="review-avatar">{{ review.user.charAt(0) }}</view>
            <view class="review-info">
              <text class="review-user">{{ review.user }}</text>
              <text class="review-course">{{ review.course }}</text>
            </view>
            <text class="review-date">{{ review.date }}</text>
          </view>
          <text class="review-content">{{ review.content }}</text>
          <view class="review-stars">
            <text v-for="i in 5" :key="i">{{ i <= review.rating ? '⭐' : '☆' }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getTrainer } from '@/api/trainer'

const trainer = ref<any>({
  id: '',
  name: '',
  level: 1,
  title: '导师',
  bio: '',
  expertise: [] as string[],
  totalStudents: 0,
  rating: '',
  totalHours: 0,
  upcomingCourses: [] as any[],
  reviews: [] as any[],
})

async function loadTrainer(id: string) {
  try {
    const t: any = await getTrainer(id)
    if (!t) return
    trainer.value = {
      ...trainer.value,
      id: t.id,
      name: t.displayName || '导师',
      level: t.level ?? 1,
      title: t.certBadge || t.title || '导师',
      bio: t.bio || '',
      expertise: t.specialties || [],
    }
  } catch (e) {
    // 错误已由 request 统一提示
  }
}

onLoad((options) => {
  const id = options?.id
  if (id) loadTrainer(id)
})

function goBack() {
  uni.navigateBack()
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/course-detail/index?id=${id}` })
}
</script>

<style scoped>
.page { min-height: 100vh; background: #F5E8D8; }

.cover { background: linear-gradient(135deg, #6B463C, #4B3621); padding: 60rpx 32rpx 48rpx; position: relative; }
.back-btn { position: absolute; top: 24rpx; left: 24rpx; width: 64rpx; height: 64rpx; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36rpx; color: #FFF; }
.cover-content { display: flex; flex-direction: column; align-items: center; }
.trainer-avatar { width: 140rpx; height: 140rpx; border-radius: 50%; background: rgba(255,255,255,0.2); color: #FFF; font-size: 56rpx; display: flex; align-items: center; justify-content: center; margin-bottom: 16rpx; border: 4rpx solid rgba(255,255,255,0.4); }
.trainer-name { font-size: 36rpx; font-weight: 700; color: #FFF; margin-bottom: 12rpx; }
.trainer-tags { display: flex; gap: 12rpx; }
.level-tag { font-size: 22rpx; color: #FFF; background: rgba(255,255,255,0.2); padding: 6rpx 16rpx; border-radius: 12rpx; }
.title-tag { font-size: 22rpx; color: #FFF; opacity: 0.8; }

.stats-bar { display: flex; margin: -30rpx 32rpx 24rpx; background: #FFF; border-radius: 20rpx; padding: 32rpx 0; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.stat-item { flex: 1; text-align: center; }
.stat-value { font-size: 36rpx; font-weight: 700; color: #4B3621; display: block; }
.stat-label { font-size: 22rpx; color: #A08A72; }

.section { margin: 0 32rpx 24rpx; background: #FFF; border-radius: 20rpx; padding: 28rpx; }
.section-title { font-size: 30rpx; font-weight: 700; color: #4B3621; margin-bottom: 16rpx; display: block; }
.bio-text { font-size: 26rpx; color: #7D665C; line-height: 1.8; display: block; margin-bottom: 20rpx; }
.expertise-title { font-size: 24rpx; color: #A08A72; margin-bottom: 12rpx; display: block; }
.expertise-tags { display: flex; flex-wrap: wrap; gap: 12rpx; }
.expertise-tag { font-size: 22rpx; color: #6B463C; background: #F5E8D8; padding: 8rpx 20rpx; border-radius: 20rpx; }

.upcoming-list { display: flex; flex-direction: column; gap: 16rpx; }
.upcoming-item { display: flex; align-items: center; gap: 16rpx; padding: 16rpx; background: #FAF5F0; border-radius: 12rpx; }
.upcoming-left { text-align: center; min-width: 90rpx; }
.upcoming-date { font-size: 24rpx; color: #4B3621; font-weight: 500; display: block; }
.upcoming-time { font-size: 22rpx; color: #A08A72; }
.upcoming-content { flex: 1; }
.upcoming-name { font-size: 26rpx; color: #4B3621; display: block; margin-bottom: 4rpx; }
.upcoming-venue { font-size: 22rpx; color: #A08A72; }
.upcoming-right { }
.upcoming-seats { font-size: 22rpx; color: #27AE60; background: #E8F5E9; padding: 4rpx 12rpx; border-radius: 8rpx; }

.review-list { display: flex; flex-direction: column; gap: 20rpx; }
.review-item { padding-bottom: 20rpx; border-bottom: 1rpx solid #F5F0EB; }
.review-item:last-child { border-bottom: none; padding-bottom: 0; }
.review-header { display: flex; align-items: center; gap: 12rpx; margin-bottom: 12rpx; }
.review-avatar { width: 48rpx; height: 48rpx; border-radius: 50%; background: #F5E8D8; color: #6B463C; font-size: 22rpx; display: flex; align-items: center; justify-content: center; }
.review-info { flex: 1; }
.review-user { font-size: 26rpx; font-weight: 500; color: #4B3621; display: block; }
.review-course { font-size: 20rpx; color: #A08A72; }
.review-date { font-size: 20rpx; color: #A08A72; }
.review-content { font-size: 26rpx; color: #7D665C; line-height: 1.6; display: block; margin-bottom: 8rpx; }
.review-stars { font-size: 24rpx; }
</style>
