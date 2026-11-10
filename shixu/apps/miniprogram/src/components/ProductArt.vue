<template>
  <view :class="variant === 'showcase' ? 'sheet-art' : ['product-thumb', tone]">
    <image
      v-if="product.imageUrl"
      class="art-img"
      :src="product.imageUrl"
      aria-hidden="true"
      mode="aspectFill"
      lazy-load
    />
    <image
      v-else-if="product.kind === 'bottle'"
      class="art-img"
      src="/static/celebration.webp"
      aria-hidden="true"
      mode="aspectFill"
      lazy-load
    />
    <view v-else class="art" :style="artStyle" />
  </view>
</template>

<script setup>
import { computed } from 'vue';
import { productArtUrl, productTone } from '@/lib/svg';

const props = defineProps({
  product: { type: Object, required: true },
  variant: { type: String, default: 'thumb' }
});

const tone = computed(() => productTone(props.product));
const artStyle = computed(() => `background-image:${productArtUrl(props.product)};`);
</script>
