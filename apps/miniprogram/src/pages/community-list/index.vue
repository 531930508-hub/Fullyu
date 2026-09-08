<template>
  <view class="page">
    <view class="status-bar-placeholder" :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="nav-bar">
      <view class="nav-back" @tap="goBack"><text>←</text></view>
      <text class="nav-title serif">社群广场</text>
      <view class="nav-right"></view>
    </view>

    <!-- 搜索 -->
    <view class="search-bar">
      <input class="search-input" v-model="keyword" placeholder="搜索社群或标签" confirm-type="search" @confirm="onSearch" />
    </view>

    <!-- 排序 -->
    <view class="sort-bar">
      <view
        v-for="s in sorts"
        :key="s.value"
        class="sort-item"
        :class="{ active: currentSort === s.value }"
        @tap="currentSort = s.value"
      >
        <text>{{ s.label }}</text>
      </view>
    </view>

    <!-- 分类 -->
    <scroll-view scroll-x class="cat-bar" :show-scrollbar="false">
      <view
        v-for="cat in categories"
        :key="cat"
        class="cat-item"
        :class="{ active: currentCat === cat }"
        @tap="currentCat = cat"
      >
        <text>{{ cat }}</text>
      </view>
    </scroll-view>

    <!-- 社群列表 -->
    <view class="list">
      <view v-for="c in communities" :key="c.id" class="community-card" @tap="goDetail(c.id)">
        <!-- 16:9 封面（主理人自定义上传） -->
        <view class="card-cover" :style="{ background: c.coverFallback }">
          <image class="cover-img" :src="c.cover" mode="aspectFill" />
          <view v-if="c.isOfficial" class="cover-badges">
            <text class="official-tag">官方</text>
          </view>
        </view>
        <view class="card-body">
          <text class="card-name">{{ c.name }}</text>
          <text class="card-slogan">{{ c.slogan }}</text>
          <view class="owner-row">
            <image class="owner-avatar" :src="c.owner.avatar" mode="aspectFill" />
            <view class="owner-info">
              <text class="owner-name">{{ c.owner.name }}</text>
              <text class="owner-title">{{ c.owner.title }}</text>
            </view>
            <view class="fee" :class="{ free: c.yearlyFee === 0 }">
              <text>{{ c.yearlyFee === 0 ? '免费' : `¥${(c.yearlyFee / 100).toFixed(0)}/年` }}</text>
            </view>
          </view>
          <view class="tag-row">
            <text v-for="tag in c.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</text>
          </view>
          <view class="meta-row">
            <text class="meta">{{ c.memberCount }} 成员 · 今日活跃 {{ c.activeToday }}</text>
          </view>
        </view>
      </view>

      <view v-if="!communities.length" class="empty"><text>没有找到相关社群</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { COMMUNITY_CATEGORIES, fetchCommunities, type Community, type CommunitySort } from '@/api/skool'

const statusBarHeight = ref(44)
try {
  statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 44
} catch (e) { /* fallback */ }

const categories = COMMUNITY_CATEGORIES
const currentCat = ref('全部')
const keyword = ref('')

const sorts: { label: string; value: CommunitySort }[] = [
  { label: '推荐', value: 'recommend' },
  { label: '最新', value: 'newest' },
  { label: '热门', value: 'hot' },
]
const currentSort = ref<CommunitySort>('recommend')

const communities = ref<Community[]>([])

async function load() {
  try {
    const res = await fetchCommunities(currentCat.value, keyword.value.trim(), currentSort.value)
    communities.value = Array.isArray(res) ? res : []
  } catch (e) {
    communities.value = []
  }
}

watch([currentCat, currentSort], load)
load()

function onSearch() {
  load()
}

function goBack() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/index/index' }) })
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/community-detail/index?id=${id}` })
}
</script>

<style scoped>
.page { min-height: 100vh; background: #EAE0D7; }
.status-bar-placeholder { width: 100%; }
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; }
.nav-back { width: 32px; height: 32px; border-radius: 16px; background: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center; }
.nav-back text { font-size: 18px; color: #584219; }
.nav-title { font-size: 17px; font-weight: 600; color: #3F2F10; }
.nav-right { width: 32px; }

.search-bar { margin: 8px 16px 12px; }
.search-input { background: #fff; border-radius: 20px; padding: 10px 16px; font-size: 14px; color: #3F2F10; }

.cat-bar { white-space: nowrap; padding: 0 16px 12px; }
.cat-item { display: inline-block; padding: 6px 16px; margin-right: 8px; border-radius: 16px; background: rgba(255,255,255,0.6); font-size: 13px; color: #6D5934; }
.cat-item.active { background: #584219; color: #fff; }

.sort-bar { display: flex; align-items: center; padding: 0 16px 10px; }
.sort-item { padding: 5px 14px; margin-right: 8px; border-radius: 14px; font-size: 13px; }
.sort-item text { color: #6D5934; }
.sort-item.active { background: #F4EEE6; }
.sort-item.active text { color: #B06A3F; font-weight: 600; }

.list { padding: 0 16px 24px; }
.community-card { background: #fff; border-radius: 16px; overflow: hidden; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(107,70,60,0.06); }
.card-cover { position: relative; width: 100%; height: 180px; }
.cover-img { width: 100%; height: 100%; display: block; }
.official-tag { padding: 2px 8px; border-radius: 10px; background: rgba(0,0,0,0.35); font-size: 11px; color: #fff; }
.cover-badges { position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.card-body { padding: 12px 16px 16px; }
.card-name { display: block; font-size: 17px; font-weight: 700; color: #3F2F10; }
.card-slogan { display: block; margin-top: 4px; font-size: 12px; color: #A78E70; }
.owner-row { margin-top: 12px; display: flex; align-items: center; }
.owner-avatar { width: 36px; height: 36px; border-radius: 18px; margin-right: 10px; background: #F4EEE6; }
.owner-info { flex: 1; display: flex; flex-direction: column; }
.owner-name { font-size: 14px; font-weight: 600; color: #3F2F10; }
.owner-title { font-size: 11px; color: #A78E70; margin-top: 2px; }
.fee { padding: 4px 10px; border-radius: 12px; background: #F4EEE6; }
.fee text { font-size: 12px; font-weight: 600; color: #B06A3F; }
.fee.free { background: rgba(88,66,25,0.08); }
.fee.free text { color: #584219; }
.tag-row { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
.tag { padding: 3px 10px; border-radius: 10px; background: #EAE0D7; font-size: 11px; color: #6D5934; }
.meta-row { margin-top: 12px; display: flex; justify-content: space-between; }
.meta { font-size: 12px; color: #A78E70; }
.empty { padding: 60px 0; text-align: center; color: #A78E70; font-size: 14px; }
</style>
