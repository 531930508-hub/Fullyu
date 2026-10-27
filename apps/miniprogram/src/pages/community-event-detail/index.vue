<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <text class="nav-title serif">{{ tr('社群活动', 'Community event') }}</text>
      <button v-if="event" class="share-button" :aria-label="tr('分享活动', 'Share event')" @tap="shareVisible = true">
        <PresenceIcon name="arrow" :size="30" />
      </button>
      <view v-else class="nav-space"></view>
    </view>

    <PageState v-if="loading" state="loading" :title="tr('正在加载活动', 'Loading event')" />
    <PageState
      v-else-if="loadError"
      state="error"
      :title="tr('活动暂时无法查看', 'Event unavailable')"
      :message="loadError"
      :action="tr('重试', 'Retry')"
      @action="load"
    />
    <template v-else-if="event">
      <view class="hero">
        <image v-if="cover && !coverFailed" class="hero-image" :src="cover" mode="aspectFill" @error="coverFailed = true" />
        <BrandCover v-else :label="event.title" height="320rpx" icon="leaf" />
      </view>

      <view class="content">
        <view class="card">
          <view class="tags">
            <text class="tag">{{ typeName(event.type) }}</text>
            <text v-if="event.scope === 'INTERNAL'" class="tag">仅成员</text>
            <text v-if="event.ended" class="tag muted">{{ tr('已结束', 'Ended') }}</text>
            <text v-else-if="event.signed" class="tag gold">{{ tr('已报名', 'Registered') }}</text>
          </view>
          <text class="event-title serif">{{ event.title }}</text>

          <view class="info-row"><PresenceIcon name="calendar" :size="34" /><view class="grow"><text>{{ dateLabel }}</text><text class="muted block">{{ timeLabel }}</text></view></view>
          <view v-if="event.venue" class="info-row"><PresenceIcon name="pin" :size="34" /><text class="grow">{{ event.venue }}</text></view>
          <view class="info-row"><PresenceIcon name="users" :size="34" /><view class="grow"><text>{{ tr(`已报名 ${event.joined} 人`, `${event.joined} registered`) }}{{ event.capacity ? tr(` / 限额 ${event.capacity}`, ` / limit ${event.capacity}`) : '' }}</text><text v-if="event.capacity > 0 && event.joined >= event.capacity && !event.ended" class="muted block">{{ tr('名额已满，可联系主理人候补。', 'This event is full. Contact the host for a waitlist.') }}</text></view></view>

          <text v-if="event.description" class="description">{{ event.description }}</text>

          <view class="notice">
            <PresenceIcon name="info" :size="30" />
            <text>{{ event.scope === 'INTERNAL' ? tr('该活动仅社群成员可见与报名。', 'This event is only visible to community members.') : tr('活动报名在社群内直接完成；如关联正式课程，请以课程页规则为准。', 'Sign-up happens inside the community. If a formal course is linked, the course page rules apply.') }}</text>
          </view>

          <text v-if="actionError" class="error-text">{{ actionError }}</text>

          <view class="actions">
            <button v-if="event.ended" class="btn-disabled full-width" disabled>{{ tr('活动已结束', 'Event ended') }}</button>
            <button v-else-if="event.signed" class="btn-secondary full-width" :disabled="busy" @tap="onCancel">{{ busy ? tr('处理中…', 'Processing…') : tr('取消报名', 'Cancel registration') }}</button>
            <button v-else class="btn-primary full-width" :disabled="busy || full" @tap="onSignup">
              {{ busy ? tr('处理中…', 'Processing…') : full ? tr('名额已满', 'Full') : guest ? tr('登录后报名', 'Log in to register') : tr('报名参加', 'Register') }}
            </button>
            <button v-if="event.courseId" class="btn-secondary full-width spaced" @tap="goCourse">{{ tr('查看关联课程', 'View linked course') }}</button>
          </view>
        </view>

        <button class="card community-row" @tap="goCommunity">
          <image v-if="communityCover && !coverFailed" class="community-cover" :src="communityCover" mode="aspectFill" />
          <view v-else class="community-cover fallback"><PresenceIcon name="leaf" :size="34" /></view>
          <view class="grow"><text class="community-name">{{ community?.name || event.community.name }}</text><text class="muted block">{{ tr('由社群主理人发起', 'Hosted by the community') }}</text></view>
          <PresenceIcon name="arrow" :size="30" />
        </button>
      </view>
    </template>

    <ShareSheet :show="shareVisible" :targets="shareTargets" :palette="palette" @close="shareVisible = false" @payload="sharePayload = $event" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { fetchEvent, signupEvent, cancelEventSignup, type CommunityEvent } from '@/api/skool'
import { goLoginFor } from '@/utils/share'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PageState from '@/components/PageState.vue'
import BrandCover from '@/components/BrandCover.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'
import FloatingBack from '@/components/FloatingBack.vue'
import ShareSheet from '@/components/ShareSheet.vue'
import type { ShareTargetOption } from '@/utils/share'

type EventDetail = CommunityEvent & { community: { id: string; name: string; cover: string; ownerName: string } }

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop

const communityId = ref('')
const eventId = ref('')
const event = ref<EventDetail | null>(null)
const loading = ref(true)
const loadError = ref('')
const coverFailed = ref(false)
const busy = ref(false)
const actionError = ref('')
const guest = ref(!uni.getStorageSync('token'))
const shareVisible = ref(false)
const sharePayload = ref<any>(null)

const community = computed(() => event.value?.community || null)
const cover = computed(() => event.value?.cover || '')
const communityCover = computed(() => event.value?.community?.cover || '')
const palette = computed(() => 'warm' as const)
const full = computed(() => Boolean(event.value && event.value.capacity > 0 && event.value.joined >= event.value.capacity && !event.value.signed))
const shareTargets = computed<ShareTargetOption[]>(() => event.value ? [{ type: 'event', id: event.value.id, label: tr('社群活动', 'Event') }] : [])

onLoad((query) => {
  eventId.value = query?.id || ''
  communityId.value = query?.cid || query?.communityId || ''
  load()
})

onShareAppMessage(() => ({
  title: sharePayload.value?.title || event.value?.title || tr('Full愈 · 社群活动', 'Full愈 · Community event'),
  path: sharePayload.value?.path || `/pages/community-event-detail/index?id=${encodeURIComponent(eventId.value)}&cid=${encodeURIComponent(communityId.value)}`,
  imageUrl: sharePayload.value?.imageUrl,
}))

// #ifdef MP-WEIXIN
onShareTimeline(() => ({
  title: sharePayload.value?.title || event.value?.title || tr('Full愈 · 社群活动', 'Full愈 · Community event'),
  query: `id=${encodeURIComponent(eventId.value)}&cid=${encodeURIComponent(communityId.value)}`,
  imageUrl: sharePayload.value?.imageUrl,
}))
// #endif

async function load() {
  guest.value = !uni.getStorageSync('token')
  if (!eventId.value || !communityId.value) {
    loading.value = false
    loadError.value = tr('缺少活动信息，请返回社群重新选择。', 'Event information is missing. Return to the community and choose again.')
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchEvent(communityId.value, eventId.value)
    if (!result?.id) throw new Error(tr('活动不存在或已取消。', 'The event does not exist or was cancelled.'))
    event.value = result
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : tr('网络暂不可用，请稍后重试。', 'Network unavailable. Please retry later.')
  } finally {
    loading.value = false
  }
}

async function onSignup() {
  if (!event.value || busy.value) return
  if (!uni.getStorageSync('token')) {
    goLoginFor(`/pages/community-event-detail/index?id=${encodeURIComponent(eventId.value)}&cid=${encodeURIComponent(communityId.value)}`)
    return
  }
  busy.value = true
  actionError.value = ''
  try {
    await signupEvent(communityId.value, eventId.value)
    event.value.signed = true
    event.value.joined = Math.max(event.value.joined, 0) + 1
    uni.showToast({ title: tr('报名成功', 'Registered'), icon: 'success' })
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : tr('报名失败，请稍后重试。', 'Registration failed. Please retry later.')
  } finally {
    busy.value = false
  }
}

async function onCancel() {
  if (!event.value || busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    await cancelEventSignup(communityId.value, eventId.value)
    event.value.signed = false
    event.value.joined = Math.max(0, event.value.joined - 1)
    uni.showToast({ title: tr('已取消报名', 'Registration cancelled'), icon: 'none' })
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : tr('取消失败，请稍后重试。', 'Could not cancel. Please retry later.')
  } finally {
    busy.value = false
  }
}

function goCommunity() {
  const id = communityId.value || event.value?.community.id
  if (id) uni.navigateTo({ url: `/pages/community-detail/index?id=${encodeURIComponent(id)}` })
}

function goCourse() {
  if (event.value?.courseId) uni.navigateTo({ url: `/pages/course-detail/index?id=${encodeURIComponent(event.value.courseId)}` })
}

function typeName(type: string) {
  if (type === 'OFFLINE') return tr('线下活动', 'Offline')
  if (type === 'LIVE') return tr('直播', 'Live')
  return tr('线上活动', 'Online')
}

const dateLabel = computed(() => {
  const value = event.value?.date
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  if (isEnglish()) return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${week}`
})

const timeLabel = computed(() => {
  if (!event.value) return ''
  if (!event.value.endTime) return event.value.time
  return `${event.value.time} – ${event.value.endTime}`
})
</script>

<style scoped>
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 12rpx 32rpx 16rpx; }
.back-spacer { width: 120rpx; }
.nav-space { width: 80rpx; }
.nav-title { font-size: 34rpx; color: var(--c-ink); }
.share-button { width: 72rpx; height: 72rpx; padding: 0; display: flex; align-items: center; justify-content: center; background: var(--c-card-2); border-radius: 50%; transform: rotate(45deg); }
.hero { width: 100%; }
.hero-image { width: 100%; height: 320rpx; display: block; }
.content { padding: 24rpx 32rpx calc(48rpx + env(safe-area-inset-bottom)); }
.tags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-bottom: 12rpx; }
.tag { font-size: 22rpx; padding: 4rpx 14rpx; border-radius: 16rpx; background: var(--c-card-2); color: var(--c-primary); }
.tag.gold { background: #fbf1df; color: #8a5a17; }
.tag.muted { background: #eee9dc; color: var(--c-muted); }
.event-title { font-size: 42rpx; line-height: 1.4; color: var(--c-ink); display: block; margin-bottom: 16rpx; }
.info-row { display: flex; gap: 14rpx; align-items: flex-start; padding: 16rpx 0; border-top: 1rpx solid var(--line-soft); }
.info-row:first-of-type { border-top: none; }
.grow { flex: 1; min-width: 0; }
.block { display: block; }
.description { display: block; margin-top: 12rpx; padding-top: 20rpx; border-top: 1rpx solid var(--line-soft); font-size: 28rpx; line-height: 1.9; color: var(--c-ink); white-space: pre-wrap; }
.notice { display: flex; gap: 12rpx; align-items: flex-start; background: var(--c-card-2); border-radius: 20rpx; padding: 20rpx 24rpx; margin-top: 20rpx; font-size: 24rpx; line-height: 1.7; color: var(--c-muted); }
.error-text { display: block; margin-top: 16rpx; font-size: 24rpx; color: var(--c-error); }
.actions { margin-top: 24rpx; display: flex; flex-direction: column; gap: 16rpx; }
.full-width { width: 100%; }
.community-row { display: flex; align-items: center; gap: 18rpx; width: 100%; text-align: left; }
.community-cover { width: 88rpx; height: 88rpx; border-radius: 20rpx; object-fit: cover; }
.community-cover.fallback { display: flex; align-items: center; justify-content: center; background: var(--c-card-2); }
.community-name { font-size: 30rpx; color: var(--c-ink); }
</style>
