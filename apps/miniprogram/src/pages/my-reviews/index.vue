<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-back" @tap="goBack">‹</text>
      <text class="nav-title serif">我的评价</text>
    </view>

    <view class="review-list">
      <view v-for="item in reviews" :key="item.id" class="review-item">
        <view class="item-header">
          <text class="item-title">{{ item.course?.title || '课程' }}</text>
          <text class="item-date">{{ formatDate(item.createdAt) }}</text>
        </view>
        <view class="item-stars">
          <text v-for="n in 5" :key="n" class="star" :class="{ on: n <= item.rating }">★</text>
        </view>
        <text v-if="item.content" class="item-content">{{ item.content }}</text>
      </view>

      <view v-if="!loading && reviews.length === 0" class="empty">
        <text class="empty-icon">★</text>
        <text class="empty-text">还没有评价，快去体验课程吧</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listMyReviews, type MyReview } from '@/api/review'

const reviews = ref<MyReview[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const rows = await listMyReviews()
    reviews.value = rows || []
  } catch (e) {
    // 静默
  } finally {
    loading.value = false
  }
}

function formatDate(v: string) {
  if (!v) return ''
  const d = new Date(v)
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.switchTab({ url: '/pages/profile/index' })
  }
}

onShow(() => {
  load()
})
</script>

<style scoped>
.page { min-height: 100vh; background: #EAE0D7; padding-bottom: 40rpx; }
.nav-bar { padding: 32rpx 32rpx 20rpx; display: flex; align-items: center; gap: 12rpx; }
.nav-back { font-size: 48rpx; color: #3F2F10; line-height: 1; }
.nav-title { font-size: 38rpx; color: #3F2F10; }

.review-list { padding: 8rpx 32rpx 0; }
.review-item { background: #FBF8F3; border-radius: 44rpx; padding: 32rpx; margin-bottom: 24rpx; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14rpx; }
.item-title { font-size: 30rpx; font-weight: 600; color: #3F2F10; flex: 1; letter-spacing: 1rpx; }
.item-date { font-size: 24rpx; color: #A78E70; margin-left: 16rpx; }
.item-stars { margin-bottom: 14rpx; }
.star { font-size: 30rpx; color: rgba(88, 66, 25, 0.18); margin-right: 6rpx; }
.star.on { color: #584219; }
.item-content { font-size: 26rpx; color: #6D5934; line-height: 1.8; }

.empty { padding: 140rpx 0; text-align: center; }
.empty-icon { font-size: 72rpx; display: block; margin-bottom: 24rpx; color: rgba(88, 66, 25, 0.2); }
.empty-text { font-size: 26rpx; color: #A78E70; letter-spacing: 1rpx; }
</style>
