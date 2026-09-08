<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { useUserStore } from './stores/user'
import { updateTabBarLanguage } from './locale'

onLaunch(() => {
  console.log('Full愈 小程序启动')
  // 初始化用户状态
  const userStore = useUserStore()
  userStore.initFromStorage()
  // 初始化 TabBar 语言
  updateTabBarLanguage()
})
</script>

<style>
/* ============================================================
   Fūll愈 · 轻疗 设计系统（2026-09 版）
   气质：安静、放松、被包裹的疗愈感；东方留白 × 北欧自然主义
   禁用饱和色与蓝紫渐变；材质、光影、留白说话
   ============================================================ */

/* H5：隐藏默认 TabBar，由自定义悬浮胶囊 TabBar（FloatingTabBar）接管 */
/* #ifdef H5 */
uni-tabbar {
  display: none !important;
}
/* #endif */

page {
  /* ---- 色彩令牌 ---- */
  --c-primary: #584219;        /* 品牌橄榄棕：主按钮/标题/强调 */
  --c-brown: #6D5934;          /* 辅助棕 */
  --c-deep: #3F2F10;           /* 深棕：深色卡面/会员卡 */
  --c-cream: #EAE0D7;          /* 页面底色（奶油米） */
  --c-card: #FBF8F3;           /* 卡片底 */
  --c-card-2: #F4EEE6;         /* 次级卡片/输入底 */
  --c-apricot: #D3956E;        /* 杏陶色：状态标签/进度/Seeds */
  --c-gold: #C9A35C;           /* 金色：仅会员相关 */
  --c-muted: #A78E70;          /* 弱化文字 */
  --c-ink: #3F2F10;            /* 正文深色 */
  --c-rice: #F7F2E9;           /* 米白：主按钮文字/反白 */
  --line-soft: rgba(88, 66, 25, 0.14); /* 浅棕分割线 */

  /* ---- 字体令牌 ---- */
  --font-serif: 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif;
  --font-sans: 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
  --font-latin: 'Cormorant Garamond', 'Times New Roman', serif;

  font-family: var(--font-sans);
  background-color: #EAE0D7;
  color: #3F2F10;
  font-size: 28rpx;
  line-height: 1.8;
}

/* 全局按压反馈：轻微、有目的 */
view, text, button {
  transition: transform 0.15s ease, opacity 0.2s ease;
}

/* 安全区适配 */
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}

/* 通用容器 */
.container {
  padding: 32rpx;
}

/* ---- 文字层级 ---- */
.text-primary { color: #584219; }
.text-secondary { color: #A78E70; }
.text-muted { color: #A78E70; }

/* 衬线大标题（书卷气）：用于模块标题/页面主标题 */
.serif {
  font-family: var(--font-serif);
  font-weight: 600;
  letter-spacing: 2rpx;
}

/* 英文点缀（品牌名/Seeds/价格数字） */
.latin {
  font-family: var(--font-latin);
  letter-spacing: 1rpx;
}

/* 模块标题组合：衬线大标题 + 右侧小号灰字链接 */
.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.section-head .section-title {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: 36rpx;
  letter-spacing: 2rpx;
  color: #584219;
}
.section-head .section-more {
  font-size: 24rpx;
  color: #A78E70;
}

/* ---- 卡片（22px 圆角，不嵌套卡片） ---- */
.card {
  background: #FBF8F3;
  border-radius: 44rpx;
  padding: 36rpx 32rpx;
  margin-bottom: 28rpx;
  box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05);
}

/* 浅棕虚线分割线 */
.divider {
  border: none;
  border-top: 2rpx dashed rgba(88, 66, 25, 0.14);
  margin: 28rpx 0;
}

/* ---- 按钮（全圆角胶囊） ---- */
.btn {
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 999rpx;
  font-size: 30rpx;
  letter-spacing: 2rpx;
}
.btn:active { transform: scale(0.96); }

.btn-primary {
  background: #584219;
  color: #F7F2E9;
  border-radius: 999rpx;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  font-size: 30rpx;
  font-weight: 500;
  letter-spacing: 2rpx;
}
.btn-primary:active { transform: scale(0.96); }

.btn-secondary {
  background: transparent;
  color: #584219;
  border: 2rpx solid #584219;
  border-radius: 999rpx;
  height: 84rpx;
  line-height: 84rpx;
  text-align: center;
  font-size: 30rpx;
  letter-spacing: 2rpx;
}
.btn-secondary:active { transform: scale(0.96); }

.btn-disabled {
  background: rgba(88, 66, 25, 0.18);
  color: #F7F2E9;
  border-radius: 999rpx;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  font-size: 30rpx;
}

/* ---- 胶囊小标签（状态：余位/满员/待上课） ---- */
.chip {
  display: inline-flex;
  align-items: center;
  padding: 4rpx 20rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  letter-spacing: 1rpx;
}
.chip-apricot {
  background: rgba(211, 149, 110, 0.16);
  color: #B06A3F;
}
.chip-olive {
  background: rgba(88, 66, 25, 0.08);
  color: #584219;
}
.chip-gold {
  background: rgba(201, 163, 92, 0.16);
  color: #9A7A33;
}

/* 为悬浮 TabBar 预留底部空间（tab 页使用） */
.tabbar-space {
  height: 180rpx;
}
</style>
