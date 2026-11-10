<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack :disabled="saving" fallback="/pages/profile/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }"><view class="back-spacer"></view><text class="nav-title serif">{{ t('profile.editProfile') }}</text></view>
    <view class="content">
      <PageState v-if="!isLoggedIn" state="guest" :title="tr('登录后编辑资料', 'Log in to edit your profile')" :message="tr('你的头像与昵称会用于课程和社群展示', 'Your avatar and nickname appear in courses and communities')" :action="tr('去登录', 'Log in')" @action="goLogin" />
      <PageState v-else-if="loading" state="loading" :title="tr('正在读取资料', 'Loading profile')" />
      <PageState v-else-if="loadError" state="error" :title="tr('资料加载失败', 'Failed to load profile')" :message="tr('未读取到完整资料，请重试后再编辑', 'The profile could not be fully loaded. Retry before editing.')" :action="tr('重新加载', 'Reload')" @action="loadProfile" />
      <template v-else-if="loaded">
        <button class="avatar-editor" :disabled="saving || choosingAvatar" @tap="changeAvatar">
          <view class="avatar-wrap"><view class="avatar-preview"><image v-if="form.avatar" :src="form.avatar" class="avatar-image" mode="aspectFill" /><text v-else class="avatar-letter serif">{{ form.nickname?.charAt(0) || (isEnglish() ? 'F' : '愈') }}</text></view><view class="camera-badge"><PresenceIcon name="camera" :size="30" :color="iconColors.rice" /></view></view>
          <text class="avatar-action">{{ choosingAvatar ? tr('正在读取头像', 'Reading image') : tr('更换头像', 'Change avatar') }}</text>
        </button>
        <view class="profile-card">
          <view class="form-row"><label class="row-label" for="nickname">{{ tr('昵称', 'Nickname') }}</label><input id="nickname" v-model="form.nickname" class="row-input" :placeholder="tr('请输入昵称', 'Enter a nickname')" maxlength="20" :disabled="saving" /></view>
          <view class="form-row"><text class="row-label">{{ tr('手机号', 'Phone') }}</text><view class="phone-value"><PresenceIcon name="lock" :size="28" :color="iconColors.muted" /><text>{{ maskedPhone || tr('未提供', 'Not provided') }}</text></view></view>
          <text class="field-note">{{ tr('手机号不可在此修改，如需更换请联系客服核验身份。', 'The phone number cannot be changed here. Contact support for identity verification to change it.') }}</text>
        </view>
        <view class="profile-card">
          <view class="card-heading"><PresenceIcon name="user" :size="36" /><text>{{ tr('公开资料', 'Public profile') }}</text></view>
          <text class="field-note">{{ tr('头像和昵称用于展示。本页仅保存这两项资料，不会修改会员核验照片。', 'Avatar and nickname are for display. This page only saves these two fields and will not change your membership verification photo.') }}</text>
        </view>
        <view class="privacy-notice"><PresenceIcon name="lock" :size="32" /><text>{{ tr('会员照片仅用于线下签到核验，开卡后有效期内不可在资料页修改。', 'The membership photo is only used for on-site check-in verification and cannot be changed on this page during the card term.') }}</text></view>
        <text v-if="saveError" class="feedback" role="alert">{{ saveError }}</text>
        <button class="save-button" :loading="saving" :disabled="saving || choosingAvatar" @tap="handleSave">{{ saving ? tr('保存中', 'Saving') : t('common.save') }}</button>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { getProfile, updateProfile } from '@/api/user'
import { compressImageToDataUrl } from '@/utils/image'
import { t, tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'
import PageState from '@/components/PageState.vue'
import FloatingBack from '@/components/FloatingBack.vue'

// SVG data-URL images require resolved DESIGN token values, not page CSS variables.
const iconColors = { rice: '#f5f6ed', muted: '#756a55' }
const userStore = useUserStore()
const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const isLoggedIn = computed(() => userStore.isLoggedIn)
const form = ref({ nickname: '', avatar: '' })
const phone = ref('')
const saving = ref(false)
const choosingAvatar = ref(false)
const loading = ref(false)
const loaded = ref(false)
const loadedFor = ref('')
const loadError = ref(false)
const saveError = ref('')
const maskedPhone = computed(() => { const p = phone.value || ''; return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p })

async function loadProfile() {
  if (!uni.getStorageSync('token')) userStore.logout()
  if (!isLoggedIn.value) { form.value = { nickname: '', avatar: '' }; phone.value = ''; loaded.value = false; loadedFor.value = ''; return }
  if (loading.value || saving.value) return
  loading.value = true
  loadError.value = false
  try {
    const profile = await getProfile()
    if (!uni.getStorageSync('token')) { userStore.logout(); return }
    if (!profile) throw new Error(tr('资料不存在', 'Profile not found'))
    form.value = { nickname: profile.nickname || '', avatar: profile.avatar || '' }
    phone.value = profile.phone || ''
    loaded.value = true
    loadedFor.value = userStore.userInfo?.id || ''
  } catch {
    loadError.value = true
    if (!uni.getStorageSync('token')) userStore.logout()
  } finally { loading.value = false }
}
async function changeAvatar() {
  if (saving.value || choosingAvatar.value || !loaded.value) return
  choosingAvatar.value = true
  saveError.value = ''
  try {
    const filePath = await new Promise<string>((resolve, reject) => {
      uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: (res: any) => resolve(res.tempFilePaths?.[0] || ''), fail: reject })
    })
    // 统一压缩到长边 720px，避免原图 base64 超过网关请求体限制
    if (filePath) form.value.avatar = await compressImageToDataUrl(filePath)
  } catch (error: any) {
    if (!String(error?.errMsg || error?.message || '').includes('cancel')) {
      saveError.value = error?.message || tr('头像读取失败，请重新选择；原头像未更改', 'Could not read the image. Choose another; your current avatar is unchanged.')
    }
  } finally { choosingAvatar.value = false }
}
async function handleSave() {
  if (!isLoggedIn.value || !loaded.value || loadError.value || saving.value || choosingAvatar.value) return
  if (!form.value.nickname.trim()) { saveError.value = tr('请输入昵称', 'Enter a nickname'); return }
  saving.value = true
  saveError.value = ''
  try {
    const updated = await updateProfile({ nickname: form.value.nickname.trim(), avatar: form.value.avatar || undefined })
    if (userStore.userInfo) {
      userStore.userInfo.nickname = updated.nickname
      userStore.userInfo.avatar = updated.avatar || undefined
      uni.setStorageSync('userInfo', JSON.stringify(userStore.userInfo))
    }
    uni.showToast({ title: tr('保存成功', 'Saved'), icon: 'success' })
    goBackAfterSave()
  } catch (error: any) {
    saveError.value = error?.message || tr('资料保存失败，修改内容已保留，请重试', 'Could not save the profile. Your changes are kept; please retry.')
    if (!uni.getStorageSync('token')) userStore.logout()
  } finally { saving.value = false }
}
function goLogin() { uni.switchTab({ url: '/pages/profile/index' }) }
function goBackAfterSave() { if (getCurrentPages().length > 1) uni.navigateBack(); else goLogin() }
function goBack() { if (!saving.value) goBackAfterSave() }
onShow(() => {
  // Returning from the image picker must not overwrite unsaved edits.
  if (!loaded.value || loadedFor.value !== (userStore.userInfo?.id || '') || !uni.getStorageSync('token')) loadProfile()
})
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); }
.nav-bar { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 32rpx; }
.back-spacer { width: 80rpx; height: 80rpx; flex-shrink: 0; }
.nav-title { font-size: 36rpx; }
.content { padding: 0 32rpx; }
button::after { border: none; }
.avatar-editor { display: flex; flex-direction: column; align-items: center; gap: 20rpx; margin: 0; padding: 28rpx 0 40rpx; background: transparent; line-height: 1.6; }
.avatar-wrap { position: relative; }
.avatar-preview { width: 160rpx; height: 160rpx; background: var(--c-card-2); border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.avatar-image { width: 160rpx; height: 160rpx; }
.avatar-letter { font-size: 64rpx; color: var(--c-primary); }
.camera-badge { position: absolute; right: 0; bottom: 0; width: 48rpx; height: 48rpx; background: var(--c-primary); border: 4rpx solid var(--c-cream); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.avatar-action { color: var(--c-brown); font-size: 26rpx; }
.profile-card { background: var(--c-card); border-radius: var(--radius-card); padding: 12rpx 36rpx 28rpx; margin-bottom: 24rpx; box-shadow: var(--shadow-card); }
.form-row { display: flex; align-items: center; gap: 24rpx; min-height: 100rpx; border-bottom: 1rpx solid var(--line-soft); }
.row-label { font-size: 28rpx; flex-shrink: 0; }
.row-input { min-width: 0; flex: 1; text-align: right; font-size: 28rpx; color: var(--c-ink); height: 88rpx; }
.phone-value { display: flex; justify-content: flex-end; gap: 10rpx; flex: 1; align-items: center; font-size: 28rpx; color: var(--c-muted); }
.field-note { display: block; margin-top: 20rpx; font-size: 24rpx; line-height: 1.7; color: var(--c-muted); }
.card-heading { display: flex; align-items: center; gap: 16rpx; font-size: 30rpx; font-weight: 600; padding-top: 20rpx; }
.privacy-notice { display: flex; align-items: flex-start; gap: 16rpx; padding: 24rpx; border-radius: var(--radius-button); background: var(--c-card-2); color: var(--c-primary); font-size: 24rpx; line-height: 1.7; }
.save-button { background: var(--c-primary); color: var(--c-rice); margin: 36rpx 0 0; width: 100%; min-height: 92rpx; border-radius: var(--radius-button); font-size: 30rpx; line-height: 1.6; padding: 22rpx 32rpx; }
.feedback { display: block; margin-top: 24rpx; padding: 20rpx; background: var(--c-card-2); color: var(--c-primary); border-left: 4rpx solid var(--c-apricot); font-size: 26rpx; line-height: 1.7; }
button[disabled] { opacity: .6; }
</style>
