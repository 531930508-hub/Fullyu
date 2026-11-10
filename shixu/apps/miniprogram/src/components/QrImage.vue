<template>
  <view :class="className" :style="style" />
</template>

<script setup>
import { computed } from 'vue';
import { qrSvgUrl } from '@/lib/svg';

const props = defineProps({
  value: { type: String, default: '' },
  className: { type: String, default: 'qr-svg' }
});

const style = computed(() => `background-image:${qrSvgUrl(props.value || '—')};`);
</script>

<style>
.qr-svg,
.member-qr-img {
  display: block;
  background-repeat: no-repeat;
  background-size: contain;
  background-position: center;
}
</style>
