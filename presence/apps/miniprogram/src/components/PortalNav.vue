<template>
  <view class="portal-nav">
    <view class="nav-row" :style="{ paddingTop: statusBarHeight + 8 + 'px' }">
      <button v-if="showBack" class="nav-back" :aria-label="tr('返回', 'Back')" @tap="goBack">
        <PresenceIcon name="back" :size="32" />
      </button>
      <view class="nav-copy">
        <text class="nav-title serif">{{ title }}</text>
        <text v-if="sub" class="nav-sub">{{ sub }}</text>
      </view>
      <view class="nav-extra"><slot /></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { tr } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'

const props = withDefaults(
  defineProps<{ title: string; sub?: string; showBack?: boolean; fallback?: string }>(),
  { sub: '', showBack: true, fallback: '/pages/trainer-portal/home/index' },
)

const statusBarHeight = readCapsuleLayout().statusBarHeight

function goBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }
  uni.reLaunch({ url: props.fallback })
}
</script>

<style scoped>
.portal-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--c-cream);
  border-bottom: 1rpx solid var(--line-soft);
}
.nav-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 12rpx 28rpx 20rpx;
}
.nav-back {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: var(--c-card);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow: var(--shadow-card);
}
.nav-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
.nav-title {
  font-size: 36rpx;
  color: var(--c-ink);
  line-height: 1.3;
}
.nav-sub {
  font-size: 22rpx;
  color: var(--c-muted);
  letter-spacing: 1rpx;
}
.nav-extra {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
</style>