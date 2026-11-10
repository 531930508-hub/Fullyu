<template>
  <view class="app-icon" :style="style" />
</template>

<script setup>
import { computed } from 'vue';
import { iconUrl } from '@/lib/svg';

const props = defineProps({
  name: { type: String, default: 'cup' },
  size: { type: Number, default: 20 },
  color: { type: String, default: '#352f2b' },
  stroke: { type: Number, default: 1.6 }
});

const style = computed(() => {
  const side = Math.round(props.size * 1.875 * 100) / 100;
  return `width:${side}rpx;height:${side}rpx;background-image:${iconUrl(props.name, props.color, props.stroke)};`;
});
</script>

<style>
.app-icon {
  display: block;
  flex-shrink: 0;
  background-repeat: no-repeat;
  background-size: contain;
  background-position: center;
}
</style>
