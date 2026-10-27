<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <text class="nav-title serif">{{ tr('社群广场', 'Community hub') }}</text>
      <button class="icon-button" :aria-label="tr('我的社群', 'My communities')" @tap="goMine"><PresenceIcon name="users" :size="36" /></button>
    </view>
    <view class="content">
      <view class="search-bar">
        <PresenceIcon name="search" :size="32" />
        <input v-model="keyword" class="search-input" :placeholder="tr('搜索社群或标签', 'Search communities or tags')" confirm-type="search" @confirm="load" />
        <button v-if="keyword" class="icon-button" :aria-label="tr('清除搜索', 'Clear search')" @tap="clearSearch"><PresenceIcon name="close" :size="28" /></button>
        <button class="search-action" @tap="load">{{ tr('搜索', 'Search') }}</button>
      </view>
      <view class="segments">
        <button v-for="sort in sorts" :key="sort.value" class="segment" :class="{ active: currentSort === sort.value }" :aria-label="sort.label" @tap="currentSort = sort.value">{{ sort.label }}</button>
      </view>
      <scroll-view scroll-x class="category-scroll" :show-scrollbar="false">
        <view class="category-options">
          <button v-for="cat in categories" :key="cat" class="option" :class="{ selected: currentCat === cat }" @tap="currentCat = cat">
            {{ categoryLabel(cat) }}<view v-if="currentCat === cat" class="selected-mark"><PresenceIcon name="check" :size="18" color="#f5f6ed" /></view>
          </button>
        </view>
      </scroll-view>
      <PageState v-if="loading" state="loading" :title="tr('正在寻找同频的人', 'Finding your people')" />
      <PageState v-else-if="loadError" state="error" :title="tr('社群暂时加载失败', 'Failed to load communities')" :message="loadError" :action="tr('重新加载', 'Reload')" @action="load" />
      <PageState v-else-if="!communities.length" state="empty" :title="tr('没有找到相关社群', 'No matching communities')" :message="tr('换个关键词，或清除筛选再看看。', 'Try another keyword or clear the filters.')" :action="tr('清除筛选', 'Clear filters')" @action="clearSearch" />
      <view v-else class="list">
        <view v-for="c in communities" :key="c.id" class="community-card" @tap="goDetail(c.id)">
          <image v-if="c.cover && !failedImages[c.cover]" class="cover-image" :src="c.cover" mode="aspectFill" @error="failedImages[c.cover] = true" />
          <BrandCover v-else :label="c.name" height="224rpx" icon="leaf" />
          <view class="card-body">
            <view class="title-row">
              <text class="card-title serif">{{ c.name }}</text>
              <text v-if="managedIds.includes(c.id)" class="badge">{{ tr('我管理的', 'Managed by me') }}</text>
              <text v-else-if="joinedIds.includes(c.id)" class="badge">{{ tr('已加入', 'Joined') }}</text>
              <text v-else-if="c.isOfficial" class="badge">{{ tr('官方', 'Official') }}</text>
            </view>
            <text class="slogan">{{ c.slogan }}</text>
            <view class="owner-row">
              <image v-if="c.owner.avatar && !failedImages[c.owner.avatar]" class="avatar" :src="c.owner.avatar" mode="aspectFill" @error="failedImages[c.owner.avatar] = true" />
              <view v-else class="avatar avatar-fallback"><PresenceIcon name="user" :size="30" /></view>
              <text class="owner-meta">{{ c.owner.name || tr('社群主理人', 'Community host') }} · {{ tr(`${c.memberCount} 位成员`, `${c.memberCount} members`) }} · {{ tr(`今日 ${c.activeToday} 活跃`, `${c.activeToday} active today`) }}</text>
            </view>
            <view class="card-footer">
              <view class="tags"><text v-for="tag in c.tags.slice(0, 3)" :key="tag" class="tag">{{ communityTagLabel(tag) }}</text></view>
              <text class="fee">{{ feeLabel(c.yearlyFee) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { onShow, onUnload } from '@dcloudio/uni-app'
import { COMMUNITY_CATEGORIES, fetchCommunities, fetchMine, type Community, type CommunitySort } from '@/api/skool'
import { tr, isEnglish } from '@/locale'
import { communityTagLabel } from '@/utils/community-labels'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'
import BrandCover from '@/components/BrandCover.vue'
import PageState from '@/components/PageState.vue'
import FloatingBack from '@/components/FloatingBack.vue'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const categories = COMMUNITY_CATEGORIES
const CATEGORY_EN: Record<string, string> = {
  全部: 'All', 疗愈: 'Healing', 瑜伽: 'Yoga', 身心成长: 'Mind-body growth', 手作: 'Craft', 健身: 'Fitness',
}
function categoryLabel(value: string) { return isEnglish() ? (CATEGORY_EN[value] || value) : value }
const sorts = computed<{ label: string; value: CommunitySort }[]>(() => [
  { label: tr('推荐', 'Recommended'), value: 'recommend' },
  { label: tr('最新', 'Newest'), value: 'newest' },
  { label: tr('热门', 'Popular'), value: 'hot' },
])
const currentCat = ref('全部')
const currentSort = ref<CommunitySort>('recommend')
const keyword = ref('')
const communities = ref<Community[]>([])
const loading = ref(false)
const loadError = ref('')
const failedImages = ref<Record<string, boolean>>({})
const joinedIds = ref<string[]>([])
const managedIds = ref<string[]>([])
let requestId = 0

async function load() {
  const request = ++requestId
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchCommunities(currentCat.value, keyword.value.trim(), currentSort.value)
    if (request !== requestId) return
    if (!Array.isArray(result)) throw new Error(tr('社群数据暂不可用，请重试。', 'Community data is unavailable. Please retry.'))
    communities.value = result
  } catch (error) {
    if (request !== requestId) return
    communities.value = []
    loadError.value = error instanceof Error ? error.message : tr('请检查网络后重试。', 'Check your network and retry.')
  } finally {
    if (request === requestId) loading.value = false
  }
}
async function loadMemberships() {
  joinedIds.value = []
  managedIds.value = []
  const token = uni.getStorageSync('token')
  if (!token) return
  try {
    const result = await fetchMine()
    if (uni.getStorageSync('token') !== token) return
    joinedIds.value = (result.joined || []).map(c => c.id)
    managedIds.value = (result.managed || []).map(c => c.id)
  } catch { /* 未知身份不显示已加入或管理标记，广场仍可浏览 */ }
}
function clearSearch() {
  keyword.value = ''
  currentCat.value = '全部'
  return load()
}
function feeLabel(fee: number) {
  return fee === 0 ? tr('免费', 'Free') : tr(`¥${Number((fee / 100).toFixed(2))}/年`, `¥${Number((fee / 100).toFixed(2))}/year`)
}
watch([currentCat, currentSort], load)
onShow(() => { load(); loadMemberships() })
onUnload(() => { requestId++ })
function goBack() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/index/index' }) }) }
function goDetail(id: string) { uni.navigateTo({ url: `/pages/community-detail/index?id=${encodeURIComponent(id)}` }) }
function goMine() { uni.navigateTo({ url: '/pages/community-mine/index' }) }
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }
button { margin: 0; font-size: 28rpx; line-height: 1.5; border: 0; }
button::after { border: 0; }
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 16rpx 32rpx 24rpx; gap: 16rpx; }
.back-spacer { width: 72rpx; height: 72rpx; flex-shrink: 0; }
.icon-button { display: flex; align-items: center; justify-content: center; width: 72rpx; height: 72rpx; flex-shrink: 0; padding: 0; background: transparent; }
.content { padding: 0 32rpx; }
.search-bar { display: flex; align-items: center; gap: 16rpx; padding: 8rpx 20rpx; background: var(--c-card); border-radius: var(--radius-button); box-shadow: var(--shadow-card); }
.search-input { min-width: 0; flex: 1; height: 72rpx; font-size: 28rpx; color: var(--c-ink); }
.search-bar .icon-button { width: 48rpx; }
.search-action { padding: 12rpx 0; color: var(--c-brown); background: transparent; }
.segments { display: flex; gap: 8rpx; padding: 6rpx; margin-top: 28rpx; background: var(--c-card-2); border-radius: var(--radius-button); }
.segment { flex: 1; padding: 18rpx 8rpx; color: var(--c-muted); background: transparent; border-radius: 20rpx; }
.segment.active { background: var(--c-card); color: var(--c-primary); font-weight: 600; }
.category-scroll { width: 100%; margin: 24rpx 0 28rpx; }
.category-options { display: flex; gap: 16rpx; width: max-content; padding-bottom: 4rpx; }
.option { position: relative; flex-shrink: 0; overflow: hidden; padding: 14rpx 36rpx; border-radius: 20rpx; border: 1rpx solid var(--line-soft); background: var(--c-card); color: var(--c-ink); font-size: 24rpx; }
.option.selected { border-color: var(--c-primary); background: var(--c-card-2); font-weight: 600; }
.selected-mark { position: absolute; top: 0; right: 0; width: 26rpx; height: 26rpx; display: flex; align-items: center; justify-content: center; border-bottom-left-radius: 14rpx; background: var(--c-primary); }
.community-card { overflow: hidden; background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); margin-bottom: 28rpx; }
.cover-image { display: block; width: 100%; height: 224rpx; }
.card-body { padding: 28rpx; }
.title-row { display: flex; align-items: flex-start; gap: 16rpx; }
.card-title { flex: 1; min-width: 0; font-size: 34rpx; font-weight: 600; overflow-wrap: anywhere; }
.badge { flex-shrink: 0; padding: 4rpx 14rpx; background: var(--c-card-2); color: var(--c-primary); border-radius: 16rpx; font-size: 24rpx; }
.slogan { display: block; margin-top: 8rpx; color: var(--c-muted); font-size: 24rpx; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.owner-row { display: flex; align-items: center; gap: 16rpx; margin-top: 22rpx; }
.avatar { width: 64rpx; height: 64rpx; border-radius: 50%; flex-shrink: 0; }
.avatar-fallback { background: var(--c-card-2); display: flex; align-items: center; justify-content: center; }
.owner-meta { min-width: 0; color: var(--c-muted); font-size: 24rpx; line-height: 1.6; overflow-wrap: anywhere; }
.card-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 16rpx; margin-top: 20rpx; }
.tags { display: flex; flex-wrap: wrap; gap: 10rpx; min-width: 0; }
.tag { background: var(--c-rice); padding: 4rpx 12rpx; border-radius: 8rpx; color: var(--c-muted); font-size: 24rpx; }
.fee { flex-shrink: 0; color: var(--c-primary); font-weight: 600; }
</style>
