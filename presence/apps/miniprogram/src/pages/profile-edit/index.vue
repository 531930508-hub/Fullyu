<template>
  <view class="page">
    <view class="nav-bar">
      <view class="back-btn" @tap="goBack"><text>←</text></view>
      <text class="nav-title serif">{{ t('profile.editProfile') }}</text>
    </view>

    <!-- 头像 -->
    <view class="section">
      <view class="avatar-row" @tap="changeAvatar">
        <text class="row-label">头像</text>
        <view class="row-right">
          <view class="avatar-preview">
            <image v-if="form.avatar" :src="form.avatar" class="avatar-img" mode="aspectFill" />
            <text v-else class="avatar-placeholder">{{ form.nickname?.charAt(0) || '?' }}</text>
          </view>
          <text class="row-arrow">›</text>
        </view>
      </view>
    </view>

    <!-- 昵称 -->
    <view class="section">
      <view class="form-row">
        <text class="row-label">昵称</text>
        <input class="row-input" v-model="form.nickname" placeholder="请输入昵称" maxlength="20" />
      </view>
    </view>

    <!-- 手机号（只读） -->
    <view class="section">
      <view class="form-row">
        <text class="row-label">手机号</text>
        <text class="row-value">{{ maskedPhone }}</text>
      </view>
    </view>

    <!-- 保存按钮 -->
    <view class="save-section">
      <view class="save-btn" :class="{ disabled: saving }" @tap="handleSave">
        <text>{{ t('common.save') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { getProfile, updateProfile } from '@/api/user'
import { t } from '@/locale'

const userStore = useUserStore()

const form = ref({
  nickname: '',
  avatar: '',
})

const phone = ref('')
const saving = ref(false)

const maskedPhone = computed(() => {
  const p = phone.value || ''
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p
})

async function loadProfile() {
  try {
    const profile = await getProfile()
    if (profile) {
      form.value.nickname = profile.nickname || ''
      form.value.avatar = profile.avatar || ''
      phone.value = profile.phone || ''
    }
  } catch (e) {
    // 静默
  }
}

function changeAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res: any) => {
      const path = res.tempFilePaths && res.tempFilePaths[0]
      if (!path) return
      // 读取为 base64 传给服务器
      // #ifdef MP-WEIXIN
      uni.getFileSystemManager().readFile({
        filePath: path,
        encoding: 'base64',
        success: (r: any) => {
          form.value.avatar = 'data:image/jpeg;base64,' + r.data
        },
        fail: () => {
          // fallback: 使用临时路径显示
          form.value.avatar = path
        },
      })
      // #endif
      // #ifndef MP-WEIXIN
      form.value.avatar = path
      // #endif
    },
  })
}

async function handleSave() {
  if (!form.value.nickname.trim()) {
    uni.showToast({ title: '请输入昵称', icon: 'none' })
    return
  }
  if (saving.value) return
  saving.value = true
  try {
    const updated = await updateProfile({
      nickname: form.value.nickname.trim(),
      avatar: form.value.avatar || undefined,
    })
    // 更新本地 store
    if (userStore.userInfo) {
      userStore.userInfo.nickname = updated.nickname || form.value.nickname
      if (updated.avatar) userStore.userInfo.avatar = updated.avatar
      uni.setStorageSync('userInfo', JSON.stringify(userStore.userInfo))
    }
    uni.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 800)
  } catch (e) {
    // 错误已由 request 提示
  } finally {
    saving.value = false
  }
}

function goBack() {
  uni.navigateBack()
}

onShow(() => {
  loadProfile()
})
</script>

<style scoped>
.page { min-height: 100vh; background: #EAE0D7; }
.nav-bar { display: flex; align-items: center; padding: 32rpx 32rpx 20rpx; gap: 16rpx; }
.back-btn { width: 48rpx; height: 48rpx; display: flex; align-items: center; justify-content: center; font-size: 32rpx; color: #3F2F10; }
.nav-title { font-size: 38rpx; color: #3F2F10; }

.section { margin: 0 32rpx 24rpx; background: #FBF8F3; border-radius: 32rpx; overflow: hidden; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }

.avatar-row { display: flex; align-items: center; justify-content: space-between; padding: 32rpx; }
.row-label { font-size: 28rpx; color: #3F2F10; font-weight: 500; letter-spacing: 1rpx; }
.row-right { display: flex; align-items: center; gap: 12rpx; }
.avatar-preview { width: 100rpx; height: 100rpx; border-radius: 50%; background: #584219; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.avatar-img { width: 100rpx; height: 100rpx; border-radius: 50%; }
.avatar-placeholder { color: #F7F2E9; font-size: 40rpx; }
.row-arrow { font-size: 36rpx; color: #A78E70; }

.form-row { display: flex; align-items: center; padding: 32rpx; }
.row-input { flex: 1; text-align: right; font-size: 28rpx; color: #3F2F10; }
.row-value { flex: 1; text-align: right; font-size: 28rpx; color: #A78E70; }

.save-section { padding: 64rpx 32rpx; }
.save-btn { height: 92rpx; background: #584219; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; }
.save-btn:active { transform: scale(0.96); }
.save-btn text { color: #F7F2E9; font-size: 30rpx; font-weight: 600; letter-spacing: 2rpx; }
.save-btn.disabled { opacity: 0.6; }
</style>
