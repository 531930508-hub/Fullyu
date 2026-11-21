<template>
  <view class="page">
    <PortalNav :title="tr('学员评价', 'Student reviews')" :sub="tr('只有你课程下的评价会出现在这里', 'Only reviews for your own classes')" />
    <PageState v-if="loading" state="loading" :title="tr('正在载入评价', 'Loading reviews')" />
    <PageState
      v-else-if="loadError"
      state="error"
      :title="tr('评价加载失败', 'Could not load reviews')"
      :action="tr('重新加载', 'Reload')"
      @action="load"
    />
    <view v-else class="container list">
      <view class="card summary">
        <view class="summary-score">
          <text class="score latin">{{ summary.avgRating ? summary.avgRating.toFixed(1) : '—' }}</text>
          <view class="stars">
            <PresenceIcon
              v-for="n in 5"
              :key="n"
              name="star"
              :size="30"
              :filled="n <= Math.round(summary.avgRating)"
              :color="n <= Math.round(summary.avgRating) ? '#96581c' : '#cfc4a8'"
            />
          </view>
          <text class="score-sub">{{ tr(`共 ${summary.count} 条评价`, `${summary.count} reviews`) }}</text>
        </view>
        <text class="summary-note">
          {{ tr('保持真诚的教学记录，学员的真实反馈会沉淀在这里。', 'Authentic feedback from students stays here as part of your teaching record.') }}
        </text>
      </view>

      <view v-if="!reviews.length" class="card empty-card">
        <text class="empty-title">{{ tr('还没有收到评价', 'No reviews yet') }}</text>
        <text class="empty-sub">{{ tr('课程结束后，学员可以在「我的预约 › 已完成」里写下评价。', 'After a class ends, students can review it under My bookings › Completed.') }}</text>
      </view>

      <view v-for="review in reviews" :key="review.id" class="card review-card">
        <view class="review-head">
          <image v-if="review.user.avatar" :src="review.user.avatar" mode="aspectFill" class="review-avatar" />
          <view v-else class="review-avatar avatar-fallback serif">{{ (review.user.nickname || '学').slice(0, 1) }}</view>
          <view class="review-copy">
            <text class="review-name">{{ review.user.nickname || tr('匿名学员', 'Anonymous') }}</text>
            <text class="review-meta">{{ review.course?.title || tr('课程已下线', 'Class unavailable') }} · {{ formatDate(review.createdAt) }}</text>
          </view>
          <view class="review-stars">
            <PresenceIcon
              v-for="n in 5"
              :key="n"
              name="star"
              :size="24"
              :filled="n <= review.rating"
              :color="n <= review.rating ? '#96581c' : '#cfc4a8'"
            />
          </view>
        </view>
        <text v-if="review.content" class="review-content">{{ review.content }}</text>
        <text v-else class="review-content muted">{{ tr('学员只留下了评分', 'Rated without a comment') }}</text>
      </view>
      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { tr } from '@/locale'
import { getMyReviews, type TrainerReviewResult } from '@/api/trainer-portal'
import { ensureTrainerAuth } from '@/utils/trainer-request'
import PortalNav from '@/components/PortalNav.vue'
import PageState from '@/components/PageState.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'

const loading = ref(true)
const loadError = ref(false)
const result = ref<TrainerReviewResult>({ count: 0, avgRating: 0, reviews: [] })

const reviews = computed(() => result.value.reviews)
/** 统计用后端返回值：列表只取最近 200 条，条数与均分不能按前端列表重算 */
const summary = computed(() => ({ count: result.value.count, avgRating: result.value.avgRating }))

onShow(() => {
  if (!ensureTrainerAuth()) return
  load()
})

async function load() {
  loading.value = true
  loadError.value = false
  try {
    result.value = await getMyReviews()
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const m = date.getMonth() + 1
  const d = date.getDate()
  return tr(`${date.getFullYear()}年${m}月${d}日`, `${date.toLocaleString('en-US', { month: 'short' })} ${d}, ${date.getFullYear()}`)
}
</script>

<style scoped>
.list {
  padding-top: 24rpx;
}
.summary {
  display: flex;
  align-items: center;
  gap: 28rpx;
  padding: 32rpx;
}
.summary-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  min-width: 180rpx;
}
.score {
  font-size: 64rpx;
  color: var(--c-primary);
  line-height: 1.1;
}
.stars {
  display: flex;
  gap: 4rpx;
}
.score-sub {
  font-size: 22rpx;
  color: var(--c-muted);
}
.summary-note {
  flex: 1;
  font-size: 23rpx;
  color: var(--c-muted);
  line-height: 1.7;
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
.review-card {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 28rpx;
  margin-top: 20rpx;
}
.review-head {
  display: flex;
  align-items: center;
  gap: 18rpx;
}
.review-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--c-cream);
}
.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  color: var(--c-brown);
}
.review-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.review-name {
  font-size: 27rpx;
  color: var(--c-ink);
}
.review-meta {
  font-size: 21rpx;
  color: var(--c-muted);
}
.review-stars {
  display: flex;
  gap: 2rpx;
  flex-shrink: 0;
}
.review-content {
  font-size: 26rpx;
  line-height: 1.7;
  color: var(--c-ink);
}
.review-content.muted {
  color: var(--c-muted);
}
</style>