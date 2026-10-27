<template>
  <view class="page">
    <FloatingBack />
    <view class="hero"><BrandCover :label="tr('Full愈 · 在场', 'Full愈 · Presence')" height="320rpx" /></view>
    <PageState v-if="loading" state="loading" :title="tr('正在载入导师主页', 'Loading trainer profile')" />
    <PageState v-else-if="loadError" state="error" :title="tr('导师主页加载失败', 'Failed to load trainer profile')" :action="tr('重新加载', 'Reload')" @action="loadTrainer(trainerId)" />
    <PageState v-else-if="!trainer" state="empty" :title="tr('导师资料暂不可查看', 'Trainer profile is unavailable')" :action="tr('返回首页', 'Back to home')" @action="goBack" />
    <view v-else class="content">
      <view class="card profile-card">
        <view class="profile-row">
          <image v-if="trainer.avatar" class="avatar" :src="trainer.avatar" mode="aspectFill" />
          <view v-else class="avatar avatar-placeholder"><PresenceIcon name="user" :size="54" /></view>
          <view class="grow"><text class="trainer-name serif">{{ trainer.displayName || tr('导师', 'Guide') }}</text><view class="tags"><text v-if="trainer.title" class="tag">{{ trainer.title }}</text><text v-if="trainer.certBadge" class="tag">{{ trainer.certBadge }}</text><text v-if="trainer.seedifyCert" class="tag gold">{{ tr('Full愈认证', 'Full愈 Certified') }}</text></view></view>
        </view>
        <view class="stats-bar">
          <view class="stat-item"><text class="stat-value latin">{{ trainer.stats?.totalCourses ?? '—' }}</text><text class="secondary">{{ tr('课程总数', 'Classes') }}</text></view>
          <view class="stat-item"><text class="stat-value latin">{{ trainer.stats?.totalStudents ?? '—' }}</text><text class="secondary">{{ tr('服务学员', 'Students') }}</text></view>
          <view class="stat-item"><text class="stat-value latin">{{ reviewsLoading || reviewsError ? '—' : reviewCount ? rating : tr('暂无', 'N/A') }}</text><text class="secondary">{{ tr('学员评分', 'Rating') }}</text></view>
        </view>
      </view>

      <view class="section-heading"><text class="serif">{{ tr('关于我', 'About') }}</text><text class="caption">About</text></view>
      <view class="card"><text class="bio-text">{{ trainer.bio || tr('导师还未填写简介。', 'The trainer has not added a bio yet.') }}</text><view v-if="trainer.specialties.length" class="tags expertise"><text v-for="tag in trainer.specialties" :key="tag" class="tag">{{ tag }}</text></view></view>

      <view id="upcoming" class="section-heading"><text class="serif">{{ tr('近期课程', 'Upcoming classes') }}</text><text class="caption">Upcoming</text></view>
      <view v-if="trainer.upcomingCourses.length" class="course-list">
        <button v-for="course in trainer.upcomingCourses" :key="course.id" class="card course-item" @tap="goDetail(course.id)">
          <view class="date-block"><PresenceIcon name="calendar" :size="36" /><text>{{ formatDate(course.date) }}</text></view>
          <view class="grow"><text class="course-name">{{ course.name }}</text><text class="secondary">{{ course.time }}</text><text v-if="course.venue" class="secondary">{{ course.venue }}</text><text v-if="course.seats != null" class="seat-text">{{ course.seats > 0 ? tr(`余 ${course.seats} 位`, `${course.seats} seats left`) : tr('已约满', 'Fully booked') }}</text></view>
          <PresenceIcon name="arrow" :size="30" />
        </button>
      </view>
      <view v-else class="card"><PageState state="empty" :title="tr('暂无近期课程', 'No upcoming classes')" :message="tr('新的安排发布后会在这里展示。', 'New sessions will appear here once published.')" /></view>

      <view class="section-heading"><text class="serif">{{ tr('学员评价', 'Student reviews') }}</text><text v-if="!reviewsLoading && !reviewsError" class="caption">{{ tr(`${reviewCount} 条`, `${reviewCount} reviews`) }}</text></view>
      <view class="card">
        <PageState v-if="reviewsLoading" state="loading" :title="tr('正在载入评价', 'Loading reviews')" />
        <PageState v-else-if="reviewsError" state="error" :title="tr('评价加载失败', 'Failed to load reviews')" :action="tr('重试', 'Retry')" @action="loadReviews(trainerId)" />
        <PageState v-else-if="!reviews.length" state="empty" :title="tr('还没有学员评价', 'No student reviews yet')" :message="tr('真实的练习感受，将在这里相遇。', 'Honest reflections will appear here.')" />
        <view v-else class="review-list">
          <view v-for="review in reviews" :key="review.id" class="review-item">
            <view class="review-header"><image v-if="review.user?.avatar" class="review-avatar" :src="review.user.avatar" mode="aspectFill" /><view v-else class="review-avatar avatar-placeholder"><PresenceIcon name="user" :size="28" /></view><view class="grow"><text class="review-user">{{ review.user?.nickname || tr('匿名用户', 'Anonymous') }}</text><text v-if="review.course?.title" class="secondary">{{ review.course.title }}</text></view><text class="secondary">{{ formatDate(review.createdAt) }}</text></view>
            <view class="review-stars" :aria-label="tr(`${review.rating}分，满分5分`, `${review.rating} out of 5`)"><view v-for="i in 5" :key="i" class="star-cell" :class="{ dim: i > review.rating }"><PresenceIcon name="star" :size="28" /></view><text class="secondary">{{ review.rating }} {{ tr('分', 'pts') }}</text></view>
            <text v-if="review.content" class="review-content">{{ review.content }}</text>
          </view>
        </view>
      </view>
      <button v-if="trainer.upcomingCourses.length" class="primary-btn" @tap="viewCourses">{{ tr('看 TA 的课程', 'View their classes') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getTrainer } from '@/api/trainer'
import { getTrainerReviews, type TrainerReviewsResult } from '@/api/review'
import { tr, isEnglish } from '@/locale'
import PresenceIcon from '@/components/PresenceIcon.vue'
import BrandCover from '@/components/BrandCover.vue'
import PageState from '@/components/PageState.vue'
import FloatingBack from '@/components/FloatingBack.vue'

const trainer = ref<any>(null)
const trainerId = ref('')
const loading = ref(true)
const loadError = ref(false)
const reviewsLoading = ref(false)
const reviewsError = ref(false)
const reviews = ref<TrainerReviewsResult['reviews']>([])
const reviewCount = ref(0)
const rating = ref<number | null>(null)

async function loadTrainer(id: string) {
  trainerId.value = id
  loading.value = true
  loadError.value = false
  trainer.value = null
  reviews.value = []
  rating.value = null
  reviewCount.value = 0
  try {
    if (!id) return
    const t = await getTrainer(id)
    if (!t?.id) return
    trainer.value = { ...t, specialties: Array.isArray(t.specialties) ? t.specialties : [], upcomingCourses: Array.isArray(t.upcomingCourses) ? t.upcomingCourses : [] }
  } catch {
    loadError.value = true
  } finally { loading.value = false }
  if (trainer.value) await loadReviews(id)
}
async function loadReviews(id: string) {
  if (reviewsLoading.value || !id) return
  reviewsLoading.value = true
  reviewsError.value = false
  try {
    const data = await getTrainerReviews(id)
    if (!data) throw new Error(tr('评价数据暂不可用', 'Review data is unavailable'))
    reviews.value = data.reviews || []
    reviewCount.value = data.count
    rating.value = data.avgRating
  } catch {
    reviewsError.value = true
    rating.value = null
  } finally { reviewsLoading.value = false }
}
function formatDate(value: string) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return tr('时间待确认', 'Time TBC')
  if (isEnglish()) return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()]} ${date.getDate()}`
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
onLoad((options) => { loadTrainer(options?.id || '') })
function goBack() { if (getCurrentPages().length > 1) uni.navigateBack(); else uni.switchTab({ url: '/pages/index/index' }) }
function goDetail(id: string) { if (id) uni.navigateTo({ url: `/pages/course-detail/index?id=${id}` }) }
function viewCourses() { uni.pageScrollTo({ selector: '#upcoming', duration: 250 }) }
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; line-height: 1.6; padding-bottom: env(safe-area-inset-bottom); }
button { margin: 0; font-size: 28rpx; line-height: 1.6; }
button::after { border: 0; }
.hero { position: relative; }
.content { padding: 32rpx; }
.card { background: var(--c-card); border-radius: var(--radius-card); padding: 32rpx; box-shadow: var(--shadow-card); }
.profile-row { display: flex; align-items: center; gap: 24rpx; }
.avatar { width: 128rpx; height: 128rpx; border-radius: 50%; flex-shrink: 0; }
.avatar-placeholder { display: flex; align-items: center; justify-content: center; background: var(--c-card-2); }
.grow { flex: 1; min-width: 0; text-align: left; }
.trainer-name { display: block; font-size: 40rpx; margin-bottom: 8rpx; overflow-wrap: anywhere; }
.tags { display: flex; flex-wrap: wrap; gap: 12rpx; }
.tag { font-size: 24rpx; color: var(--c-primary); background: var(--c-card-2); padding: 4rpx 16rpx; border-radius: 16rpx; }
.tag.gold { background: var(--c-gold); }
.stats-bar { display: flex; border-top: 1rpx solid var(--line-soft); margin-top: 28rpx; padding-top: 28rpx; }
.stat-item { flex: 1; text-align: center; border-right: 1rpx solid var(--line-soft); }
.stat-item:last-child { border-right: 0; }
.stat-value { display: block; font-size: 38rpx; font-weight: 600; color: var(--c-primary); }
.secondary, .caption { display: block; font-size: 24rpx; color: var(--c-muted); }
.section-heading { display: flex; align-items: baseline; gap: 14rpx; font-size: 34rpx; margin: 40rpx 0 20rpx; }
.bio-text { display: block; font-size: 28rpx; line-height: 1.85; white-space: pre-wrap; }
.expertise { margin-top: 24rpx; }
.course-list { display: flex; flex-direction: column; gap: 24rpx; }
.course-item { width: 100%; display: flex; align-items: center; gap: 24rpx; color: var(--c-ink); }
.date-block { flex-shrink: 0; width: 112rpx; display: flex; align-items: center; flex-direction: column; gap: 12rpx; font-size: 24rpx; color: var(--c-brown); }
.course-name { display: block; font-size: 30rpx; font-weight: 500; margin-bottom: 8rpx; overflow-wrap: anywhere; }
.seat-text { display: inline-block; margin-top: 12rpx; font-size: 24rpx; padding: 4rpx 16rpx; border-radius: 16rpx; color: var(--c-primary); background: var(--c-card-2); }
.review-item { padding: 28rpx 0; border-bottom: 1rpx solid var(--line-soft); }
.review-item:first-child { padding-top: 0; }
.review-item:last-child { border: 0; padding-bottom: 0; }
.review-header { display: flex; align-items: center; gap: 16rpx; }
.review-avatar { width: 64rpx; height: 64rpx; border-radius: 50%; flex-shrink: 0; }
.review-user { display: block; font-weight: 500; }
.review-content { display: block; margin-top: 16rpx; line-height: 1.85; white-space: pre-wrap; overflow-wrap: anywhere; }
.review-stars { display: flex; align-items: center; gap: 6rpx; margin-top: 16rpx; }
.review-stars .secondary { margin-left: 12rpx; }
.star-cell { display: flex; }
.star-cell.dim { opacity: .25; }
.primary-btn { margin-top: 32rpx; padding: 24rpx; min-height: 88rpx; border-radius: var(--radius-button); background: var(--c-primary); color: var(--c-rice); font-weight: 600; }
</style>
