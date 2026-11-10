<template>
  <view class="brand-cover" :style="{ height }">
    <view class="ring ring-one"></view><view class="ring ring-two"></view>
    <PresenceIcon :name="icon" :size="72" color="#96581c" />
    <text class="brand-label serif">{{ displayLabel }}</text>
    <text class="brand-en">PRESENCE</text>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { tr } from '@/locale'
import PresenceIcon from './PresenceIcon.vue'
const props = withDefaults(defineProps<{ label?: string; height?: string; icon?: string }>(), { label: 'Full愈 · 在场', height: '240rpx', icon: 'leaf' })
const displayLabel = computed(() => props.label === 'Full愈 · 在场' ? tr('Full愈 · 在场', 'Full愈 · Presence') : props.label)
</script>
<style scoped>
.brand-cover { position: relative; overflow: hidden; width: 100%; background: linear-gradient(140deg,#f6e8b8,#f3efe0); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8rpx; color: var(--c-brown); }
.ring { position: absolute; border: 1rpx solid rgba(150,88,28,.15); border-radius: 50%; pointer-events: none; }
.ring-one { width: 280rpx; height: 280rpx; right: -110rpx; top: -140rpx; }
.ring-two { width: 200rpx; height: 200rpx; right: -70rpx; top: -100rpx; }
.brand-label { font-size: 26rpx; text-align: center; padding: 0 12rpx; }
.brand-en { font-size: 18rpx; letter-spacing: 3rpx; }
</style>
