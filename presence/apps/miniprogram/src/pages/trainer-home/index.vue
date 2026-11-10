<template>
  <view class="page">
    <!-- 导师封面 -->
    <view class="cover">
      <view class="back-btn" @tap="goBack"><text>←</text></view>
      <view class="cover-content">
        <image v-if="trainer.avatar" class="trainer-avatar-img" :src="trainer.avatar" mode="aspectFill" />
        <view v-else class="trainer-avatar">{{ trainer.name.charAt(0) }}</view>
        <text class="trainer-name serif">{{ trainer.name }}</text>
        <view class="trainer-tags">
          <text class="level-tag">LV{{ trainer.level }}</text>
          <text v-if="trainer.seedifyCert" class="cert-tag">Seedify认证</text>
          <text class="title-tag">{{ trainer.title }}</text>
        </view>
      </view>
    </view>

    <!-- 数据统计 -->
    <view v-if="trainer.totalStudents || trainer.rating || trainer.totalHours" class="stats-bar">
      <view v-if="trainer.totalStudents" class="stat-item">
        <text class="stat-value latin">{{ trainer.totalStudents }}</text>
        <text class="stat-label">总学员</text>
      </view>
      <view v-if="trainer.rating" class="stat-item">
        <text class="stat-value latin">{{ trainer.rating }}</text>
        <text class="stat-label">评分</text>
      </view>
      <view v-if="trainer.totalHours" class="stat-item">
        <text class="stat-value latin">{{ trainer.totalHours }}</text>
        <text class="stat-label">课程数</text>
      </view>
    </view>

    <!-- 简介 -->
    <view class="section">
      <text class="section-title serif">简介</text>
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
      <text class="section-title serif">近期课程</text>
      <view class="upcoming-list">
        <view v-for="course in trainer.upcomingCourses" :key="course.id" class="upcoming-item" @tap="goDetail(course.id)">
          <view class="upcoming-left">
            <text class="upcoming-date">{{ course.date }}</text>
            <text class="upcoming-time">{{ course.time }}</text>
          </view>
          <view class="upcoming-content">
            <text class="upcoming-name">{{ course.name }}</text>
            <text class="upcoming-venue">{{ course.venue }}</text>
          </view>
          <view class="upcoming-right">
            <text class="upcoming-seats">余{{ course.seats }}位</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 学员评价 -->
    <view v-if="trainer.reviews.length" class="section">
      <text class="section-title serif">学员评价</text>
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
            <text v-for="i in 5" :key="i" class="star" :class="{ dim: i > review.rating }">★</text>
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
import { getTrainerReviews } from '@/api/review'

const trainer = ref<any>({
  id: '',
  name: '',
  avatar: '',
  seedifyCert: false,
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
      avatar: t.avatar || '',
      seedifyCert: !!t.seedifyCert,
      level: t.level ?? 1,
      title: t.certBadge || t.title || '导师',
      bio: t.bio || '',
      expertise: t.specialties || [],
      totalStudents: t.stats?.totalStudents || 0,
      totalHours: t.stats?.totalCourses || 0,
      upcomingCourses: (t.upcomingCourses || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        date: formatDate(c.date),
        time: c.time,
        venue: c.venue,
        seats: c.seats,
      })),
    }
  } catch (e) {
    // 错误已由 request 统一提示
  }
  loadReviews(id)
}

async function loadReviews(id: string) {
  try {
    const res: any = await getTrainerReviews(id)
    if (!res) return
    trainer.value.rating = res.avgRating ? String(res.avgRating) : ''
    trainer.value.reviews = (res.reviews || []).map((r: any) => ({
      id: r.id,
      user: r.user?.nickname || '匿名用户',
      course: r.course?.title || '',
      date: formatDate(r.createdAt),
      content: r.content || '',
      rating: r.rating,
    }))
  } catch (e) {
    // 静默
  }
}

function formatDate(v: string) {
  if (!v) return ''
  const d = new Date(v)
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
.page { min-height: 100vh; background: #EAE0D7; }

.cover { position: relative; overflow: hidden; background: linear-gradient(135deg, #584219, #3F2F10); padding: 80rpx 32rpx 56rpx; }
.back-btn { position: absolute; top: 24rpx; left: 24rpx; width: 64rpx; height: 64rpx; background: rgba(251, 248, 243, 0.22); backdrop-filter: blur(12px); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36rpx; color: #F7F2E9; }
.cover-content { display: flex; flex-direction: column; align-items: center; }
.trainer-avatar-img { width: 148rpx; height: 148rpx; border-radius: 50%; margin-bottom: 20rpx; border: 4rpx solid rgba(247, 242, 233, 0.4); }
.trainer-avatar { width: 148rpx; height: 148rpx; border-radius: 50%; background: rgba(247, 242, 233, 0.2); color: #F7F2E9; font-size: 56rpx; display: flex; align-items: center; justify-content: center; margin-bottom: 20rpx; border: 4rpx solid rgba(247, 242, 233, 0.4); }
.trainer-name { font-size: 40rpx; color: #F7F2E9; margin-bottom: 14rpx; }
.trainer-tags { display: flex; gap: 12rpx; align-items: center; }
.level-tag { font-size: 22rpx; color: #F7F2E9; background: rgba(247, 242, 233, 0.2); padding: 6rpx 20rpx; border-radius: 999rpx; }
.cert-tag { font-size: 22rpx; color: #EAD9B8; background: rgba(201, 163, 92, 0.3); padding: 6rpx 20rpx; border-radius: 999rpx; }
.title-tag { font-size: 22rpx; color: rgba(247, 242, 233, 0.8); }

.stats-bar { display: flex; margin: -36rpx 32rpx 28rpx; background: #FBF8F3; border-radius: 44rpx; padding: 36rpx 0; box-shadow: 0 10rpx 32rpx rgba(63, 47, 16, 0.1); position: relative; }
.stat-item { flex: 1; text-align: center; }
.stat-value { font-size: 38rpx; font-weight: 600; color: #584219; display: block; }
.stat-label { font-size: 22rpx; color: #A78E70; }

.section { margin: 0 32rpx 28rpx; background: #FBF8F3; border-radius: 44rpx; padding: 36rpx 32rpx; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.section-title { font-size: 32rpx; color: #584219; margin-bottom: 20rpx; display: block; }
.bio-text { font-size: 26rpx; color: #6D5934; line-height: 1.9; display: block; margin-bottom: 24rpx; }
.expertise-title { font-size: 24rpx; color: #A78E70; margin-bottom: 14rpx; display: block; }
.expertise-tags { display: flex; flex-wrap: wrap; gap: 12rpx; }
.expertise-tag { font-size: 22rpx; color: #584219; background: rgba(88, 66, 25, 0.08); padding: 8rpx 24rpx; border-radius: 999rpx; letter-spacing: 1rpx; }

.upcoming-list { display: flex; flex-direction: column; gap: 16rpx; }
.upcoming-item { display: flex; align-items: center; gap: 20rpx; padding: 24rpx; background: #F4EEE6; border-radius: 32rpx; }
.upcoming-item:active { transform: scale(0.98); }
.upcoming-left { text-align: center; min-width: 90rpx; }
.upcoming-date { font-size: 24rpx; color: #3F2F10; font-weight: 500; display: block; }
.upcoming-time { font-size: 22rpx; color: #A78E70; }
.upcoming-content { flex: 1; }
.upcoming-name { font-size: 26rpx; color: #3F2F10; display: block; margin-bottom: 4rpx; }
.upcoming-venue { font-size: 22rpx; color: #A78E70; }
.upcoming-seats { font-size: 22rpx; color: #B06A3F; background: rgba(211, 149, 110, 0.16); padding: 6rpx 20rpx; border-radius: 999rpx; letter-spacing: 1rpx; }

.review-list { display: flex; flex-direction: column; gap: 24rpx; }
.review-item { padding-bottom: 24rpx; border-bottom: 2rpx dashed rgba(88, 66, 25, 0.14); }
.review-item:last-child { border-bottom: none; padding-bottom: 0; }
.review-header { display: flex; align-items: center; gap: 14rpx; margin-bottom: 14rpx; }
.review-avatar { width: 52rpx; height: 52rpx; border-radius: 50%; background: rgba(88, 66, 25, 0.08); color: #584219; font-size: 22rpx; display: flex; align-items: center; justify-content: center; }
.review-info { flex: 1; }
.review-user { font-size: 26rpx; font-weight: 500; color: #3F2F10; display: block; }
.review-course { font-size: 20rpx; color: #A78E70; }
.review-date { font-size: 20rpx; color: #A78E70; }
.review-content { font-size: 26rpx; color: #6D5934; line-height: 1.8; display: block; margin-bottom: 10rpx; }
.review-stars { display: flex; gap: 4rpx; }
.star { font-size: 24rpx; color: #584219; }
.star.dim { color: rgba(88, 66, 25, 0.2); }
</style>
