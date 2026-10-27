<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack fallback="/pages/profile/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }"><view class="back-spacer"></view><text class="nav-title serif">{{ tr('我的评价', 'My reviews') }}</text></view>
    <view class="content">
      <PageState v-if="!isLoggedIn" state="guest" :title="tr('登录后查看评价', 'Log in to view your reviews')" :message="tr('每一次在场的感受，都值得被记录', 'Every moment of presence is worth remembering')" :action="tr('去登录', 'Log in')" @action="goLogin" />
      <PageState v-else-if="loading" state="loading" :title="tr('正在读取评价', 'Loading reviews')" />
      <PageState v-else-if="loadError" state="error" :title="tr('评价加载失败', 'Failed to load reviews')" :message="tr('请检查网络后重试，不会影响已提交的评价', 'Check your network and retry. Submitted reviews are not affected.')" :action="tr('重新加载', 'Reload')" @action="load" />
      <template v-else>
        <view class="review-heading"><text class="review-count">{{ tr('已评价', 'Reviewed') }} · {{ reviews.length }}</text><button class="bookings-link" @tap="goBookings">{{ tr('我的预约', 'My bookings') }}<PresenceIcon name="arrow" :size="26" /></button></view>
        <view class="review-notice"><PresenceIcon name="info" :size="30" /><text>{{ tr('想记录新的上课感受？请在「我的预约」中查看可评价课程。', 'Want to review another class? Find reviewable classes in My bookings.') }}</text></view>
        <view v-for="item in reviews" :key="item.id" class="review-card">
          <button class="course-row" @tap="goCourse(item.courseId)">
            <view class="course-cover"><image v-if="item.course?.coverImage && !failedCovers[item.id]" :src="item.course.coverImage" class="cover-image" mode="aspectFill" @error="failedCovers[item.id] = true" /><BrandCover v-else height="128rpx" icon="leaf" :label="tr('在场', 'Presence')" /></view>
            <view class="course-copy"><text class="course-title">{{ item.course?.title || tr('课程', 'Course') }}</text><text class="review-date">{{ formatDate(item.createdAt) }}</text></view>
            <PresenceIcon name="arrow" :size="28" />
          </button>
          <view class="rating-row" :aria-label="tr(`${item.rating}分，满分5分`, `${item.rating} out of 5`)"><PresenceIcon v-for="n in 5" :key="n" name="star" :size="32" :color="n <= item.rating ? iconColors.brown : iconColors.line" /><text class="rating-number">{{ item.rating }} / 5</text></view>
          <text v-if="item.content" class="review-content">{{ item.content }}</text>
          <text v-else class="rating-only">{{ tr('这次留下了星级评价', 'A star rating was left without a comment') }}</text>
        </view>
        <PageState v-if="!reviews.length" state="empty" :title="tr('还没有评价', 'No reviews yet')" :message="tr('上完课后，可以在这里留下你的感受', 'After class, leave your thoughts here')" :action="tr('看看我的预约', 'View my bookings')" @action="goBookings" />
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listMyReviews, type MyReview } from '@/api/review'
import { useUserStore } from '@/stores/user'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'
import BrandCover from '@/components/BrandCover.vue'
import PageState from '@/components/PageState.vue'
import FloatingBack from '@/components/FloatingBack.vue'

// SVG data-URL images require resolved DESIGN token values, not page CSS variables.
const iconColors = { brown: '#96581c', line: '#e6dcc4' }
const userStore = useUserStore()
const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const isLoggedIn = computed(() => userStore.isLoggedIn)
const reviews = ref<MyReview[]>([])
const loading = ref(false)
const loadError = ref(false)
const failedCovers = ref<Record<string, boolean>>({})
async function load() {
  if (!uni.getStorageSync('token')) userStore.logout()
  if (!isLoggedIn.value) { reviews.value = []; failedCovers.value = {}; return }
  if (loading.value) return
  loading.value = true
  loadError.value = false
  try {
    const rows = await listMyReviews()
    if (!uni.getStorageSync('token')) { userStore.logout(); return }
    reviews.value = rows || []
    failedCovers.value = {}
  } catch {
    loadError.value = true
    if (!uni.getStorageSync('token')) userStore.logout()
  } finally { loading.value = false }
}
function formatDate(value: string) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  if (isEnglish()) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function goCourse(id: string) { if (id) uni.navigateTo({ url: `/pages/course-detail/index?id=${encodeURIComponent(id)}` }) }
function goBookings() { uni.switchTab({ url: '/pages/my-courses/index' }) }
function goLogin() { uni.switchTab({ url: '/pages/profile/index' }) }
function goBack() { if (getCurrentPages().length > 1) uni.navigateBack(); else goLogin() }
onShow(load)
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); }
.nav-bar { padding: 20rpx 32rpx; display: flex; align-items: center; gap: 16rpx; }
.back-spacer { width: 80rpx; height: 80rpx; flex-shrink: 0; }
.nav-title { font-size: 36rpx; }
.content { padding: 0 32rpx; }
button::after { border: none; }
.review-heading { display: flex; align-items: center; justify-content: space-between; gap: 24rpx; border-bottom: 2rpx solid var(--line-soft); margin-bottom: 24rpx; }
.review-count { padding: 24rpx 4rpx; font-size: 28rpx; font-weight: 600; color: var(--c-primary); border-bottom: 3rpx solid var(--c-primary); }
.bookings-link { display: flex; align-items: center; gap: 8rpx; padding: 24rpx 0; margin: 0; background: transparent; color: var(--c-brown); font-size: 26rpx; line-height: 1.6; }
.review-notice { display: flex; gap: 16rpx; align-items: flex-start; background: var(--c-card-2); border-radius: var(--radius-button); color: var(--c-muted); font-size: 24rpx; line-height: 1.7; padding: 24rpx; margin-bottom: 24rpx; }
.review-card { background: var(--c-card); border-radius: var(--radius-card); padding: 32rpx; margin-bottom: 24rpx; box-shadow: var(--shadow-card); }
.course-row { display: flex; align-items: center; gap: 24rpx; margin: 0; padding: 0; background: transparent; text-align: left; color: var(--c-ink); line-height: 1.5; }
.course-cover { width: 128rpx; height: 128rpx; overflow: hidden; border-radius: 20rpx; flex-shrink: 0; }
.course-cover :deep(.brand-en) { display: none; }
.cover-image { width: 128rpx; height: 128rpx; }
.course-copy { flex: 1; min-width: 0; }
.course-title { display: block; font-size: 30rpx; font-weight: 600; overflow-wrap: anywhere; }
.review-date { display: block; margin-top: 12rpx; color: var(--c-muted); font-size: 24rpx; }
.rating-row { display: flex; gap: 8rpx; align-items: center; margin: 28rpx 0 20rpx; }
.rating-number { margin-left: 12rpx; font-size: 24rpx; color: var(--c-muted); }
.review-content { display: block; font-size: 28rpx; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.rating-only { display: block; font-size: 24rpx; color: var(--c-muted); }
</style>
