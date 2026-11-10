<template>
  <view class="st-page">
    <view :style="{ height: statusBarHeight + 'px' }" />
    <view class="st-nav">
      <button hover-class="none" class="st-back" :aria-label="tt('返回', 'Back')" @click="goBack">
        <AppIcon name="chevronLeft" :size="20" />
      </button>
      <text class="st-nav-title">{{ tt('会员故事', 'Member stories') }}</text>
      <view class="st-nav-tail" />
    </view>

    <view class="st-wrap">
      <text class="st-lead">{{ tt('从会员的建议开始，一点一点把时叙变成大家想要的样子。', 'It started with members\' notes — bit by bit, 时叙 becomes what you want it to be.') }}</text>

      <view v-if="loading" class="st-state">{{ tt('正在读会员故事…', 'Loading member stories…') }}</view>
      <view v-else-if="error" class="st-state">
        <text>{{ error }}</text>
        <button hover-class="none" class="st-btn" @click="load">{{ tt('重新加载', 'Try again') }}</button>
      </view>
      <view v-else-if="!stories.length" class="st-state">{{ tt('第一批会员故事正在整理中。', 'The first member stories are being prepared.') }}</view>

      <template v-else>
        <view v-for="item in stories" :key="item.id" class="st-card">
          <view class="st-card-head">
            <text class="st-title serif">{{ item.title }}</text>
            <text v-if="businessLabel(item.business)" class="st-tag">{{ businessLabel(item.business) }}</text>
          </view>
          <text v-if="item.quote" class="st-quote">“{{ item.quote }}”<text v-if="item.quoteBy" class="st-by"> —— {{ item.quoteBy }}</text></text>
          <text class="st-body">{{ item.story }}</text>
          <text v-if="item.publishedAt" class="st-date">{{ item.publishedAt }}</text>
        </view>
      </template>

      <view class="st-foot">
        <text>{{ tt('放松有道　自在生活', 'Rest, with intention') }}</text>
        <text class="st-foot-sub">{{ tt('Full愈 · 时叙', 'Full Yuk · 时叙') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import AppIcon from '@/components/AppIcon.vue';
import { loadStories } from '@/lib/brandMember';
import { useLocale } from '@/lib/useLocale';

const { tt } = useLocale();

const statusBarHeight = ref(20);
const loading = ref(true);
const error = ref('');
const stories = ref([]);

function businessLabel(business) {
  // CRM 对外用 teahour / presence / retreat，本地合成数据可能仍带 sx / zc / ql。
  return { teahour: '时叙', sx: '时叙', presence: '在场', zc: '在场', retreat: '轻疗', ql: '轻疗' }[business] || '';
}

function goBack() {
  const pages = getCurrentPages();
  if (pages && pages.length > 1) {
    uni.navigateBack();
    return;
  }
  uni.navigateTo({ url: '/pages/brand-member/index' });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const system = uni.getSystemInfoSync();
    statusBarHeight.value = (system && system.statusBarHeight) || 20;
    const res = await loadStories();
    stories.value = res && Array.isArray(res.stories) ? res.stories : [];
  } catch {
    stories.value = [];
    // 接口只对有效品牌会员开放；请求层不透出状态码，统一给可重试的边界提示。
    error.value = tt(
      '会员故事暂时没读到。仅有效品牌会员可查看，稍后可以再试。',
      'Stories are unavailable right now. Only active members can read them — please try again later.'
    );
  } finally {
    loading.value = false;
  }
}

onLoad(() => {
  load();
});
</script>

<style scoped>
.st-page {
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
}
.st-nav {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 16px;
}
.st-back {
  position: absolute;
  left: 10px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}
.st-nav-title {
  font-family: var(--serif);
  font-size: 16px;
  letter-spacing: var(--tracking-title);
}
.st-nav-tail {
  position: absolute;
  right: 16px;
  width: 1px;
  height: 1px;
}
.st-wrap {
  max-width: 400px;
  margin: 0 auto;
  padding: 8px 18px 40px;
}
.st-lead {
  display: block;
  margin-bottom: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted);
}
.st-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--muted);
  text-align: center;
}
.st-btn {
  padding: 8px 18px;
  font-size: 12px;
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
}
.st-card {
  margin-bottom: 14px;
  padding: 20px 18px;
  border-radius: 20px;
  background: var(--card);
  border: 1px solid var(--line-soft);
}
.st-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.st-title {
  font-size: 17px;
  line-height: 1.4;
  letter-spacing: var(--tracking-title);
}
.st-tag {
  flex: none;
  margin-top: 2px;
  padding: 1px 7px;
  font-size: 9px;
  letter-spacing: var(--tracking-label);
  color: var(--wood);
  border: 1px solid var(--line);
  border-radius: 999px;
}
.st-quote {
  display: block;
  margin-top: 12px;
  padding-left: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--wood);
  border-left: 2px solid var(--line);
}
.st-by {
  font-size: 10px;
  color: var(--muted);
}
.st-body {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.85;
  white-space: pre-wrap;
}
.st-date {
  display: block;
  margin-top: 12px;
  font-size: 9px;
  color: var(--muted);
}
.st-foot {
  margin-top: 26px;
  text-align: center;
  font-family: var(--serif);
  font-size: 12px;
  letter-spacing: var(--tracking-title);
  color: var(--muted);
}
.st-foot-sub {
  display: block;
  margin-top: 4px;
  font-size: 9px;
  letter-spacing: var(--tracking-label);
}
</style>
