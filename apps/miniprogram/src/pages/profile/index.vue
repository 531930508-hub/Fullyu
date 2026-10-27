<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="page-heading" :style="{ paddingTop: headerTop + 'px' }"><text class="page-title serif">{{ t('profile.title') }}</text><text class="eyebrow">Profile</text></view>
    <view class="content">
      <view class="user-card">
        <template v-if="isLoggedIn">
          <button class="user-row" @tap="goEditProfile">
            <view class="avatar"><image v-if="userInfo?.avatar" :src="userInfo.avatar" class="avatar-image" mode="aspectFill" /><text v-else class="serif">{{ avatarText }}</text></view>
            <view class="user-copy"><text class="user-name serif">{{ userInfo?.nickname || tr('在场会员', 'Presence Member') }}</text><text class="secondary">{{ maskedPhone }}</text></view>
            <view class="edit-link"><text>{{ tr('编辑资料', 'Edit profile') }}</text><PresenceIcon name="arrow" :size="26" /></view>
          </button>
          <button v-if="!loading && !loadError" class="member-strip" @tap="goPage('member')">
            <PresenceIcon name="card" :size="34" :color="iconColors.gold" />
            <view class="member-copy"><text>{{ activeCard ? memberName : tr('尚未开通会员', 'Membership not active') }}</text><text v-if="memberExpiry" class="member-date">{{ tr('有效期至 ', 'Valid until ') }}{{ memberExpiry }}</text></view>
            <text class="member-action">{{ activeCard ? tr('查看', 'View') : tr('了解会员', 'Learn more') }}</text><PresenceIcon name="arrow" :size="26" :color="iconColors.gold" />
          </button>
        </template>
        <view v-else class="guest-row">
          <view class="avatar"><PresenceIcon name="user" :size="52" :color="iconColors.primary" /></view>
          <view class="user-copy"><text class="user-name serif">{{ tr('登录 Full愈 · 在场', 'Log in to Full愈 · Presence') }}</text><text class="secondary">{{ tr('同步预约、会员与积分', 'Sync bookings, membership and points') }}</text></view>
          <!-- #ifndef H5 -->
          <button class="primary-button login-button" open-type="getPhoneNumber" :loading="loggingIn" :disabled="loggingIn" @getphonenumber="onGetPhone">{{ t('profile.login') }}</button>
          <!-- #endif -->
          <!-- #ifdef H5 -->
          <button class="primary-button login-button" :disabled="loggingIn" @tap="onDevLogin">{{ tr('手机号登录', 'Log in with phone') }}</button>
          <!-- #endif -->
        </view>
      </view>
      <PageState v-if="isLoggedIn && loading" state="loading" :title="tr('正在读取账户信息', 'Loading account')" />
      <PageState v-else-if="isLoggedIn && loadError" state="error" :title="tr('账户信息加载失败', 'Failed to load account')" :message="tr('会员状态与资产暂时无法确认', 'Membership and assets are temporarily unavailable')" :action="tr('重新加载', 'Reload')" @action="loadUserData" />
      <view v-if="isLoggedIn && !loading && !loadError" class="stats-card">
        <button class="stat-item" @tap="goAssets"><text class="stat-value emphasis">{{ points }}</text><text class="stat-label">{{ tr('积分', 'Points') }}</text></button>
        <button class="stat-item" @tap="goPage('my-courses')"><text class="stat-value">{{ upcomingCount }}</text><text class="stat-label">{{ tr('待上课', 'Upcoming') }}</text></button>
        <button class="stat-item" @tap="goPage('my-courses')"><text class="stat-value">{{ completedCount }}</text><text class="stat-label">{{ tr('已完成', 'Completed') }}</text></button>
        <button class="stat-item" @tap="goVouchers"><text class="stat-value">{{ voucherCount }}</text><text class="stat-label">{{ tr('代金券', 'Vouchers') }}</text></button>
      </view>

      <view class="menu-group">
        <button v-for="item in accountMenu" :key="item.page" class="menu-item" @tap="openAccountPage(item.page, item.tab)">
          <PresenceIcon :name="item.icon" :size="38" /><text class="menu-text">{{ item.label }}</text>
          <view v-if="!isLoggedIn" class="menu-meta"><PresenceIcon name="lock" :size="26" :color="iconColors.muted" /><text>{{ tr('登录后可用', 'Log in to use') }}</text></view>
          <template v-else><text v-if="item.page === 'member' && !loading && !loadError" class="menu-extra">{{ activeCard ? memberName : tr('未开通', 'Inactive') }}</text><PresenceIcon name="arrow" :size="26" /></template>
        </button>
      </view>
      <view v-if="isLoggedIn && isTrainer" class="menu-group">
        <button class="menu-item" @tap="toggleView"><PresenceIcon name="user" :size="38" /><text class="menu-text">{{ tr('当前视角', 'Current view') }}</text><text class="menu-extra">{{ activeView === 'trainer' ? tr('导师视角', 'Trainer view') : tr('课程视角', 'Student view') }}</text><PresenceIcon name="arrow" :size="26" /></button>
        <button class="menu-item" @tap="goCommunityMine"><PresenceIcon name="users" :size="38" /><text class="menu-text">{{ tr('经营我的社群', 'Manage my community') }}</text><PresenceIcon name="arrow" :size="26" /></button>
        <button class="menu-item" @tap="goTrainerWorkspace"><PresenceIcon name="chart" :size="38" /><text class="menu-text">{{ t('profile.trainerWorkspace') }}</text><text class="role-label">{{ tr('导师', 'Trainer') }}</text><PresenceIcon name="arrow" :size="26" /></button>
      </view>
      <view class="menu-group">
        <button class="menu-item" @tap="toggleLang"><PresenceIcon name="edit" :size="38" /><text class="menu-text">{{ t('profile.language') }}</text><text class="menu-extra">{{ language === 'zh' ? '中文' : 'English' }}</text><PresenceIcon name="arrow" :size="26" /></button>
        <button class="menu-item" @tap="contactService"><PresenceIcon name="phone" :size="38" /><text class="menu-text">{{ t('profile.contactService') }}</text><text class="menu-extra">09:00–21:00</text><PresenceIcon name="arrow" :size="26" /></button>
        <button class="menu-item" @tap="showAbout"><PresenceIcon name="info" :size="38" /><text class="menu-text">{{ tr('关于在场 Presence', 'About Presence') }}</text><PresenceIcon name="arrow" :size="26" /></button>
      </view>
    </view>
    <BottomSheet :show="!!sheet" :title="sheetTitle" :busy="loggingIn" @close="closeSheet">
      <template v-if="sheet === 'login'">
        <text class="sheet-label">{{ tr('手机号', 'Phone number') }}</text>
        <input v-model="loginPhone" class="phone-input" type="number" maxlength="11" :placeholder="tr('请输入手机号', 'Enter your phone number')" :disabled="loggingIn" />
        <text class="secondary">{{ tr('H5 快捷登录仅在服务端开启时可用。', 'H5 quick login is only available when enabled on the server.') }}</text>
        <text v-if="loginError" class="feedback" role="alert">{{ loginError }}</text>
      </template>
      <view v-else-if="sheet === 'contact'" class="sheet-copy"><text>{{ tr('客服热线：', 'Support hotline: ') }}{{ SERVICE_PHONE }}</text><text class="secondary">{{ tr('服务时间：09:00–21:00', 'Service hours: 09:00–21:00') }}</text></view>
      <view v-else class="sheet-copy"><text class="serif about-brand">{{ tr('Full愈 · 在场', 'Full愈 · Presence') }}</text><text>{{ tr('身心在场 · 向内生长', 'Be present · grow inward') }}</text><text class="secondary">{{ tr('正念冥想、声音疗愈与身心整合课程', 'Mindfulness, sound healing and integrative mind-body classes') }}</text></view>
      <template #actions>
        <!-- #ifdef H5 -->
        <button v-if="sheet === 'login'" class="primary-button sheet-button" :loading="loggingIn" :disabled="loggingIn" @tap="submitDevLogin">{{ loggingIn ? tr('登录中', 'Logging in') : t('profile.login') }}</button>
        <!-- #endif -->
        <button v-if="sheet === 'contact'" class="primary-button sheet-button" @tap="callService">{{ tr('拨打客服', 'Call support') }}</button>
        <button v-if="sheet === 'about'" class="primary-button sheet-button" @tap="closeSheet">{{ tr('知道了', 'Got it') }}</button>
      </template>
    </BottomSheet>
    <FloatingTabBar active="profile" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { t, tr, isEnglish, updateTabBarLanguage } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import { consumeShareJump } from '@/utils/share'
import { getPoints } from '@/api/user'
import { getActiveCard, type MemberCard } from '@/api/member'
import { listMyOrders } from '@/api/order'
import { listMyVouchers } from '@/api/voucher'
import FloatingTabBar from '@/components/FloatingTabBar.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'
import PageState from '@/components/PageState.vue'
import BottomSheet from '@/components/BottomSheet.vue'

// SVG data-URL images require resolved DESIGN token values, not page CSS variables.
const iconColors = { gold: '#eec76f', primary: '#683611', muted: '#756a55' }
const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const userStore = useUserStore()
const { userInfo, isLoggedIn, isTrainer, activeView } = storeToRefs(userStore)
const language = computed(() => userStore.language)
const points = ref(0)
const completedCount = ref(0)
const upcomingCount = ref(0)
const voucherCount = ref(0)
const activeCard = ref<(MemberCard & { endDate?: string }) | null>(null)
const loading = ref(false)
const loadError = ref(false)
const loggingIn = ref(false)
const loginPhone = ref('')
const loginError = ref('')
const sheet = ref<'' | 'login' | 'contact' | 'about'>('')
const sheetTitle = computed(() => sheet.value === 'login' ? tr('手机号登录', 'Phone login') : sheet.value === 'contact' ? tr('联系客服', 'Contact support') : tr('关于在场', 'About Presence'))
const avatarText = computed(() => userInfo.value?.nickname?.charAt(0) || (isEnglish() ? 'F' : '愈'))
const maskedPhone = computed(() => { const p = userInfo.value?.phone || ''; return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p })
const memberName = computed(() => {
  const card = activeCard.value
  if (!card) return ''
  if (card.product?.name) return card.product.name
  return ({ MONTHLY: tr('月卡会员', 'Monthly member'), QUARTERLY: tr('季卡会员', 'Quarterly member'), YEARLY: tr('年卡会员', 'Yearly member') } as Record<string, string>)[card.type || ''] || tr('会员卡', 'Membership card')
})
const memberExpiry = computed(() => {
  const value = activeCard.value?.endDate || activeCard.value?.expiresAt
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  if (isEnglish()) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})
const accountMenu = computed(() => [
  { page: 'my-courses', icon: 'calendar', label: tr('我的预约', 'My bookings'), tab: true },
  { page: 'assets', icon: 'leaf', label: t('profile.myAssets'), tab: false },
  { page: 'my-reviews', icon: 'star', label: t('profile.myReviews'), tab: false },
  { page: 'community-mine', icon: 'users', label: tr('我的社群', 'My communities'), tab: false },
  { page: 'member', icon: 'card', label: t('profile.memberCard'), tab: true },
])

async function loadUserData() {
  if (!uni.getStorageSync('token')) userStore.logout()
  if (!isLoggedIn.value) {
    points.value = 0; activeCard.value = null; completedCount.value = 0; upcomingCount.value = 0; voucherCount.value = 0
    return
  }
  if (loading.value) return
  loading.value = true
  loadError.value = false
  try {
    const [pts, card, orders, vouchers] = await Promise.all([getPoints(), getActiveCard(), listMyOrders(), listMyVouchers()])
    if (!uni.getStorageSync('token')) { userStore.logout(); return }
    points.value = pts.balance
    activeCard.value = card
    const courseOrders = (orders || []).filter(o => o.orderType === 'COURSE')
    completedCount.value = courseOrders.filter(o => o.status === 'COMPLETED').length
    upcomingCount.value = courseOrders.filter(o => o.status === 'PAID').length
    voucherCount.value = (vouchers || []).filter(v => v.status === 'UNUSED' && new Date(v.expiresAt).getTime() > Date.now()).length
  } catch {
    loadError.value = true
    if (!uni.getStorageSync('token')) userStore.logout()
  } finally { loading.value = false }
}
async function onGetPhone(e: any) {
  if (loggingIn.value) return
  const code = e?.detail?.code
  if (!code) { uni.showToast({ title: tr('已取消登录', 'Login cancelled'), icon: 'none' }); return }
  loggingIn.value = true
  try {
    await userStore.login(code)
    uni.showToast({ title: tr('登录成功', 'Logged in'), icon: 'success' })
    await loadUserData()
    resumePendingShare()
  } catch { uni.showToast({ title: tr('登录未完成，请重试', 'Login was not completed. Please retry.'), icon: 'none' }) }
  finally { loggingIn.value = false }
}
// #ifdef H5
function onDevLogin() { loginError.value = ''; sheet.value = 'login' }
async function submitDevLogin() {
  if (loggingIn.value) return
  const phone = loginPhone.value.trim()
  if (!/^1\d{10}$/.test(phone)) { loginError.value = tr('请输入正确的11位手机号', 'Enter a valid 11-digit phone number'); return }
  loggingIn.value = true
  loginError.value = ''
  try {
    await userStore.devLogin(phone)
    sheet.value = ''; loginPhone.value = ''
    uni.showToast({ title: tr('登录成功', 'Logged in'), icon: 'success' })
    await loadUserData()
    resumePendingShare()
  } catch { loginError.value = tr('登录未完成，请确认当前环境支持手机号快捷登录后重试', 'Login was not completed. Confirm this environment supports phone login and retry.') }
  finally { loggingIn.value = false }
}
// #endif
function requireLogin() {
  if (isLoggedIn.value) return true
  uni.showToast({ title: tr('请先通过上方按钮登录', 'Log in with the button above first'), icon: 'none' })
  return false
}
/** 登录前从分享落地页跳走时，登录成功后回到原目标 */
function resumePendingShare() {
  const url = consumeShareJump()
  if (!url) return
  setTimeout(() => {
    uni.navigateTo({ url, fail: () => uni.redirectTo({ url }) })
  }, 320)
}
function openAccountPage(page: string, tab: boolean) {
  if (!requireLogin()) return
  const url = `/pages/${page}/index`
  if (tab) uni.switchTab({ url }); else uni.navigateTo({ url })
}
function goEditProfile() { if (requireLogin()) uni.navigateTo({ url: '/pages/profile-edit/index' }) }
function goAssets() { openAccountPage('assets', false) }
function goVouchers() { if (requireLogin()) uni.navigateTo({ url: '/pages/assets/index?tab=vouchers' }) }
function goPage(page: string) { openAccountPage(page, true) }
function goCommunityMine() { openAccountPage('community-mine', false) }
function goTrainerWorkspace() { if (isTrainer.value) openAccountPage('trainer-workspace', false) }
function toggleView() {
  if (!isTrainer.value || !requireLogin()) return
  const next = activeView.value === 'trainer' ? 'student' : 'trainer'
  userStore.setViewMode(next)
  uni.showToast({ title: next === 'trainer' ? tr('已切到导师视角', 'Switched to trainer view') : tr('已切到课程视角', 'Switched to student view'), icon: 'none' })
  uni.switchTab({ url: '/pages/index/index' })
}
const SERVICE_PHONE = '400-820-8820'
function contactService() { sheet.value = 'contact' }
function callService() { uni.makePhoneCall({ phoneNumber: SERVICE_PHONE }) }
function toggleLang() {
  userStore.switchLanguage()
  updateTabBarLanguage()
  uni.showToast({ title: language.value === 'zh' ? tr('已切换为中文', 'Switched to Chinese') : 'Switched to English', icon: 'none' })
}
function showAbout() { sheet.value = 'about' }
function closeSheet() { if (!loggingIn.value) sheet.value = '' }
onShow(() => { loadUserData() })
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(200rpx + env(safe-area-inset-bottom)); }
.page-heading { padding: 32rpx 32rpx 24rpx; }
.page-title { display: block; font-size: 48rpx; }
.eyebrow { color: var(--c-muted); font-size: 22rpx; letter-spacing: 1rpx; }
.content { padding: 0 32rpx; }
.user-card, .stats-card, .menu-group { background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); margin-bottom: 24rpx; }
.user-card { padding: 36rpx; }
button::after { border: none; }
.user-row, .guest-row { display: flex; align-items: center; gap: 24rpx; }
.user-row { padding: 0; margin: 0; text-align: left; background: transparent; line-height: 1.6; color: var(--c-ink); }
.avatar { width: 124rpx; height: 124rpx; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--c-card-2); color: var(--c-primary); font-size: 48rpx; overflow: hidden; }
.avatar-image { width: 124rpx; height: 124rpx; }
.user-copy { flex: 1; min-width: 0; }
.user-name { display: block; font-size: 36rpx; line-height: 1.5; overflow-wrap: anywhere; }
.secondary { display: block; color: var(--c-muted); font-size: 24rpx; line-height: 1.7; margin-top: 8rpx; }
.edit-link { display: flex; gap: 4rpx; align-items: center; color: var(--c-brown); font-size: 24rpx; flex-shrink: 0; }
.member-strip { display: flex; gap: 16rpx; align-items: center; margin: 24rpx 0 0; padding: 24rpx; border-radius: var(--radius-button); background: var(--c-primary); color: var(--c-rice); text-align: left; font-size: 26rpx; line-height: 1.5; }
.member-copy { flex: 1; }
.member-date { display: block; font-size: 24rpx; margin-top: 4rpx; }
.member-action { font-size: 24rpx; color: var(--c-gold); }
.primary-button { background: var(--c-primary); color: var(--c-rice); border-radius: var(--radius-button); min-height: 80rpx; padding: 18rpx 28rpx; font-size: 28rpx; line-height: 1.6; }
.login-button { flex-shrink: 0; font-size: 24rpx; margin: 0; }
.guest-row { flex-wrap: wrap; }
.guest-row .user-copy { min-width: 180rpx; }
.stats-card { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 32rpx 0; }
.stat-item { background: transparent; margin: 0; padding: 0 8rpx; line-height: 1.5; border-radius: 0; color: var(--c-ink); }
.stat-item + .stat-item { border-left: 1rpx solid var(--line-soft); }
.stat-value { display: block; font-size: 38rpx; font-weight: 600; overflow-wrap: anywhere; }
.stat-value.emphasis { color: var(--c-brown); }
.stat-label { display: block; font-size: 24rpx; margin-top: 6rpx; color: var(--c-muted); }
.menu-group { padding: 0 36rpx; }
.menu-item { display: flex; align-items: center; gap: 20rpx; min-height: 104rpx; padding: 24rpx 0; margin: 0; border-radius: 0; background: transparent; border-bottom: 1rpx solid var(--line-soft); text-align: left; line-height: 1.6; color: var(--c-ink); }
.menu-item:last-child { border-bottom: none; }
.menu-text { flex: 1; font-size: 28rpx; }
.menu-extra, .menu-meta { font-size: 24rpx; color: var(--c-muted); }
.menu-meta { display: flex; align-items: center; gap: 8rpx; }
.role-label { font-size: 24rpx; padding: 4rpx 16rpx; background: var(--c-card-2); border-radius: 12rpx; color: var(--c-primary); }
.sheet-label { display: block; font-size: 28rpx; margin-bottom: 16rpx; }
.phone-input { height: 88rpx; box-sizing: border-box; border: 2rpx solid var(--line-soft); border-radius: var(--radius-button); padding: 0 24rpx; font-size: 28rpx; color: var(--c-ink); }
.sheet-button { width: 100%; margin: 0; }
.sheet-copy { font-size: 28rpx; line-height: 1.8; }
.sheet-copy > text { display: block; }
.about-brand { font-size: 40rpx; margin-bottom: 20rpx; }
.feedback { display: block; color: var(--c-primary); background: var(--c-card-2); padding: 20rpx; margin-top: 20rpx; font-size: 26rpx; line-height: 1.7; }
button[disabled] { opacity: .6; }
@media (max-width: 360px) { .user-card { padding: 28rpx; } .avatar, .avatar-image { width: 100rpx; height: 100rpx; } .edit-link { flex-direction: column; } }
</style>
