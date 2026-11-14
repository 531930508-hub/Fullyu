<template>
  <button class="floating-back" :style="{ top: topOffset + 'px' }" :disabled="disabled" :aria-label="tr('返回', 'Back')" @tap.stop="goBack">
    <PresenceIcon name="back" :size="36" />
  </button>
</template>

<script setup lang="ts">
import { tr } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'

const props = withDefaults(defineProps<{ fallback?: string; disabled?: boolean }>(), {
  fallback: '/pages/index/index',
  disabled: false,
})

// 微信端把返回键放在胶囊同一行的左侧；H5 保留原来的 16px 留白。
const layout = readCapsuleLayout()
const topOffset = layout.statusBarHeight + (layout.hasCapsule ? 8 : 16)

const TAB_PAGES = ['/pages/index/index', '/pages/my-courses/index', '/pages/brand-member/index', '/pages/profile/index']

function goBack() {
  if (props.disabled) return
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }
  if (TAB_PAGES.includes(props.fallback)) uni.switchTab({ url: props.fallback })
  else uni.reLaunch({ url: props.fallback })
}
</script>

<style scoped>
.floating-back {
  position: fixed;
  left: 32rpx;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80rpx;
  height: 80rpx;
  padding: 0;
  margin: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 6rpx 24rpx rgba(58, 42, 26, .14);
  color: var(--c-deep);
  backdrop-filter: blur(8px);
}
.floating-back[disabled] { opacity: .45; }
@media (min-width: 600px) {
  .floating-back { left: calc(50% - 240px + 16px); }
}
</style>
