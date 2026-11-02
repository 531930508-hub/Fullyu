<template>
  <view class="sheet-mask" :class="{ 'sheet-mask-center': center }" @click="close">
    <view class="sheet" :class="{ 'sheet-center': center }" role="dialog" aria-modal="true" :aria-label="title" @click.stop>
      <view class="sheet-head">
        <text class="sheet-title">{{ title }}</text>
        <button hover-class="none" class="icon-btn" aria-label="关闭" @click="close">
          <AppIcon name="x" :size="18" />
        </button>
      </view>
      <view class="sheet-body">
        <slot />
      </view>
    </view>
  </view>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import AppIcon from './AppIcon.vue';

defineProps({
  title: { type: String, default: '' },
  // 商品详情等需要视线居中的内容使用居中卡片；其余抽屉保持从底部拉起。
  center: { type: Boolean, default: false }
});
const emit = defineEmits(['close']);
const close = () => emit('close');

// H5 预览保留桌面键盘习惯：Esc 关闭弹层（小程序端没有 document，自动跳过）。
const onKeydown = (event) => {
  if (event.key === 'Escape') close();
};

onMounted(() => {
  if (typeof document !== 'undefined') document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown);
});
</script>
