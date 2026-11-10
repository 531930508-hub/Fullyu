<template>
  <view class="splash-container">
    <!-- 背景图片 -->
    <image 
      v-if="splashImage" 
      :src="splashImage" 
      class="splash-bg" 
      mode="aspectFill"
    />
    
    <!-- 默认背景色 -->
    <view v-else class="splash-bg-default"></view>
    
    <!-- 跳过按钮 -->
    <view class="skip-btn" @click="skipSplash">
      <text class="skip-text">跳过 {{ countdown }}s</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import miniImageApi from '@/api/miniImage.js'

const splashImage = ref('')
const countdown = ref(3)
let timer = null
let countdownTimer = null

// 获取开屏图片
const getSplashImage = async () => {
  try {
    const res = await miniImageApi.splashScreenImageList()
	console.log(res)
    if (res && res.length > 0) {
		console.log(res);
      splashImage.value = res[0].url || res[0].url || res[0]
    }
  } catch (error) {
    console.error('获取开屏图片失败:', error)
  }
}

// 跳过开屏
const skipSplash = () => {
  clearTimeout(timer)
  clearInterval(countdownTimer)
  navigateToHome()
}

// 跳转到首页
const navigateToHome = () => {
  uni.reLaunch({
    url: '/pages/index/index'
  })
}

// 开始倒计时
const startCountdown = () => {
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
    }
  }, 1000)
}

// 自动跳转
const autoSkip = () => {
  timer = setTimeout(() => {
    navigateToHome()
  }, 3000)
}

onMounted(() => {
  getSplashImage()
  startCountdown()
  autoSkip()
})

// 页面卸载时清理定时器
onUnmounted(() => {
  clearTimeout(timer)
  clearInterval(countdownTimer)
})
</script>

<style lang="scss" scoped>
.splash-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.splash-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.splash-bg-default {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #584219 0%, #8A6D3B 100%);
  z-index: 1;
}

.splash-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.logo {
  width: 200rpx;
  height: 200rpx;
  margin-bottom: 40rpx;
}

.skip-btn {
  position: absolute;
  bottom: 60rpx;
  right: 0;
  transform: translateX(-50%);
  z-index: 3;
  padding: 16rpx 32rpx;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 40rpx;
  backdrop-filter: blur(10rpx);
}

.skip-text {
  color: #fff;
  font-size: 28rpx;
}
</style>