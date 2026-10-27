<template>
  <view class="page-state" :role="state === 'error' ? 'alert' : 'status'" aria-live="polite">
    <view class="state-icon"><PresenceIcon :name="icons[state]" :size="64" /></view>
    <text class="state-title serif">{{ title || titles[state] }}</text>
    <text v-if="message" class="state-message">{{ message }}</text>
    <button v-if="action" class="state-action btn-secondary" @tap="$emit('action')">{{ action }}</button>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import PresenceIcon from './PresenceIcon.vue'
import { tr } from '@/locale'
withDefaults(defineProps<{ state: 'loading' | 'error' | 'empty' | 'guest'; title?: string; message?: string; action?: string }>(), { title: '', message: '', action: '' })
defineEmits<{ (e: 'action'): void }>()
const icons = { loading: 'clock', error: 'info', empty: 'calendar', guest: 'lock' }
const titles = computed<Record<string, string>>(() => ({
  loading: tr('正在加载', 'Loading'),
  error: tr('暂时未能加载', 'Unable to load'),
  empty: tr('还没有记录', 'Nothing here yet'),
  guest: tr('登录后查看', 'Log in to view'),
}))
</script>
<style scoped>
.page-state { padding: 72rpx 36rpx; display: flex; align-items: center; flex-direction: column; text-align: center; gap: 16rpx; }
.state-icon { width: 112rpx; height: 112rpx; background: var(--c-card-2); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.state-title { font-size: 36rpx; color: var(--c-ink); }
.state-message { font-size: 26rpx; line-height: 1.8; color: var(--c-muted); max-width: 550rpx; }
.state-action { margin-top: 16rpx; min-width: 240rpx; }
</style>
