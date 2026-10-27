<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack fallback="/pages/profile/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <text class="nav-title serif">{{ tr('我的社群', 'My communities') }}</text><view class="nav-space"></view>
    </view>
    <view class="content">
      <view class="segments">
        <button class="segment" :class="{ active: currentSegment === 'joined' }" @tap="currentSegment = 'joined'">{{ tr('我加入的', 'Joined') }} <text v-if="!guest && !loadError && !loading" class="count">{{ joined.length }}</text></button>
        <button class="segment" :class="{ active: currentSegment === 'managed' }" @tap="currentSegment = 'managed'">{{ tr('我管理的', 'Managed') }} <text v-if="!guest && !loadError && !loading" class="count">{{ managed.length }}</text></button>
      </view>
      <PageState v-if="guest" state="guest" :title="tr('登录后查看你的社群', 'Sign in to view your communities')" :message="tr('与同频的人相遇，继续一起练习。', 'Meet like-minded people and keep practicing together.')" :action="tr('去登录', 'Sign in')" @action="goLogin" />
      <PageState v-else-if="loading" state="loading" :title="tr('正在加载你的社群', 'Loading your communities')" />
      <PageState v-else-if="loadError" state="error" :title="tr('社群加载失败', 'Could not load communities')" :message="loadError" :action="tr('重新加载', 'Retry')" @action="load" />
      <PageState v-else-if="!visibleCommunities.length" state="empty" :title="currentSegment === 'joined' ? tr('还没有加入社群', 'No communities joined yet') : tr('创建你的第一个社群', 'Create your first community')" :message="currentSegment === 'joined' ? tr('找到同频的人，一起练习会更容易坚持。', 'Find like-minded people — practicing together is easier to sustain.') : tr('分享你的练习方向，提交申请后由平台审核。', 'Share your practice focus. The platform reviews your application.')" :action="currentSegment === 'joined' ? tr('去社群广场', 'Explore communities') : tr('创建社群', 'Create community')" @action="onEmptyAction" />
      <view v-else class="list">
        <view v-for="c in visibleCommunities" :key="c.id" class="community-card">
          <view class="community-row" @tap="openCommunity(c.id)">
            <view class="cover">
              <image v-if="c.cover && !failedImages[c.cover]" class="cover-image" :src="c.cover" mode="aspectFill" @error="failedImages[c.cover] = true" />
              <BrandCover v-else label="" height="128rpx" icon="leaf" />
            </view>
            <view class="community-info"><text class="community-name">{{ c.name }}</text><text class="meta">{{ isEnglish() ? `${c.memberCount} members` : `${c.memberCount} 位成员` }} · {{ currentSegment === 'managed' ? (isEnglish() ? `${c.activeToday} active today` : '今日 ' + c.activeToday + ' 活跃') : (isEnglish() ? 'Host ' + (c.owner.name || 'Not provided') : '主理人 ' + (c.owner.name || '未填写')) }}</text></view>
            <PresenceIcon name="arrow" :size="28" />
          </view>
          <view v-if="currentSegment === 'managed'" class="manage-footer"><text class="meta">{{ c.yearlyFee ? (isEnglish() ? `Annual fee ¥${Number((c.yearlyFee / 100).toFixed(2))}` : '年费 ¥' + Number((c.yearlyFee / 100).toFixed(2))) : tr('免费社群', 'Free community') }}</text><button class="small-button" @tap="openCommunity(c.id)">{{ tr('进入工作台', 'Open workspace') }}</button></view>
        </view>
      </view>
      <button v-if="!guest && !loading && !loadError && visibleCommunities.length" class="outline-button" @tap="onEmptyAction">{{ currentSegment === 'joined' ? tr('去社群广场逛逛', 'Browse community hub') : tr('创建社群', 'Create community') }}</button>
      <button v-if="guest" class="outline-button" @tap="goDiscover">{{ tr('先去社群广场逛逛', 'Browse the community hub first') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { fetchMine, type Community } from '@/api/skool'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'
import BrandCover from '@/components/BrandCover.vue'
import PageState from '@/components/PageState.vue'
import FloatingBack from '@/components/FloatingBack.vue'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const managed = ref<Community[]>([])
const joined = ref<Community[]>([])
const currentSegment = ref<'joined' | 'managed'>('joined')
const visibleCommunities = computed(() => currentSegment.value === 'joined' ? joined.value : managed.value)
const guest = ref(!uni.getStorageSync('token'))
const loading = ref(false)
const loadError = ref('')
const failedImages = ref<Record<string, boolean>>({})
let requestId = 0
onLoad(options => { if (options?.segment === 'managed') currentSegment.value = 'managed' })
onShow(load)
async function load() {
  const request = ++requestId
  guest.value = !uni.getStorageSync('token')
  loadError.value = ''
  managed.value = []
  joined.value = []
  if (guest.value) { loading.value = false; return }
  loading.value = true
  try {
    const result = await fetchMine()
    if (request !== requestId) return
    if (!Array.isArray(result?.managed) || !Array.isArray(result?.joined)) throw new Error(tr('社群数据暂不可用，请重试。', 'Community data is unavailable. Please try again.'))
    managed.value = result.managed
    joined.value = result.joined
  } catch (error) {
    if (request !== requestId) return
    guest.value = !uni.getStorageSync('token')
    loadError.value = error instanceof Error ? error.message : tr('网络暂不可用，请重试。', 'The network is unavailable. Please try again.')
  } finally { if (request === requestId) loading.value = false }
}
function openCommunity(id: string) {
  const page = currentSegment.value === 'managed' ? 'community-workspace' : 'community-detail'
  uni.navigateTo({ url: `/pages/${page}/index?id=${encodeURIComponent(id)}` })
}
function onEmptyAction() { if (currentSegment.value === 'managed') goCreate(); else goDiscover() }
function goCreate() { uni.navigateTo({ url: '/pages/community-create/index' }) }
function goDiscover() { uni.navigateTo({ url: '/pages/community-list/index' }) }
function goLogin() { uni.switchTab({ url: '/pages/profile/index' }) }
function goBack() { uni.navigateBack({ fail: goLogin }) }
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }
button { margin: 0; font-size: 28rpx; line-height: 1.5; border: 0; }
button::after { border: 0; }
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 16rpx 32rpx 24rpx; }
.back-spacer { width: 72rpx; height: 72rpx; flex-shrink: 0; }
.icon-button, .nav-space { width: 72rpx; height: 72rpx; }
.icon-button { display: flex; align-items: center; justify-content: center; background: transparent; padding: 0; }
.content { padding: 0 32rpx; }
.segments { display: flex; gap: 8rpx; padding: 6rpx; background: var(--c-card-2); border-radius: var(--radius-button); margin-bottom: 28rpx; }
.segment { flex: 1; padding: 18rpx 8rpx; color: var(--c-muted); background: transparent; border-radius: 20rpx; }
.segment.active { background: var(--c-card); color: var(--c-primary); font-weight: 600; }
.count { font-size: 24rpx; margin-left: 6rpx; }
.community-card { background: var(--c-card); border-radius: var(--radius-card); padding: 32rpx; margin-bottom: 24rpx; box-shadow: var(--shadow-card); }
.community-row { display: flex; align-items: center; gap: 24rpx; }
.cover { width: 128rpx; height: 128rpx; border-radius: 24rpx; flex-shrink: 0; overflow: hidden; }
.cover-image { display: block; width: 100%; height: 100%; }
.community-info { flex: 1; min-width: 0; }
.community-name { display: block; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; }
.meta { display: block; font-size: 24rpx; color: var(--c-muted); margin-top: 8rpx; line-height: 1.7; overflow-wrap: anywhere; }
.manage-footer { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; border-top: 1rpx solid var(--line-soft); margin-top: 24rpx; padding-top: 24rpx; }
.small-button { padding: 14rpx 22rpx; background: var(--c-primary); color: var(--c-rice); border-radius: var(--radius-button); font-size: 24rpx; flex-shrink: 0; }
.outline-button { width: 100%; padding: 22rpx; margin-top: 28rpx; border: 2rpx solid var(--c-primary); border-radius: var(--radius-button); background: var(--c-card); color: var(--c-primary); }
</style>
