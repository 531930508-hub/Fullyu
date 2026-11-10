<template>
  <web-view v-if="url" :src="url" />
  <view v-else class="game-empty">
    <text class="game-title serif">{{ tt('愈行之旅', 'The Healing Journey') }}</text>
    <text class="game-desc">{{ tt('游戏服务地址尚未配置。配置 CRM 的游戏地址后，会员可在这里掷骰、得积分与旅途礼物。', 'The game address is not configured yet. Once CRM provides it, members can roll dice here for points and journey gifts.') }}</text>
    <button hover-class="none" class="game-back" @click="goBack">{{ tt('返回会员中心', 'Back to membership') }}</button>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocale } from '@/lib/useLocale';

const { tt } = useLocale();
const url = ref('');

onLoad((query) => {
  try {
    url.value = decodeURIComponent((query && query.url) || '');
  } catch (error) {
    url.value = '';
  }
});

function goBack() {
  uni.navigateBack();
}
</script>

<style scoped>
.game-empty {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 40px 28px;
  background: var(--paper);
  color: var(--ink);
  text-align: center;
}
.game-title {
  font-size: 26px;
  letter-spacing: var(--tracking-title);
}
.game-desc {
  max-width: 300px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
}
.game-back {
  margin-top: 8px;
  min-height: 42px;
  padding: 0 22px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--card);
  font-size: 13px;
}
</style>
