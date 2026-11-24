import { createSSRApp } from 'vue';
import App from './App.vue';

const SHARE_TITLES = {
  zh: 'Full愈·时叙｜一杯茶，回到此刻。',
  en: 'Full愈 · Tea Hour — a moment, all yours.'
};

function shareTitle() {
  return SHARE_TITLES[uni.getStorageSync('teahour.customer.locale')] || SHARE_TITLES.zh;
}

export function createApp() {
  const app = createSSRApp(App);
  app.mixin({
    // #ifdef MP-WEIXIN
    onShareAppMessage() {
      return {
        title: shareTitle(),
        path: '/pages/index/index',
        imageUrl: '/static/tea.webp'
      };
    },
    onShareTimeline() {
      return {
        title: shareTitle(),
        query: '',
        imageUrl: '/static/tea.webp'
      };
    },
    // #endif
  });
  return { app };
}
