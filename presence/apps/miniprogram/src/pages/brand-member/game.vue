<template>
  <web-view v-if="url" :src="url" />
  <view v-else class="game-empty">
    <PresenceIcon name="leaf" :size="72" />
    <text class="game-title serif">{{ tr('愈行之旅', 'Journey of Healing') }}</text>
    <text class="game-desc">{{ tr('游戏服务地址尚未配置。配置 CRM 的游戏地址后，会员可在这里掷骰、得积分与旅途礼物。', 'The game URL is not configured yet. Once the CRM game URL is set, members can roll dice and collect points and journey gifts here.') }}</text>
    <button class="game-back" @tap="goBack">{{ tr('返回品牌会员', 'Back to brand membership') }}</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import PresenceIcon from '@/components/PresenceIcon.vue'
import { tr } from '@/locale'

const url = ref('')

onLoad((query: any) => {
  try {
    url.value = decodeURIComponent((query && query.url) || '')
  } catch {
    url.value = ''
  }
})

function goBack() {
  const pages = getCurrentPages()
  if (pages && pages.length > 1) {
    uni.navigateBack()
    return
  }
  uni.redirectTo({ url: '/pages/brand-member/index' })
}
</script>

<style scoped>
.game-empty { min-height: 80vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22rpx; padding: 80rpx 56rpx; background: var(--c-cream); color: var(--c-ink); text-align: center; }
.game-title { font-size: 44rpx; letter-spacing: 2rpx; }
.game-desc { max-width: 540rpx; font-size: 24rpx; line-height: 1.8; color: var(--c-muted); }
.game-back { margin-top: 16rpx; min-height: 84rpx; padding: 0 44rpx; border-radius: 999rpx; background: var(--c-primary); color: var(--c-rice); font-size: 26rpx; }
button::after { border: none; }
</style>
