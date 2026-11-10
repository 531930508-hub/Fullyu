import { ref } from 'vue';

/**
 * 顾客端页面级双语。
 *
 * 语言开关只在首页；其它页面进入时从 storage 读一次，回到前台时再同步，
 * 保证「在外面切了英文，进来就是英文」。模块级 ref 让同页多个组件共享同一状态。
 */
export const LOCALE_KEY = 'teahour.customer.locale';

const locale = ref('zh');

export function readLocale() {
  try {
    const stored = uni.getStorageSync(LOCALE_KEY);
    if (stored === 'en' || stored === 'zh') locale.value = stored;
    else locale.value = 'zh';
  } catch (error) {
    locale.value = 'zh';
  }
  return locale.value;
}

export function useLocale() {
  const tt = (zh, en) => (locale.value === 'en' ? en : zh);
  return { locale, tt, syncLocale: readLocale };
}

// 首次导入时读一次，页面不必等到 onShow 才有正确语言。
readLocale();