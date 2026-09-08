<template>
  <!-- 悬浮胶囊 TabBar：毛玻璃米白底 + 圆角 32px + 悬浮投影，选中项加深色圆底衬 -->
  <view class="ftb-wrap safe-area-bottom">
    <view class="ftb-bar">
      <view
        v-for="item in items"
        :key="item.key"
        class="ftb-item"
        :class="{ active: active === item.key }"
        @tap="go(item)"
      >
        <view class="ftb-icon" :class="{ on: active === item.key }">
          <!-- 线性图标（home） -->
          <svg v-if="item.icon === 'home'" viewBox="0 0 24 24" class="ftb-svg">
            <path d="M4 11l8-7 8 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M6.5 9.5V20h11V9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <!-- 线性图标（课程：书页） -->
          <svg v-else-if="item.icon === 'course'" viewBox="0 0 24 24" class="ftb-svg">
            <path d="M12 5.5C10 4 7 4 4.5 5v13c2.5-1 5.5-1 7.5.5 2-1.5 5-1.5 7.5-.5V5C17 4 14 4 12 5.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
            <path d="M12 5.5V18.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <!-- 线性图标（会员：卡） -->
          <svg v-else-if="item.icon === 'member'" viewBox="0 0 24 24" class="ftb-svg">
            <rect x="3.5" y="6" width="17" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M3.5 10h17" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M7 15h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <!-- 线性图标（我的） -->
          <svg v-else viewBox="0 0 24 24" class="ftb-svg">
            <circle cx="12" cy="8.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M5 19.5c1.5-3.2 4-4.5 7-4.5s5.5 1.3 7 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </view>
        <text class="ftb-label">{{ item.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 悬浮胶囊 TabBar（自定义）
 * pages.json 的 tabBar 已设 custom: true，原生条隐藏，由本组件接管。
 * 各 tab 页通过 <floating-tab-bar active="home|courses|member|profile" /> 引入，
 * 页面底部需加 <view class="tabbar-space" /> 预留空间。
 */
import { computed, onMounted } from 'vue'
import { t } from '@/locale'

onMounted(() => {
  // #ifdef MP-WEIXIN
  // custom tabBar 下仍可能闪现原生条，强制隐藏一次（H5 由全局 CSS 接管）
  uni.hideTabBar()
  // #endif
})

const props = defineProps<{ active: 'home' | 'courses' | 'member' | 'profile' }>()

const items = computed(() => [
  { key: 'home', icon: 'home', label: t('tab.home'), url: '/pages/index/index' },
  { key: 'courses', icon: 'course', label: t('tab.courses'), url: '/pages/my-courses/index' },
  { key: 'member', icon: 'member', label: t('tab.member'), url: '/pages/member/index' },
  { key: 'profile', icon: 'profile', label: t('tab.profile'), url: '/pages/profile/index' },
])

function go(item: { key: string; url: string }) {
  if (item.key === props.active) return
  uni.switchTab({ url: item.url })
}
</script>

<style scoped>
.ftb-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 900;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.ftb-bar {
  pointer-events: auto;
  display: flex;
  align-items: center;
  width: 686rpx;
  height: 120rpx;
  margin-bottom: 20rpx;
  padding: 0 16rpx;
  background: rgba(251, 248, 243, 0.82);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 64rpx;
  border: 2rpx solid rgba(88, 66, 25, 0.08);
  box-shadow: 0 16rpx 48rpx rgba(63, 47, 16, 0.16);
}
.ftb-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 96rpx;
}
.ftb-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60rpx;
  height: 60rpx;
  border-radius: 30rpx;
  color: #A78E70;
}
.ftb-icon.on {
  background: #584219;
  color: #F7F2E9;
}
.ftb-svg {
  width: 36rpx;
  height: 36rpx;
}
.ftb-label {
  margin-top: 4rpx;
  font-size: 20rpx;
  letter-spacing: 1rpx;
  color: #A78E70;
}
.ftb-item.active .ftb-label {
  color: #584219;
  font-weight: 500;
}
</style>
