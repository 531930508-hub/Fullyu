<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-title serif">{{ t('profile.title') }}</text>
    </view>

    <!-- 用户卡片 -->
    <view class="user-card">
      <template v-if="isLoggedIn">
        <view class="user-avatar" @tap="showEditPopup">
          <image v-if="userInfo?.avatar" :src="userInfo.avatar" class="avatar-img" mode="aspectFill" />
          <text v-else>{{ avatarText }}</text>
        </view>
        <view class="user-info" @tap="showEditPopup">
          <text class="user-name">{{ userInfo?.nickname || '会员' }}</text>
          <text class="user-phone">{{ maskedPhone }}</text>
        </view>
        <view v-if="isMember" class="user-badge">{{ t('profile.memberStatus') }}</view>
      </template>
      <template v-else>
        <view class="user-avatar"><text>游</text></view>
        <view class="user-info">
          <text class="user-name">{{ t('profile.notLoggedIn') }}</text>
          <text class="user-phone">{{ t('profile.loginHint') }}</text>
        </view>
        <!-- #ifndef H5 -->
        <button class="login-btn" open-type="getPhoneNumber" @getphonenumber="onGetPhone">{{ t('profile.login') }}</button>
        <!-- #endif -->
        <!-- #ifdef H5 -->
        <button class="login-btn" @tap="onDevLogin">{{ t('profile.login') }}</button>
        <!-- #endif -->
      </template>
    </view>

    <!-- 资产概览 -->
    <view class="asset-bar" @tap="goAssets">
      <view class="asset-item">
        <text class="asset-value apricot latin">{{ points }}</text>
        <text class="asset-label">{{ t('profile.points') }}</text>
      </view>
      <view class="asset-item">
        <text class="asset-value latin">{{ completedCount }}</text>
        <text class="asset-label">{{ t('profile.completed') }}</text>
      </view>
      <view class="asset-item">
        <text class="asset-value latin">{{ upcomingCount }}</text>
        <text class="asset-label">{{ t('profile.upcoming') }}</text>
      </view>
      <view class="asset-item">
        <text class="asset-value">{{ isMember ? '✓' : '—' }}</text>
        <text class="asset-label">{{ t('profile.memberStatus') }}</text>
      </view>
    </view>

    <!-- 功能入口 -->
    <view class="menu-section">
      <view class="menu-group">
        <view class="menu-item" @tap="goAssets">
          <view class="menu-dot"></view>
          <text class="menu-text">{{ t('profile.myAssets') }}</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="goPage('my-courses')">
          <view class="menu-dot"></view>
          <text class="menu-text">{{ t('profile.bookings') }}</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="goMyReviews">
          <view class="menu-dot"></view>
          <text class="menu-text">{{ t('profile.myReviews') }}</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="goCommunityMine">
          <view class="menu-dot"></view>
          <text class="menu-text">我的社群</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="goPage('member')">
          <view class="menu-dot gold"></view>
          <text class="menu-text">{{ t('profile.memberCard') }}</text>
          <text class="menu-extra">{{ t('profile.memberActive') }}</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>

      <view v-if="isTrainer" class="menu-group">
        <view class="menu-item" @tap="toggleView">
          <view class="menu-dot"></view>
          <text class="menu-text">当前视角</text>
          <text class="menu-extra">{{ activeView === 'trainer' ? '导师视角' : '课程视角' }}</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="goCommunityMine">
          <view class="menu-dot"></view>
          <text class="menu-text">经营我的社群</text>
          <text class="menu-extra">导师</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="goTrainerWorkspace">
          <view class="menu-dot"></view>
          <text class="menu-text">{{ t('profile.trainerWorkspace') }}</text>
          <text class="menu-extra">{{ t('profile.trainerRole') }}</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>

      <view class="menu-group">
        <view class="menu-item" @tap="toggleLang">
          <view class="menu-dot"></view>
          <text class="menu-text">{{ t('profile.language') }}</text>
          <text class="menu-extra">{{ language === 'zh' ? '中文' : 'English' }}</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="contactService">
          <view class="menu-dot"></view>
          <text class="menu-text">{{ t('profile.contactService') }}</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="menu-item" @tap="showAbout">
          <view class="menu-dot"></view>
          <text class="menu-text">{{ t('profile.about') }}</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>
    </view>

    <!-- 编辑资料弹窗（Bottom Sheet） -->
    <view v-if="editVisible" class="popup-mask" @tap="editVisible = false">
      <view class="popup-content" @tap.stop>
        <view class="popup-handle"></view>
        <text class="popup-title serif">修改资料</text>
        <view class="edit-avatar-row" @tap="changeAvatar">
          <view class="edit-avatar">
            <image v-if="editForm.avatar" :src="editForm.avatar" class="edit-avatar-img" mode="aspectFill" />
            <text v-else class="edit-avatar-text">{{ editForm.nickname?.charAt(0) || '?' }}</text>
          </view>
          <text class="edit-avatar-hint">点击更换头像</text>
        </view>
        <view class="edit-name-row">
          <text class="edit-label">昵称</text>
          <input class="edit-input" v-model="editForm.nickname" placeholder="请输入昵称" maxlength="20" />
        </view>
        <view class="edit-actions">
          <view class="edit-cancel" @tap="editVisible = false"><text>取消</text></view>
          <view class="edit-confirm" @tap="handleSaveProfile"><text>保存</text></view>
        </view>
      </view>
    </view>

    <!-- 悬浮 TabBar -->
    <view class="tabbar-space"></view>
    <floating-tab-bar active="profile" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useUserStore } from '../../stores/user'
import { t, updateTabBarLanguage } from '@/locale'
import { getPoints, getProfile, updateProfile } from '@/api/user'
import { getActiveCard } from '@/api/member'
import { listMyOrders } from '@/api/order'
import FloatingTabBar from '@/components/FloatingTabBar.vue'

const userStore = useUserStore()
const { userInfo, isLoggedIn, isTrainer, activeView } = storeToRefs(userStore)
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

// #ifdef H5
/** H5 端手机号快捷登录（无微信环境，测试服开启 DEV_LOGIN_ENABLED 时可用） */
function onDevLogin() {
  uni.showModal({
    title: '手机号登录',
    editable: true,
    placeholderText: '输入手机号（如 13800000000）',
    confirmColor: '#584219',
    success: (res) => {
      if (!res.confirm) return
      const phone = (res.content || '').trim()
      if (!/^1\d{10}$/.test(phone)) {
        uni.showToast({ title: '手机号格式不对', icon: 'none' })
        return
      }
      uni.showLoading({ title: '登录中...' })
      userStore
        .devLogin(phone)
        .then(() => {
          uni.hideLoading()
          uni.showToast({ title: '登录成功', icon: 'success' })
          loadUserData()
        })
        .catch(() => {
          uni.hideLoading()
        })
    },
  })
}
// #endif

onShow(() => {
  language.value = userStore.language
  loadUserData()
})

function goEditProfile() {
  uni.navigateTo({ url: '/pages/profile-edit/index' })
}

// --- 弹窗编辑资料 ---
const editVisible = ref(false)
const editForm = ref({ nickname: '', avatar: '' })
const editSaving = ref(false)

function showEditPopup() {
  if (!isLoggedIn.value) return
  editForm.value.nickname = userInfo.value?.nickname || ''
  editForm.value.avatar = userInfo.value?.avatar || ''
  editVisible.value = true
}

function changeAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res: any) => {
      const path = res.tempFilePaths && res.tempFilePaths[0]
      if (!path) return
      // #ifdef MP-WEIXIN
      uni.getFileSystemManager().readFile({
        filePath: path,
        encoding: 'base64',
        success: (r: any) => { editForm.value.avatar = 'data:image/jpeg;base64,' + r.data },
        fail: () => { editForm.value.avatar = path },
      })
      // #endif
      // #ifndef MP-WEIXIN
      editForm.value.avatar = path
      // #endif
    },
  })
}

async function handleSaveProfile() {
  if (!editForm.value.nickname.trim()) {
    uni.showToast({ title: '请输入昵称', icon: 'none' })
    return
  }
  if (editSaving.value) return
  editSaving.value = true
  try {
    const updated = await updateProfile({
      nickname: editForm.value.nickname.trim(),
      avatar: editForm.value.avatar || undefined,
    })
    if (userStore.userInfo) {
      userStore.userInfo.nickname = updated.nickname || editForm.value.nickname
      if (updated.avatar) userStore.userInfo.avatar = updated.avatar
      uni.setStorageSync('userInfo', JSON.stringify(userStore.userInfo))
    }
    editVisible.value = false
    uni.showToast({ title: '保存成功', icon: 'success' })
  } catch (e) {
    // 错误已由 request 提示
  } finally {
    editSaving.value = false
  }
}

function goAssets() {
  uni.navigateTo({ url: '/pages/assets/index' })
}

function goPage(page: string) {
  uni.switchTab({ url: `/pages/${page}/index` })
}

function goTrainerWorkspace() {
  uni.navigateTo({ url: '/pages/trainer-workspace/index' })
}

/** 学员/导师视角切换：切完回首页，首页按新视角渲染 */
function toggleView() {
  const next = activeView.value === 'trainer' ? 'student' : 'trainer'
  userStore.setViewMode(next)
  uni.showToast({ title: next === 'trainer' ? '已切到导师视角' : '已切到课程视角', icon: 'none' })
  setTimeout(() => uni.switchTab({ url: '/pages/index/index' }), 400)
}

function goCommunityMine() {
  uni.navigateTo({ url: '/pages/community-mine/index' })
}

function goMyReviews() {
  uni.navigateTo({ url: '/pages/my-reviews/index' })
}

const SERVICE_PHONE = '400-820-8820'
function contactService() {
  uni.showModal({
    title: '联系客服',
    content: `客服热线：${SERVICE_PHONE}\n服务时间：09:00 - 21:00`,
    confirmText: '拨打',
    confirmColor: '#584219',
    success: (res) => {
      if (res.confirm) {
        uni.makePhoneCall({ phoneNumber: SERVICE_PHONE })
      }
    },
  })
}

function toggleLang() {
  userStore.switchLanguage()
  language.value = userStore.language
  updateTabBarLanguage()
  uni.showToast({ title: language.value === 'zh' ? '已切换为中文' : 'Switched to English', icon: 'none' })
}

function showAbout() {
  uni.showModal({
    title: '关于 Full愈',
    content: 'Full愈 — 身心疗愈品牌\n\n专注正念冥想、声音疗愈、舞动治疗等身心整合课程\n\n版本：1.0.0',
    showCancel: false,
    confirmColor: '#584219',
  })
}

function showToast(title: string) {
  uni.showToast({ title: `${title}功能开发中`, icon: 'none' })
}
</script>

<style scoped>
.page { min-height: 100vh; background: #EAE0D7; }
.nav-bar { padding: 32rpx 32rpx 20rpx; }
.nav-title { font-size: 40rpx; color: #3F2F10; }

.user-card { margin: 8rpx 32rpx 28rpx; background: #FBF8F3; border-radius: 44rpx; padding: 36rpx 32rpx; display: flex; align-items: center; gap: 24rpx; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.user-avatar { width: 100rpx; height: 100rpx; border-radius: 50%; background: #584219; color: #F7F2E9; font-size: 40rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.user-info { flex: 1; }
.user-name { font-size: 34rpx; font-weight: 600; color: #3F2F10; display: block; letter-spacing: 1rpx; }
.user-phone { font-size: 24rpx; color: #A78E70; }
.user-badge { font-size: 22rpx; color: #8C7335; background: rgba(201, 163, 92, 0.18); padding: 8rpx 24rpx; border-radius: 999rpx; letter-spacing: 1rpx; }
.avatar-img { width: 100rpx; height: 100rpx; border-radius: 50%; }
.login-btn { margin: 0; font-size: 26rpx; color: #F7F2E9; background: #584219; padding: 0 40rpx; height: 64rpx; line-height: 64rpx; border-radius: 999rpx; letter-spacing: 1rpx; }
.login-btn::after { border: none; }

.asset-bar { margin: 0 32rpx 28rpx; background: #FBF8F3; border-radius: 44rpx; padding: 32rpx 0; display: flex; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.asset-item { flex: 1; text-align: center; }
.asset-value { font-size: 34rpx; font-weight: 600; color: #3F2F10; display: block; margin-bottom: 6rpx; }
.asset-value.apricot { color: #D3956E; }
.asset-label { font-size: 22rpx; color: #A78E70; }

.menu-section { padding: 0 32rpx; }
.menu-group { background: #FBF8F3; border-radius: 44rpx; margin-bottom: 28rpx; overflow: hidden; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.menu-item { display: flex; align-items: center; padding: 32rpx 36rpx; border-bottom: 2rpx dashed rgba(88, 66, 25, 0.14); margin: 0 0; }
.menu-item:last-child { border-bottom: none; }
.menu-item:active { background: rgba(88, 66, 25, 0.03); }
.menu-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #584219; margin-right: 24rpx; flex-shrink: 0; }
.menu-dot.gold { background: #C9A35C; }
.menu-text { flex: 1; font-size: 28rpx; color: #3F2F10; letter-spacing: 1rpx; }
.menu-extra { font-size: 24rpx; color: #A78E70; margin-right: 12rpx; }
.menu-arrow { font-size: 32rpx; color: #A78E70; }

/* 编辑资料弹窗 Bottom Sheet */
.popup-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(63, 47, 16, 0.4); z-index: 999; display: flex; align-items: flex-end; justify-content: center; }
.popup-content { width: 100%; background: #F4EEE6; border-radius: 52rpx 52rpx 0 0; padding: 48rpx 40rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); animation: sheet-up 0.3s ease; }
@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.popup-handle { width: 72rpx; height: 8rpx; border-radius: 999rpx; background: rgba(88, 66, 25, 0.14); margin: 0 auto 32rpx; }
.popup-title { font-size: 36rpx; color: #3F2F10; display: block; margin-bottom: 36rpx; text-align: center; }
.edit-avatar-row { display: flex; flex-direction: column; align-items: center; margin-bottom: 36rpx; }
.edit-avatar { width: 128rpx; height: 128rpx; border-radius: 50%; background: #584219; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 14rpx; }
.edit-avatar-img { width: 128rpx; height: 128rpx; border-radius: 50%; }
.edit-avatar-text { color: #F7F2E9; font-size: 48rpx; }
.edit-avatar-hint { font-size: 22rpx; color: #A78E70; }
.edit-name-row { display: flex; align-items: center; margin-bottom: 36rpx; gap: 16rpx; }
.edit-label { font-size: 28rpx; color: #3F2F10; font-weight: 500; flex-shrink: 0; letter-spacing: 1rpx; }
.edit-input { flex: 1; height: 84rpx; border: 2rpx solid rgba(88, 66, 25, 0.14); background: #FBF8F3; border-radius: 24rpx; padding: 0 28rpx; font-size: 28rpx; color: #3F2F10; }
.edit-actions { display: flex; gap: 20rpx; }
.edit-cancel { flex: 1; height: 92rpx; border: 2rpx solid #584219; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; font-size: 28rpx; color: #584219; }
.edit-confirm { flex: 2; height: 92rpx; background: #584219; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; }
.edit-confirm:active { transform: scale(0.96); }
.edit-confirm text { color: #F7F2E9; font-size: 28rpx; font-weight: 600; letter-spacing: 2rpx; }
</style>
