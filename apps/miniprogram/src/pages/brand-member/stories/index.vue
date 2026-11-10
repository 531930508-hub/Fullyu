<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack fallback="/pages/brand-member/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <view class="nav-copy">
        <text class="nav-title serif">{{ tr('会员故事', 'Member stories') }}</text>
        <text class="nav-sub">{{ tr('仅品牌会员可见', 'For brand members') }}</text>
      </view>
    </view>

    <view class="content">
      <text class="lead">{{ tr('从会员的建议开始，一点一点把在场变成大家想要的样子。', 'Built from member suggestions, one small change at a time.') }}</text>

      <view v-if="loading" class="state">{{ tr('正在读会员故事…', 'Loading stories…') }}</view>
      <view v-else-if="error" class="state">
        <text>{{ error }}</text>
        <button class="state-btn" @tap="load">{{ tr('重新加载', 'Reload') }}</button>
      </view>
      <view v-else-if="!stories.length" class="state">{{ tr('第一批会员故事正在整理中。', 'The first member stories are on their way.') }}</view>

      <template v-else>
        <view v-for="item in stories" :key="item.id" class="story-card">
          <view class="story-head">
            <text class="story-title serif">{{ item.title }}</text>
            <text v-if="businessLabel(item.business)" class="story-tag">{{ businessLabel(item.business) }}</text>
          </view>
          <text v-if="item.quote" class="story-quote">“{{ item.quote }}”<text v-if="item.quoteBy" class="story-by"> —— {{ item.quoteBy }}</text></text>
          <text class="story-body">{{ item.story }}</text>
          <text v-if="item.publishedAt" class="story-date">{{ item.publishedAt }}</text>
        </view>
      </template>

      <view class="foot">
        <text>{{ tr('身心在场 · 向内生长', 'Be present · grow inward') }}</text>
        <text class="foot-sub">Full愈 · 在场</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import FloatingBack from '@/components/FloatingBack.vue'
import { readCapsuleLayout } from '@/utils/capsule'
import { tr } from '@/locale'
import { loadStories, type BrandStory } from '@/api/brandMember'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop

const loading = ref(true)
const error = ref('')
const stories = ref<BrandStory[]>([])

function businessLabel(business?: string | null) {
  const labels: Record<string, string> = {
    teahour: tr('时叙', 'Teahour'),
    sx: tr('时叙', 'Teahour'),
    presence: tr('在场', 'Presence'),
    zc: tr('在场', 'Presence'),
    retreat: tr('轻疗', 'Retreat'),
    ql: tr('轻疗', 'Retreat')
  }
  return (business && labels[business]) || ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await loadStories()
    stories.value = Array.isArray(res?.stories) ? res.stories : []
  } catch {
    stories.value = []
    // 接口只对有效品牌会员开放；请求层不透出状态码，统一给可重试的边界提示。
    error.value = tr(
      '会员故事暂时没读到。仅有效品牌会员可查看，稍后可以再试。',
      'Stories are unavailable right now. They are open to active brand members; please try again later.'
    )
  } finally {
    loading.value = false
  }
}

onLoad(() => {
  load()
})
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); font-size: 28rpx; }
.nav-bar { padding: 20rpx 32rpx; display: flex; align-items: center; gap: 16rpx; }
.back-spacer { width: 80rpx; height: 80rpx; flex-shrink: 0; }
.nav-copy { flex: 1; min-width: 0; }
.nav-title { display: block; font-size: 36rpx; line-height: 1.4; }
.nav-sub { display: block; font-size: 20rpx; letter-spacing: 1rpx; color: var(--c-muted); }
.content { padding: 8rpx 32rpx 0; }
button::after { border: none; }

.lead { display: block; margin-bottom: 20rpx; font-size: 22rpx; line-height: 1.8; color: var(--c-muted); }
.state { display: flex; flex-direction: column; align-items: center; gap: 20rpx; padding: 120rpx 30rpx; font-size: 24rpx; line-height: 1.7; color: var(--c-muted); text-align: center; }
.state-btn { padding: 0 36rpx; min-height: 72rpx; border-radius: 999rpx; font-size: 24rpx; background: var(--c-card); color: var(--c-ink); border: 1rpx solid var(--line-soft); }

.story-card { margin-bottom: 18rpx; padding: 30rpx 28rpx; border-radius: 28rpx; background: var(--c-card); border: 1rpx solid var(--line-soft); }
.story-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }
.story-title { font-size: 30rpx; line-height: 1.4; }
.story-tag { flex: none; margin-top: 4rpx; padding: 2rpx 12rpx; font-size: 18rpx; letter-spacing: 2rpx; color: var(--c-brown); border: 1rpx solid var(--line-soft); border-radius: 999rpx; }
.story-quote { display: block; margin-top: 16rpx; padding-left: 16rpx; font-size: 23rpx; line-height: 1.7; color: var(--c-brown); border-left: 3rpx solid var(--line-soft); }
.story-by { font-size: 20rpx; color: var(--c-muted); }
.story-body { display: block; margin-top: 14rpx; font-size: 23rpx; line-height: 1.85; white-space: pre-wrap; }
.story-date { display: block; margin-top: 16rpx; font-size: 19rpx; color: var(--c-muted); }

.foot { margin-top: 36rpx; text-align: center; font-size: 20rpx; letter-spacing: 4rpx; color: var(--c-muted); }
.foot-sub { display: block; margin-top: 6rpx; letter-spacing: 2rpx; opacity: .7; }
</style>
