<template>
  <view class="ftb-wrap">
    <view class="ftb-bar" role="navigation" :aria-label="tr('主导航', 'Main navigation')">
      <button v-for="item in items" :key="item.key" class="ftb-item" :class="{ active: active === item.key }" :aria-current="active === item.key ? 'page' : undefined" @tap="go(item)">
        <PresenceIcon :name="item.icon" :size="42" :color="active === item.key ? '#683611' : '#756a55'" />
        <text class="ftb-label">{{ item.label }}</text>
      </button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { t, tr } from '@/locale'
import PresenceIcon from './PresenceIcon.vue'
const props = defineProps<{ active: 'home' | 'courses' | 'member' | 'profile' }>()
const items = computed(() => [
  { key: 'home', icon: 'home', label: t('tab.home'), url: '/pages/index/index' },
  { key: 'courses', icon: 'calendar', label: t('tab.courses'), url: '/pages/my-courses/index' },
  { key: 'member', icon: 'card', label: t('tab.member'), url: '/pages/brand-member/index' },
  { key: 'profile', icon: 'user', label: t('tab.profile'), url: '/pages/profile/index' },
])
onMounted(() => {
  // #ifdef MP-WEIXIN
  uni.hideTabBar({ fail: () => {} })
  // #endif
})
function go(item: { key: string; url: string }) {
  if (item.key !== props.active) uni.switchTab({ url: item.url })
}
</script>
<style scoped>
.ftb-wrap { position: fixed; bottom: 0; left: 0; right: 0; z-index: 900; padding: 0 24rpx calc(20rpx + env(safe-area-inset-bottom)); pointer-events: none; display: flex; justify-content: center; }
.ftb-bar { width: 100%; max-width: 456px; background: var(--c-card); border-radius: 36rpx; padding: 12rpx; display: flex; box-shadow: 0 4rpx 24rpx rgba(104,54,17,.07); pointer-events: auto; }
.ftb-item { background: transparent; border-radius: 20rpx; border: 0; flex: 1; padding: 6rpx 4rpx; min-height: 100rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4rpx; line-height: 1.5; }
.ftb-label { color: var(--c-muted); font-size: 22rpx; }
.ftb-item.active .ftb-label { color: var(--c-primary); font-weight: 600; }
</style>
