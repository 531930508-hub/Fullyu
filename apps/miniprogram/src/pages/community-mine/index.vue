<template>
  <view class="page">
    <view class="status-bar-placeholder" :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="nav-bar">
      <view class="nav-back" @tap="goBack"><text>←</text></view>
      <text class="nav-title serif">我的社群</text>
      <view class="nav-right"></view>
    </view>

    <!-- 我管理的 -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">我管理的</text>
        <text class="create-btn" @tap="goCreate">＋ 创建社群</text>
      </view>
      <view v-for="c in managed" :key="c.id" class="comm-row" @tap="goWorkspace(c.id)">
        <view class="comm-cover" :style="{ background: c.coverFallback }">
          <image class="comm-cover-img" :src="c.cover" mode="aspectFill" />
        </view>
        <view class="comm-info">
          <text class="comm-name">{{ c.name }}</text>
          <text class="comm-meta">{{ c.memberCount }} 成员 · 今日活跃 {{ c.activeToday }}</text>
        </view>
        <view class="comm-action manage"><text>管理 ›</text></view>
      </view>
      <view v-if="!managed.length" class="empty-hint">
        <text>还没有创建社群</text>
        <view class="empty-btn" @tap="goCreate"><text>创建我的第一个社群</text></view>
      </view>
    </view>

    <!-- 我加入的 -->
    <view class="section">
      <text class="section-title">我加入的</text>
      <view v-for="c in joined" :key="c.id" class="comm-row" @tap="goDetail(c.id)">
        <view class="comm-cover" :style="{ background: c.coverFallback }">
          <image class="comm-cover-img" :src="c.cover" mode="aspectFill" />
        </view>
        <view class="comm-info">
          <text class="comm-name">{{ c.name }}</text>
          <text class="comm-meta">{{ c.memberCount }} 成员 · 主理人 {{ c.owner.name }}</text>
        </view>
        <text class="comm-go">›</text>
      </view>
      <view v-if="!joined.length" class="empty-hint">
        <text>还没有加入任何社群</text>
      </view>
      <view class="discover-btn" @tap="goDiscover"><text>去社群广场逛逛 ›</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { fetchMine, type Community } from '@/api/skool'

const statusBarHeight = ref(44)
try {
  statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 44
} catch (e) { /* fallback */ }

const managed = ref<Community[]>([])
const joined = ref<Community[]>([])

onShow(async () => {
  try {
    const res = await fetchMine()
    managed.value = res?.managed || []
    joined.value = res?.joined || []
  } catch (e) {
    // 未登录或请求失败：保持空列表，静默处理
    managed.value = []
    joined.value = []
  }
})

function goBack() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/profile/index' }) })
}

function goDiscover() {
  uni.navigateTo({ url: '/pages/community-list/index' })
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/community-detail/index?id=${id}` })
}

function goWorkspace(id: string) {
  uni.navigateTo({ url: `/pages/community-workspace/index?id=${id}` })
}

function goCreate() {
  uni.navigateTo({ url: '/pages/community-create/index' })
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

.section { padding: 8px 16px 16px; }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.section-title { display: block; font-size: 15px; font-weight: 600; color: #3F2F10; margin-bottom: 10px; }
.section-head .section-title { margin-bottom: 0; }
.create-btn { font-size: 13px; color: #584219; font-weight: 600; }

.comm-row { display: flex; align-items: center; background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
.comm-cover { width: 44px; height: 44px; border-radius: 12px; overflow: hidden; margin-right: 12px; }
.comm-cover-img { width: 44px; height: 44px; display: block; }
.comm-info { flex: 1; }
.comm-name { display: block; font-size: 14px; font-weight: 600; color: #3F2F10; }
.comm-meta { display: block; margin-top: 3px; font-size: 12px; color: #A78E70; }
.comm-action.manage { padding: 6px 12px; border-radius: 14px; background: #584219; }
.comm-action.manage text { color: #fff; font-size: 12px; }
.comm-go { font-size: 18px; color: #A78E70; }

.empty-hint { background: #fff; border-radius: 12px; padding: 28px 16px; display: flex; flex-direction: column; align-items: center; }
.empty-hint > text { font-size: 13px; color: #A78E70; }
.empty-btn { margin-top: 12px; padding: 8px 20px; border-radius: 18px; background: #584219; }
.empty-btn text { color: #fff; font-size: 13px; }
.discover-btn { margin-top: 4px; text-align: center; padding: 12px; }
.discover-btn text { font-size: 13px; color: #6D5934; }
</style>
