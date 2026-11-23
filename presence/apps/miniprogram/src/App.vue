<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { useUserStore } from './stores/user'
import { updateTabBarLanguage } from './locale'
import { hydrateDicts, warmupDicts } from './utils/dict'

onLaunch(() => {
  const userStore = useUserStore()
  userStore.initFromStorage()
  updateTabBarLanguage()
  // 值集（分类/标签等）先吃本地缓存再后台刷新，页面文案不再写死
  hydrateDicts()
  warmupDicts()
})

/**
 * 未登录冷启动先引导去登录页（现场反馈：进小程序不知道要先登录，看不到预约与会员卡）。
 * - 只判断一次：登录态进来、或者主动点了「先逛逛」都不再被弹回去
 * - 登录页、法务页、分享落地页、导师门户本身是流程入口，不能再被引导走（否则死循环或打断外部跳转）
 * - 原入口连同参数记进 redirect，登录成功后回到原页面，不吞掉用户点进来的内容
 */
const GUEST_SAFE_ENTRIES = [
  'pages/login/index',
  'pages/legal/index',
  'pages/share-landing/index',
  'pages/trainer-portal/login/index',
  'pages/trainer-portal/apply/index',
]
let guestGuided = false

function guideGuestToLogin() {
  if (guestGuided) return
  guestGuided = true
  const userStore = useUserStore()
  if (userStore.isLoggedIn) return
  let launch: any = {}
  try { launch = uni.getLaunchOptionsSync() || {} } catch { launch = {} }
  const entry = String(launch.path || '').replace(/^\//, '')
  if (!entry || GUEST_SAFE_ENTRIES.indexOf(entry) !== -1) return
  const query = launch.query || {}
  const queryString = Object.keys(query)
    .map(key => `${key}=${encodeURIComponent(String(query[key]))}`)
    .join('&')
  const redirect = encodeURIComponent(`/${entry}${queryString ? `?${queryString}` : ''}`)
  // 首屏页面此刻正在加载，等当前帧过去再切，避免 reLaunch 被启动流程覆盖
  setTimeout(() => {
    uni.reLaunch({ url: `/pages/login/index?redirect=${redirect}` })
  }, 0)
}

onShow(() => guideGuestToLogin())
</script>

<style>
/* Full愈 · 在场 / Presence v2。仅小程序主题，不覆盖 PC 后台。 */
page {
  --c-primary: #683611;
  --c-brown: #96581c;
  --c-deep: #3a2a1a;
  --c-ink: #3a2a1a;
  --c-cream: #f5f6ed;
  --c-card: #ffffff;
  --c-card-2: #f3efe0;
  --c-muted: #756a55;
  --c-secondary: #9a8f7a;
  --c-apricot: #d2973e;
  --c-gold: #eec76f;
  --c-rice: #f5f6ed;
  --c-error: #a03d2a;
  --c-success: #5c6b34;
  --line-soft: #e6dcc4;
  --radius-card: 32rpx;
  --radius-button: 24rpx;
  --shadow-card: 0 4rpx 20rpx rgba(104,54,17,.05);
  --font-serif: 'Noto Serif SC', 'Songti SC', 'STSong', serif;
  --font-sans: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  --font-latin: 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
  font-family: var(--font-sans);
  background: var(--c-cream);
  color: var(--c-ink);
  font-size: 28rpx;
  line-height: 1.7;
}
view, button, input, textarea, scroll-view { box-sizing: border-box; }
button { font-family: inherit; font-size: 28rpx; margin: 0; }
button::after { border: none; }
button[disabled] { background: #e9e4d4; color: var(--c-muted); }
.page { min-height: 100vh; background: var(--c-cream); }
.safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
.container { padding: 32rpx; }
.serif { font-family: var(--font-serif); font-weight: 600; }
.latin { font-family: var(--font-latin); font-variant-numeric: tabular-nums; }
.text-primary { color: var(--c-primary); }
.text-secondary, .text-muted { color: var(--c-muted); }
.section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; margin: 36rpx 0 20rpx; }
.section-title { font-family: var(--font-serif); font-size: 36rpx; font-weight: 600; color: var(--c-ink); }
.section-more { font-size: 24rpx; color: var(--c-brown); }
.card { background: var(--c-card); border-radius: var(--radius-card); padding: 36rpx; margin-bottom: 24rpx; box-shadow: var(--shadow-card); }
.divider { height: 1rpx; border: 0; background: var(--line-soft); margin: 24rpx 0; }
.btn, .btn-primary, .btn-secondary, .btn-disabled {
  min-height: 88rpx; padding: 20rpx 32rpx; border-radius: var(--radius-button);
  display: flex; align-items: center; justify-content: center; gap: 12rpx;
  text-align: center; font-size: 28rpx; font-weight: 500; line-height: 1.5;
}
.btn-primary { background: var(--c-primary); color: var(--c-rice); }
.btn-secondary { background: var(--c-card); color: var(--c-primary); border: 2rpx solid var(--c-primary); }
.btn-disabled { background: #e9e4d4; color: var(--c-muted); }
.btn-primary:active, .btn-secondary:active { opacity: .82; }
.chip { display: inline-flex; align-items: center; padding: 4rpx 16rpx; border-radius: 20rpx; font-size: 22rpx; line-height: 1.6; }
.chip-apricot { background: #fbf1df; color: #8a5a17; }
.chip-olive { background: var(--c-card-2); color: var(--c-primary); }
.chip-gold { background: #fbf1df; color: #8a5a17; }
.tabbar-space { height: calc(172rpx + env(safe-area-inset-bottom)); }
/* H5：保留页面比例并隐藏 uni-app 默认底栏。 */
/* #ifdef H5 */
uni-tabbar { display: none !important; }
@media (min-width: 600px) {
  uni-page-body > .page { max-width: 480px; margin: 0 auto; }
}
button:focus-visible, [role='button']:focus-visible { outline: 3px solid var(--c-primary); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
/* #endif */
</style>
