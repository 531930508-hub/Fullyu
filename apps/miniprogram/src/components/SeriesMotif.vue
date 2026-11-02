<template>
  <view class="motif" :style="style" />
</template>

<script setup>
import { computed } from 'vue';
import { motifUrl } from '@/lib/svg';

const props = defineProps({
  series: { type: String, default: 'xing' },
  color: { type: String, default: '#352f2b' }
});

const style = computed(() => `background-image:${motifUrl(props.series, props.color)};`);
</script>
