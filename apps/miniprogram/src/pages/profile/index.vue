<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-title">我的</text>
    </view>

    <!-- 用户卡片 -->
    <view class="user-card">
      <template v-if="isLoggedIn">
        <view class="user-avatar">
          <image v-if="userInfo?.avatar" :src="userInfo.avatar" class="avatar-img" mode="aspectFill" />
          <text v-else>{{ avatarText }}</text>
        </view>
        <view class="user-info">
          <text class="user-name">{{ userInfo?.nickname || '会员' }}</text>
          <text class="user-phone">{{ maskedPhone }}</text>
        </view>
        <view v-if="isMember" class="user-badge">会员</view>
      </template>
      <template v-else>
        <view class="user-avatar"><text>游</text></view>
        <view class="user-info">
          <text class="user-name">未登录</text>
          <text class="user-phone">登录后享受完整服务</text>
        </view>
        <button class="login-btn" open-type="getPhoneNumber" @getphonenumber="onGetPhone">登录</button>
      </template>
    </view>

    <!-- 资产概览 -->
    <view class="asset-bar" @tap="goAssets">
      <view class="asset-item">
        <text class="asset-value">{{ points }}</text>
        <text class="asset-label">积分</text>
      </view>
      <view class="asset-item">
        <text class="asset-value">{{ completedCount }}</text>
        <text class="asset-label">已完课</text>
      </view>
      <view class="asset-item">
        <text class="asset-value">{{ upcomingCount }}</text>
        <text class="asset-label">待上课</text>
      </view>
      <view class="asset-item">
        <text class="asset-value">{{ isMember ? '✓' : '—' }}</text>
        <text class="asset-label">会员</text>
      </view>
    </view>

    <!-- 功能入口 -->
    <view class="menu-section">
      <view class="menu-group">
        <view class="menu-item" @tap="goAssets">
          <text class="menu-icon">💰</text>
          <text class="menu-text">我的资产</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="goPage('my-courses')">
          <text class="menu-icon">📚</text>
          <text class="menu-text">预约记录</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="showToast('我的评价')">
          <text class="menu-icon">⭐</text>
          <text class="menu-text">我的评价</text>
          <text class="menu-extra">3条</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="goPage('member')">
          <text class="menu-icon">🎫</text>
          <text class="menu-text">会员卡</text>
          <text class="menu-extra">年卡有效</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>

      <view v-if="isTrainer" class="menu-group">
        <view class="menu-item" @tap="goTrainerWorkspace">
          <text class="menu-icon">🎓</text>
          <text class="menu-text">导师工作台</text>
          <text class="menu-extra">导师身份</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>

      <view class="menu-group">
        <view class="menu-item" @tap="toggleLang">
          <text class="menu-icon">🌐</text>
          <text class="menu-text">语言切换</text>
          <text class="menu-extra">{{ language === 'zh' ? '中文' : 'English' }}</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="showToast('联系客服')">
          <text class="menu-icon">💬</text>
          <text class="menu-text">联系客服</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="showAbout">
          <text class="menu-icon">ℹ️</text>
          <text class="menu-text">关于 Full愈</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useUserStore } from '../../stores/user'
import { getPoints } from '@/api/user'
import { getActiveCard } from '@/api/member'
import { listMyOrders } from '@/api/order'

const userStore = useUserStore()
const { userInfo, isLoggedIn, isTrainer } = storeToRefs(userStore)
const language = ref(userStore.language)

const points = ref(0)
const isMember = ref(false)
const completedCount = ref(0)
const upcomingCount = ref(0)

const avatarText = computed(() => userInfo.value?.nickname?.charAt(0) || '会')
const maskedPhone = computed(() => {
  const p = userInfo.value?.phone || ''
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p
})

async function loadUserData() {
  if (!isLoggedIn.value) {
    points.value = 0
    isMember.value = false
    completedCount.value = 0
    upcomingCount.value = 0
    return
  }
  try {
    const [pts, card, orders] = await Promise.all([
      getPoints().catch(() => ({ balance: 0 })),
      getActiveCard().catch(() => null),
      listMyOrders().catch(() => []),
    ])
    points.value = pts?.balance ?? 0
    isMember.value = !!card
    const courseOrders = (orders || []).filter((o) => o.orderType !== 'MEMBER_CARD')
    completedCount.value = courseOrders.filter((o) => o.status === 'COMPLETED').length
    upcomingCount.value = courseOrders.filter((o) => o.status === 'PAID').length
  } catch (e) {
    // 静默
  }
}

function onGetPhone(e: any) {
  const code = e?.detail?.code
  if (!code) {
    uni.showToast({ title: '已取消登录', icon: 'none' })
    return
  }
  uni.showLoading({ title: '登录中...' })
  userStore
    .login(code)
    .then(() => {
      uni.hideLoading()
      uni.showToast({ title: '登录成功', icon: 'success' })
      loadUserData()
    })
    .catch(() => {
      uni.hideLoading()
    })
}

onShow(() => {
  language.value = userStore.language
  loadUserData()
})

function goAssets() {
  uni.navigateTo({ url: '/pages/assets/index' })
}

function goPage(page: string) {
  uni.switchTab({ url: `/pages/${page}/index` })
}

function goTrainerWorkspace() {
  uni.navigateTo({ url: '/pages/trainer-workspace/index' })
}

function toggleLang() {
  userStore.switchLanguage()
  language.value = userStore.language
  uni.showToast({ title: language.value === 'zh' ? '已切换为中文' : 'Switched to English', icon: 'none' })
}

function showAbout() {
  uni.showModal({
    title: '关于 Full愈',
    content: 'Full愈 — 身心疗愈品牌\n\n专注正念冥想、声音疗愈、舞动治疗等身心整合课程\n\n版本：1.0.0',
    showCancel: false,
    confirmColor: '#6B463C',
  })
}

function showToast(title: string) {
  uni.showToast({ title: `${title}功能开发中`, icon: 'none' })
}
</script>

<style scoped>
.page { min-height: 100vh; background: #F5E8D8; padding-bottom: 120rpx; }
.nav-bar { padding: 24rpx 32rpx; }
.nav-title { font-size: 36rpx; font-weight: 700; color: #4B3621; }

.user-card { margin: 0 32rpx 24rpx; background: #FFF; border-radius: 24rpx; padding: 32rpx; display: flex; align-items: center; gap: 20rpx; }
.user-avatar { width: 96rpx; height: 96rpx; border-radius: 50%; background: #6B463C; color: #FFF; font-size: 40rpx; display: flex; align-items: center; justify-content: center; }
.user-info { flex: 1; }
.user-name { font-size: 32rpx; font-weight: 600; color: #4B3621; display: block; }
.user-phone { font-size: 24rpx; color: #A08A72; }
.user-badge { font-size: 22rpx; color: #6B463C; background: #F5E8D8; padding: 8rpx 20rpx; border-radius: 20rpx; }
.avatar-img { width: 96rpx; height: 96rpx; border-radius: 50%; }
.login-btn { margin: 0; font-size: 26rpx; color: #FFF; background: #6B463C; padding: 0 32rpx; height: 60rpx; line-height: 60rpx; border-radius: 30rpx; }
.login-btn::after { border: none; }

.asset-bar { margin: 0 32rpx 24rpx; background: #FFF; border-radius: 20rpx; padding: 28rpx 0; display: flex; }
.asset-item { flex: 1; text-align: center; }
.asset-value { font-size: 32rpx; font-weight: 700; color: #4B3621; display: block; margin-bottom: 4rpx; }
.asset-label { font-size: 22rpx; color: #A08A72; }

.menu-section { padding: 0 32rpx; }
.menu-group { background: #FFF; border-radius: 20rpx; margin-bottom: 20rpx; overflow: hidden; }
.menu-item { display: flex; align-items: center; padding: 28rpx 32rpx; border-bottom: 1rpx solid #F5F0EB; }
.menu-item:last-child { border-bottom: none; }
.menu-icon { font-size: 32rpx; margin-right: 20rpx; }
.menu-text { flex: 1; font-size: 28rpx; color: #4B3621; }
.menu-extra { font-size: 24rpx; color: #A08A72; margin-right: 12rpx; }
.menu-arrow { font-size: 32rpx; color: #C4A882; }
</style>
