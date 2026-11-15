<template>
  <web-view v-if="url && !failed" :src="url" :key="url" @load="onLoaded" @error="onError" />
  <view v-else class="game-empty">
    <text class="game-title serif">{{ headline }}</text>
    <text class="game-desc">{{ detail }}</text>
    <button hover-class="none" class="game-retry" :loading="retrying" :disabled="retrying" @click="retry">
      {{ retrying ? tt('正在重新连接', 'Reconnecting') : tt('再试一次', 'Try again') }}
    </button>
    <button hover-class="none" class="game-back" @click="goBack">{{ backLabel }}</button>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useLocale } from '@/lib/useLocale';
import { requestGameTicket } from '@/lib/brandMember';

const { tt } = useLocale();
const url = ref('');
// web-view 加载失败（业务域名未生效、网络异常、票据过期）时 binderror 触发，
// 否则微信只会留下整屏白，用户无从判断是网络问题还是功能问题。
const failed = ref(false);
const loaded = ref(false);
const retrying = ref(false);
let watchdog = 0;

const headline = computed(() =>
  failed.value ? tt('游戏暂时打不开', 'The game cannot open right now') : tt('愈行之旅', 'The Healing Journey')
);
const detail = computed(() =>
  failed.value
    ? tt(
        '可能是网络不稳或会员身份过期。点「再试一次」会重新领取进入凭证；如果仍然打不开，可以稍后再试或联系店里的工作人员。',
        'Your network or member pass may have expired. Tap “Try again” to fetch a fresh pass. If it still fails, try later or ask our team for help.'
      )
    : tt(
        '游戏服务地址尚未配置。配置 CRM 的游戏地址后，会员可在这里掷骰、得积分与旅途礼物。',
        'The game address is not configured yet. Once CRM provides it, members can roll dice here for points and journey gifts.'
      )
);
const backLabel = computed(() => tt('返回会员中心', 'Back to membership'));

onLoad((query) => {
  uni.setNavigationBarTitle({ title: tt('愈行之旅', 'The Healing Journey') });
  let raw = '';
  try {
    raw = decodeURIComponent((query && query.url) || '');
  } catch (error) {
    raw = '';
  }
  const value = raw.trim();
  // 只接受 http(s)，避免把奇怪协议塞进 web-view；地址为空则保持「尚未配置」提示。
  if (!value) return;
  if (!/^https?:\/\//i.test(value)) {
    failed.value = true;
    return;
  }
  url.value = value;
  armWatchdog();
});

onUnload(() => clearTimeout(watchdog));

/** 业务域名未生效时 binderror 不一定触发，白屏兜底：超过 10 秒还没 load 就当作打不开。 */
function armWatchdog() {
  clearTimeout(watchdog);
  if (!url.value) return;
  watchdog = setTimeout(() => {
    if (!loaded.value) failed.value = true;
  }, 10000);
}

function onLoaded() {
  loaded.value = true;
  clearTimeout(watchdog);
}

function onError() {
  clearTimeout(watchdog);
  failed.value = true;
}

/** 票据 5 分钟有效，页面停留过久后刷新拿到的一定是过期票据，所以重试必须换新票据。 */
async function retry() {
  if (retrying.value) return;
  retrying.value = true;
  try {
    const ticket = await requestGameTicket();
    if (!ticket || !ticket.url) throw new Error(tt('游戏服务尚未配置', 'The game service is not configured'));
    loaded.value = false;
    failed.value = false;
    url.value = ticket.url;
    armWatchdog();
  } catch (error) {
    failed.value = true;
    uni.showToast({ title: (error && error.message) || tt('还是没能连上，请稍后再试', 'Still cannot connect — please try later'), icon: 'none' });
  } finally {
    retrying.value = false;
  }
}

function goBack() {
  const pages = getCurrentPages();
  if (pages && pages.length > 1) {
    uni.navigateBack();
    return;
  }
  uni.redirectTo({ url: '/pages/brand-member/index' });
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
.game-retry {
  margin-top: 8px;
  min-height: 42px;
  padding: 0 26px;
  border-radius: 999px;
  background: var(--wood-700, #584219);
  color: var(--card);
  font-size: 13px;
}
.game-back {
  min-height: 42px;
  padding: 0 22px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid currentColor;
  color: var(--ink);
  font-size: 13px;
}
</style>