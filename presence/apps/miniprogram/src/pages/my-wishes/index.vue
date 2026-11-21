<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack fallback="/pages/profile/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }"><view class="back-spacer"></view><text class="nav-title serif">{{ tr('我的心愿', 'My wishes') }}</text></view>
    <view class="content">
      <PageState v-if="!isLoggedIn" state="guest" :title="tr('登录后查看心愿', 'Log in to see your wishes')" :message="tr('在往期课程下许愿，开新班时第一时间通知你', 'Wish on a past class and we will tell you when it returns')" :action="tr('去登录', 'Log in')" @action="goLogin" />
      <PageState v-else-if="loading" state="loading" :title="tr('正在读取心愿', 'Loading wishes')" />
      <PageState v-else-if="loadError" state="error" :title="tr('心愿加载失败', 'Failed to load wishes')" :message="tr('请检查网络后重试，已许下的心愿不会丢失', 'Check your network and retry. Your wishes are safe.')" :action="tr('重新加载', 'Reload')" @action="load" />
      <template v-else>
        <view class="wish-notice"><PresenceIcon name="info" :size="30" /><text>{{ tr('课程重新开课时，我们会通过微信服务通知第一时间提醒你。', 'When the class returns, we will notify you via WeChat service message.') }}</text></view>
        <view v-for="item in wishes" :key="item.id" class="wish-card">
          <button class="course-row" @tap="goCourse(item.course?.id)">
            <view class="course-cover"><image v-if="item.course?.coverImage && !failedCovers[item.id]" :src="item.course.coverImage" class="cover-image" mode="aspectFill" @error="failedCovers[item.id] = true" /><BrandCover v-else height="128rpx" icon="heart" :label="tr('在场', 'Presence')" /></view>
            <view class="course-copy">
              <text class="course-title">{{ item.course?.title || tr('课程', 'Course') }}</text>
              <text class="course-meta">{{ formatCourseTime(item.course) }}</text>
              <text class="course-meta">{{ item.course?.venue?.name || tr('地点待确认', 'Venue TBC') }}</text>
            </view>
            <PresenceIcon name="arrow" :size="28" />
          </button>
          <view class="wish-foot">
            <text class="wish-date">{{ tr('许愿于', 'Wished') }} {{ formatDate(item.createdAt) }}</text>
            <text v-if="item.notifiedAt" class="wish-released">{{ tr('已通知你', 'You were notified') }}</text>
            <text v-else class="wish-waiting">{{ tr('等待开售 / 开新班', 'Waiting for enrollment or a new session') }}</text>
          </view>
        </view>
        <PageState v-if="!wishes.length" state="empty" :title="tr('还没有心愿', 'No wishes yet')" :message="tr('在往期课程或尚未开售的课程详情里点「许个心愿」，开售/开新班时就不会错过', 'Tap Make a wish on a past or not-yet-open class so you never miss it')" :action="tr('去首页看看', 'Browse classes')" @action="goHome" />
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listMyCourseWishes, type MyCourseWish } from '@/api/courseWish'
import { useUserStore } from '@/stores/user'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'
import BrandCover from '@/components/BrandCover.vue'
import PageState from '@/components/PageState.vue'
import FloatingBack from '@/components/FloatingBack.vue'

const userStore = useUserStore()
const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const isLoggedIn = computed(() => userStore.isLoggedIn)
const wishes = ref<MyCourseWish[]>([])
const loading = ref(false)
const loadError = ref(false)
const failedCovers = ref<Record<string, boolean>>({})
async function load() {
  if (!uni.getStorageSync('token')) userStore.logout()
  if (!isLoggedIn.value) { wishes.value = []; failedCovers.value = {}; return }
  if (loading.value) return
  loading.value = true
  loadError.value = false
  try {
    const data = await listMyCourseWishes()
    if (!uni.getStorageSync('token')) { userStore.logout(); return }
    wishes.value = data?.items || []
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
function formatCourseTime(course?: MyCourseWish['course']) {
  if (!course) return ''
  if (course.startDate) {
    const date = String(course.startDate).slice(0, 10)
    return [date, [course.startTime, course.endTime].filter(Boolean).join('–')].filter(Boolean).join(' ')
  }
  return formatDate(course.startAt || '')
}
function goCourse(id?: string) { if (id) uni.navigateTo({ url: `/pages/course-detail/index?id=${encodeURIComponent(id)}` }) }
function goHome() { uni.switchTab({ url: '/pages/index/index' }) }
function goLogin() { uni.switchTab({ url: '/pages/profile/index' }) }
onShow(load)
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); }
.nav-bar { padding: 20rpx 32rpx; display: flex; align-items: center; gap: 16rpx; }
.back-spacer { width: 80rpx; height: 80rpx; flex-shrink: 0; }
.nav-title { font-size: 36rpx; }
.content { padding: 0 32rpx; }
button::after { border: none; }
.wish-notice { display: flex; gap: 16rpx; align-items: flex-start; background: var(--c-card-2); border-radius: var(--radius-button); color: var(--c-muted); font-size: 24rpx; line-height: 1.7; padding: 24rpx; margin-bottom: 24rpx; }
.wish-card { background: var(--c-card); border-radius: var(--radius-card); padding: 32rpx; margin-bottom: 24rpx; box-shadow: var(--shadow-card); }
.course-row { display: flex; align-items: center; gap: 24rpx; margin: 0; padding: 0; background: transparent; text-align: left; color: var(--c-ink); line-height: 1.5; }
.course-cover { width: 128rpx; height: 128rpx; overflow: hidden; border-radius: 20rpx; flex-shrink: 0; }
.course-cover :deep(.brand-en) { display: none; }
.cover-image { width: 128rpx; height: 128rpx; }
.course-copy { flex: 1; min-width: 0; }
.course-title { display: block; font-size: 30rpx; font-weight: 600; overflow-wrap: anywhere; }
.course-meta { display: block; margin-top: 8rpx; color: var(--c-muted); font-size: 24rpx; }
.wish-foot { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-top: 24rpx; padding-top: 20rpx; border-top: 1rpx solid var(--line-soft); font-size: 24rpx; }
.wish-date { color: var(--c-muted); }
.wish-waiting { color: var(--c-brown); }
.wish-released { color: var(--c-primary); font-weight: 600; }
</style>