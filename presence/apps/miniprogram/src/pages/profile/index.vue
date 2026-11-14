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
        </template>
        <!-- 访客态：仅头像+提示行，点按弹出屏幕居中的登录弹窗（对齐时叙 center 登录层/轻疗独立登录页） -->
        <button v-else class="user-row" @tap="openSignIn">
          <view class="avatar"><PresenceIcon name="user" :size="52" :color="iconColors.primary" /></view>
          <view class="user-copy"><text class="user-name serif">{{ tr('未登录', 'Not signed in') }}</text><text class="secondary">{{ tr('点击登录，同步预约、会员与积分', 'Tap to sign in and sync bookings, membership and points') }}</text></view>
          <view class="edit-link"><text>{{ tr('登录', 'Sign in') }}</text><PresenceIcon name="arrow" :size="26" /></view>
        </button>
      </view>
      <!-- 品牌会员入口：未登录也保留入口，点击先登录 -->
      <button class="brand-entry" :class="{ active: brandActive }" @tap="goBrandMember">
        <view class="brand-entry-head">
          <text class="brand-entry-eyebrow latin">FULL YU ANNUAL</text>
          <text class="brand-entry-state">{{ brandActive ? tr(`还有 ${brandRemaining} 天`, `${brandRemaining} days left`) : tr('三店通用', 'All three stores') }}</text>
        </view>
        <text class="brand-entry-title serif">{{ tr('Full愈年卡', 'Full Yu Annual') }}</text>
        <text class="brand-entry-sub">{{ brandActive ? tr(`积分 ${brandPoints} · 骰子 ${brandDice}`, `${brandPoints} points · ${brandDice} dice`) : (isLoggedIn ? (brandMember ? tr('¥299 / 年 · 月卡 ¥45', '¥299 / year · ¥45 / month') : tr('品牌通用会员 · 三店权益', 'Brand-wide membership · three stores')) : tr('¥299 / 年 · 月卡 ¥45 · 登录后查看积分与有效期', '¥299 / year · ¥45 / month · sign in for points')) }}</text>
        <view class="brand-entry-foot">
          <text>{{ brandActive ? tr('进入品牌会员中心', 'Open brand membership') : (isLoggedIn ? tr('开通品牌年卡', 'Join Full Yu Annual') : tr('了解品牌会员', 'See brand membership')) }}</text>
          <PresenceIcon name="arrow" :size="22" :color="brandActive ? '#eec76f' : iconColors.primary" />
        </view>
      </button>
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
          <template v-else><text v-if="item.page === 'brand-member'" class="menu-extra">{{ brandActive ? tr(`${brandPoints} 积分`, `${brandPoints} pts`) : tr('三店通用', 'All stores') }}</text><PresenceIcon name="arrow" :size="26" /></template>
        </button>
      </view>
      <view v-if="isLoggedIn && isTrainer" class="menu-group">
        <button class="menu-item" @tap="toggleView"><PresenceIcon name="user" :size="38" /><text class="menu-text">{{ tr('当前视角', 'Current view') }}</text><text class="menu-extra">{{ activeView === 'trainer' ? tr('导师视角', 'Trainer view') : tr('课程视角', 'Student view') }}</text><PresenceIcon name="arrow" :size="26" /></button>
        <button class="menu-item" @tap="goCommunityMine"><PresenceIcon name="users" :size="38" /><text class="menu-text">{{ tr('经营我的社群', 'Manage my community') }}</text><PresenceIcon name="arrow" :size="26" /></button>
        <button class="menu-item" @tap="goTrainerWorkspace"><PresenceIcon name="chart" :size="38" /><text class="menu-text">{{ t('profile.trainerWorkspace') }}</text><text class="role-label">{{ tr('导师', 'Trainer') }}</text><PresenceIcon name="arrow" :size="26" /></button>
        <!-- 导师门户是独立账号体系（教务发的手机号 + 密码），入口单独放，避免和学员登录混淆 -->
        <button class="menu-item" @tap="goTrainerPortal"><PresenceIcon name="calendar" :size="38" /><text class="menu-text">{{ tr('导师门户', 'Trainer portal') }}</text><text class="menu-extra">{{ portalSignedIn ? tr('已登录', 'Signed in') : tr('排课与名单', 'Schedule & roster') }}</text><PresenceIcon name="arrow" :size="26" /></button>
      </view>
      <!-- 还没成为导师的人也要找得到入口：申请入驻是公开表单，不需要先登录 -->
      <view v-if="!isTrainer" class="menu-group">
        <button class="menu-item" @tap="goTrainerApply"><PresenceIcon name="calendar" :size="38" /><text class="menu-text">{{ tr('成为导师', 'Become a trainer') }}</text><text class="menu-extra">{{ tr('入驻申请', 'Apply') }}</text><PresenceIcon name="arrow" :size="26" /></button>
        <button class="menu-item" @tap="goTrainerPortal"><PresenceIcon name="lock" :size="38" /><text class="menu-text">{{ tr('导师门户登录', 'Trainer portal sign-in') }}</text><text class="menu-extra">{{ tr('排课与名单', 'Schedule & roster') }}</text><PresenceIcon name="arrow" :size="26" /></button>
      </view>
      <view class="menu-group">
        <button class="menu-item" @tap="toggleLang"><PresenceIcon name="edit" :size="38" /><text class="menu-text">{{ t('profile.language') }}</text><text class="menu-extra">{{ language === 'zh' ? '中文' : 'English' }}</text><PresenceIcon name="arrow" :size="26" /></button>
        <button class="menu-item" @tap="contactService"><PresenceIcon name="phone" :size="38" /><text class="menu-text">{{ t('profile.contactService') }}</text><text class="menu-extra">09:00–21:00</text><PresenceIcon name="arrow" :size="26" /></button>
        <button class="menu-item" @tap="openLegal('terms')"><PresenceIcon name="info" :size="38" /><text class="menu-text">{{ tr('用户协议与隐私政策', 'Terms & privacy') }}</text><PresenceIcon name="arrow" :size="26" /></button>
        <button class="menu-item" @tap="showAbout"><PresenceIcon name="info" :size="38" /><text class="menu-text">{{ tr('关于在场 Presence', 'About Presence') }}</text><PresenceIcon name="arrow" :size="26" /></button>
      </view>
      <!-- 退出登录：弱化小字，仅登录态显示；对齐轻疗的底部退出入口 -->
      <view v-if="isLoggedIn" class="logout-foot" @tap="confirmLogout">{{ tr('退出登录', 'Sign out') }}</view>
    </view>
    <BottomSheet :show="!!sheet" :title="sheetTitle" :busy="loggingIn" :center="sheet === 'signin'" @close="closeSheet">
      <!-- 登录弹窗（已批准提案）：居中品牌眉题 + 欢迎标题 + 一句说明 + 整宽一键登录 + 两行协议区，未勾选时行内提示 -->
      <template v-if="sheet === 'signin'">
        <view class="signin-hero">
          <text class="signin-eyebrow">Full愈 · 在场</text>
          <text class="signin-title serif">{{ tr('欢迎来到在场', 'Welcome to Presence') }}</text>
          <text class="signin-lead">{{ tr('登录后，查看预约与会员权益', 'Sign in to view bookings and member benefits') }}</text>
        </view>
        <view class="signin-agreement">
          <view class="agreement-checkline" @tap="toggleAgreement">
            <view class="agreement-check" :class="{ checked: agreed, alert: consentHint }" :aria-label="tr('同意用户协议与隐私政策', 'Agree to terms and privacy policy')"><text v-if="agreed" class="check-mark">✓</text></view>
            <text class="agreement-text">{{ tr('我已阅读并同意', 'I have read and agree to') }}</text>
          </view>
          <view class="agreement-docs">
            <text class="agreement-link" @tap.stop="openLegal('terms')">{{ tr('《用户协议》', 'Terms of Service') }}</text>
            <text class="agreement-text">{{ tr('与', '&') }}</text>
            <text class="agreement-link" @tap.stop="openLegal('privacy')">{{ tr('《隐私政策》', 'Privacy Policy') }}</text>
          </view>
        </view>
        <text v-if="consentHint" class="consent-hint" role="alert">{{ tr('请先勾选同意协议', 'Please agree to the terms first') }}</text>
        <text v-if="loginError" class="feedback" role="alert">{{ loginError }}</text>
      </template>
      <template v-else-if="sheet === 'login'">
        <text class="sheet-label">{{ tr('手机号', 'Phone number') }}</text>
        <input v-model="loginPhone" class="phone-input" type="number" maxlength="11" :placeholder="tr('请输入手机号', 'Enter your phone number')" :disabled="loggingIn" />
        <text class="secondary">{{ tr('H5 快捷登录仅在服务端开启时可用。', 'H5 quick login is only available when enabled on the server.') }}</text>
        <text v-if="loginError" class="feedback" role="alert">{{ loginError }}</text>
      </template>
      <view v-else-if="sheet === 'contact'" class="sheet-copy"><text>{{ tr('客服热线：', 'Support hotline: ') }}{{ SERVICE_PHONE }}</text><text class="secondary">{{ tr('服务时间：09:00–21:00', 'Service hours: 09:00–21:00') }}</text></view>
      <view v-else class="sheet-copy"><text class="serif about-brand">{{ tr('Full愈 · 在场', 'Full愈 · Presence') }}</text><text>{{ tr('身心在场 · 向内生长', 'Be present · grow inward') }}</text><text class="secondary">{{ tr('正念冥想、声音疗愈与身心整合课程', 'Mindfulness, sound healing and integrative mind-body classes') }}</text></view>
      <template #actions>
        <view v-if="sheet === 'signin'" class="signin-actions">
          <!-- #ifndef H5 -->
          <!-- 未勾选时按钮不带授权 open-type，点按给行内红字提示；勾选后同一次手势完成授权登录 -->
          <button class="primary-button sheet-button signin-button" :open-type="agreed ? 'getPhoneNumber' : ''" :loading="loggingIn" :disabled="loggingIn" @tap="onTapLogin" @getphonenumber="onGetPhone">{{ loggingIn ? tr('正在登录…', 'Signing in…') : tr('手机号一键登录', 'Continue with phone number') }}</button>
          <!-- #endif -->
          <!-- #ifdef H5 -->
          <button class="primary-button sheet-button signin-button" :disabled="loggingIn" @tap="onTapDevLogin">{{ loggingIn ? tr('正在登录…', 'Signing in…') : tr('手机号一键登录', 'Continue with phone number') }}</button>
          <!-- #endif -->
        </view>
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
import { getTrainerToken } from '@/utils/trainer-request'
import { getPoints } from '@/api/user'
import { loadBrandMember, claimGiftCode, peekPendingGift, takePendingGift, type BrandMemberData } from '@/api/brandMember'
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
const brandMember = ref<BrandMemberData | null>(null)
/** 扫码带会员码时只自动弹一次登录层，避免顾客关闭后反复打断。 */
let giftLoginPrompted = false
const loading = ref(false)
const loadError = ref(false)
const loggingIn = ref(false)
const loginPhone = ref('')
const loginError = ref('')
// 门户令牌与学员登录分开存；onShow 里刷新，退出门户后入口文案会恢复
const portalSignedIn = ref(false)
const sheet = ref<'' | 'signin' | 'login' | 'contact' | 'about'>('')
const sheetTitle = computed(() => sheet.value === 'signin' ? tr('会员登录', 'Member sign-in') : sheet.value === 'login' ? tr('手机号登录', 'Phone login') : sheet.value === 'contact' ? tr('联系客服', 'Contact support') : tr('关于在场', 'About Presence'))
/** 登录前协议同意：不默认勾选（合规要求）；未勾选时点登录在协议区下方给行内提示 */
const agreed = ref(false)
const consentHint = ref(false)
const avatarText = computed(() => userInfo.value?.nickname?.charAt(0) || (isEnglish() ? 'F' : '愈'))
const maskedPhone = computed(() => { const p = userInfo.value?.phone || ''; return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p })
const brandActive = computed(() => ['ACTIVE', 'EXPIRING', 'PENDING'].includes(brandMember.value?.card?.state || ''))
const brandRemaining = computed(() => brandMember.value?.card?.remainingDays || 0)
const brandPoints = computed(() => brandMember.value?.points?.balance || 0)
const brandDice = computed(() => brandMember.value?.dice?.balance || 0)
const accountMenu = computed(() => [
  { page: 'my-courses', icon: 'calendar', label: tr('我的预约', 'My bookings'), tab: true },
  { page: 'assets', icon: 'leaf', label: t('profile.myAssets'), tab: false },
  { page: 'voucher-redeem', icon: 'ticket', label: tr('兑换代金券', 'Redeem voucher'), tab: false },
  { page: 'my-reviews', icon: 'star', label: t('profile.myReviews'), tab: false },
  { page: 'community-mine', icon: 'users', label: tr('我的社群', 'My communities'), tab: false },
  { page: 'brand-member', icon: 'card', label: tr('Full愈年卡', 'Full Yu Annual'), tab: false },
])

async function loadBrandData() {
  if (!isLoggedIn.value) { brandMember.value = null; return }
  try {
    brandMember.value = await loadBrandMember()
  } catch {
    brandMember.value = null
  }
}

async function loadUserData() {
  if (!uni.getStorageSync('token')) userStore.logout()
  if (!isLoggedIn.value) {
    points.value = 0; completedCount.value = 0; upcomingCount.value = 0; voucherCount.value = 0; brandMember.value = null
    return
  }
  void loadBrandData()
  if (loading.value) return
  loading.value = true
  loadError.value = false
  try {
    const [pts, orders, vouchers] = await Promise.all([getPoints(), listMyOrders(), listMyVouchers()])
    if (!uni.getStorageSync('token')) { userStore.logout(); return }
    points.value = pts.balance
    const courseOrders = (orders || []).filter(o => o.orderType === 'COURSE')
    completedCount.value = courseOrders.filter(o => o.status === 'COMPLETED').length
    upcomingCount.value = courseOrders.filter(o => o.status === 'PAID').length
    voucherCount.value = (vouchers || []).filter(v => v.status === 'UNUSED' && new Date(v.expiresAt).getTime() > Date.now()).length
  } catch {
    loadError.value = true
    if (!uni.getStorageSync('token')) userStore.logout()
  } finally { loading.value = false }
}
/** 访客态点按头像行：弹出屏幕居中的登录弹窗 */
function openSignIn() {
  if (loggingIn.value) return
  loginError.value = ''
  consentHint.value = false
  sheet.value = 'signin'
}
/** 未勾选协议时点登录：协议区下方行内红字提示 + 勾选框红圈，不再弹第二层确认 */
function onTapLogin() {
  if (loggingIn.value) return
  if (agreed.value) { consentHint.value = false; return }
  consentHint.value = true
}
async function onGetPhone(e: any) {
  if (loggingIn.value) return
  const code = e?.detail?.code
  if (!code) { uni.showToast({ title: tr('已取消登录', 'Login cancelled'), icon: 'none' }); return }
  loggingIn.value = true
  try {
    await userStore.login(code)
    agreed.value = false
    consentHint.value = false
    sheet.value = ''
    uni.showToast({ title: tr('登录成功', 'Logged in'), icon: 'success' })
    await loadUserData()
    resumePendingShare()
    void resumePendingGift()
  } catch { uni.showToast({ title: tr('登录未完成，请重试', 'Login was not completed. Please retry.'), icon: 'none' }) }
  finally { loggingIn.value = false }
}
// #ifdef H5
function onTapDevLogin() {
  loginError.value = ''
  if (!agreed.value) { consentHint.value = true; return }
  consentHint.value = false
  onDevLogin()
}
function onDevLogin() { loginError.value = ''; sheet.value = 'login' }
async function submitDevLogin() {
  if (loggingIn.value) return
  const phone = loginPhone.value.trim()
  if (!/^1\d{10}$/.test(phone)) { loginError.value = tr('请输入正确的11位手机号', 'Enter a valid 11-digit phone number'); return }
  loggingIn.value = true
  loginError.value = ''
  try {
    await userStore.devLogin(phone)
    agreed.value = false
    consentHint.value = false
    sheet.value = ''; loginPhone.value = ''
    uni.showToast({ title: tr('登录成功', 'Logged in'), icon: 'success' })
    await loadUserData()
    resumePendingShare()
    void resumePendingGift()
  } catch { loginError.value = tr('登录未完成，请确认当前环境支持手机号快捷登录后重试', 'Login was not completed. Confirm this environment supports phone login and retry.') }
  finally { loggingIn.value = false }
}
// #endif
function requireLogin() {
  if (isLoggedIn.value) return true
  // 未登录点任何需要登录的入口：直接弹出居中登录弹窗，不再只丢一句 toast
  openSignIn()
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
/** 扫会员码小程序码但未登录：登录成功后自动领取，并回到品牌会员页。 */
async function resumePendingGift() {
  const code = takePendingGift()
  if (!code) return
  try {
    const res = await claimGiftCode(code)
    uni.showToast({
      title: res?.replayed
        ? tr('这个会员码已兑换过', 'Already redeemed')
        : res?.days
          ? tr(`已领取 ${res.days} 天会员`, `${res.days} days added`)
          : tr('会员码已领取', 'Membership added'),
      icon: 'none'
    })
    setTimeout(() => {
      uni.navigateTo({ url: '/pages/brand-member/index' })
    }, 600)
  } catch (err: any) {
    uni.showToast({ title: err?.message || tr('会员码领取失败，请稍后重试', 'Could not redeem. Please retry.'), icon: 'none' })
  }
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
function goBrandMember() { if (requireLogin()) uni.navigateTo({ url: '/pages/brand-member/index' }) }
function goCommunityMine() { openAccountPage('community-mine', false) }
function goTrainerWorkspace() { if (isTrainer.value) openAccountPage('trainer-workspace', false) }
// 无门户令牌时由门户首页统一跳登录页，这里不做前置判断
function goTrainerPortal() { uni.navigateTo({ url: '/pages/trainer-portal/home/index' }) }
function goTrainerApply() { uni.navigateTo({ url: '/pages/trainer-portal/apply/index' }) }
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
function toggleAgreement() {
  agreed.value = !agreed.value
  // 勾选即消除「请先勾选同意协议」提示，提示只在未勾选点登录时出现
  if (agreed.value) consentHint.value = false
}
function openLegal(tab: 'terms' | 'privacy') {
  uni.navigateTo({ url: `/pages/legal/index?tab=${tab}` })
}
/** 退出登录：确认后清除本地身份（对齐轻疗的底部弱化退出入口） */
function confirmLogout() {
  uni.showModal({
    title: tr('退出登录', 'Sign out'),
    content: tr('确定要退出当前账号吗？', 'Sign out of this account?'),
    confirmText: tr('确定', 'Confirm'),
    cancelText: tr('再想想', 'Not now'),
    success: (res) => {
      if (res.confirm) {
        userStore.logout()
        points.value = 0; completedCount.value = 0; upcomingCount.value = 0; voucherCount.value = 0; brandMember.value = null
        agreed.value = false; consentHint.value = false
        uni.showToast({ title: tr('已退出登录', 'Signed out'), icon: 'none' })
      }
    }
  })
}
onShow(() => {
  loadUserData()
  portalSignedIn.value = !!getTrainerToken()
  if (!isLoggedIn.value && !giftLoginPrompted && peekPendingGift()) {
    giftLoginPrompted = true
    uni.showToast({ title: tr('登录后自动领取会员码', 'Sign in to receive your member code'), icon: 'none' })
    setTimeout(() => openSignIn(), 400)
  }
})
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
.user-row { display: flex; align-items: center; gap: 24rpx; }
.user-row { padding: 0; margin: 0; text-align: left; background: transparent; line-height: 1.6; color: var(--c-ink); }
.avatar { width: 124rpx; height: 124rpx; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--c-card-2); color: var(--c-primary); font-size: 48rpx; overflow: hidden; }
.avatar-image { width: 124rpx; height: 124rpx; }
.user-copy { flex: 1; min-width: 0; }
.user-name { display: block; font-size: 36rpx; line-height: 1.5; overflow-wrap: anywhere; }
.secondary { display: block; color: var(--c-muted); font-size: 24rpx; line-height: 1.7; margin-top: 8rpx; }
.edit-link { display: flex; gap: 4rpx; align-items: center; color: var(--c-brown); font-size: 24rpx; flex-shrink: 0; }
/* 品牌会员入口：三店通用会员卡 */
.brand-entry { display: block; width: 100%; margin: 0 0 24rpx; padding: 30rpx 32rpx 26rpx; border-radius: var(--radius-card); background: var(--c-card); border: 1rpx solid var(--line-soft); box-shadow: var(--shadow-card); text-align: left; line-height: 1.5; color: var(--c-ink); }
.brand-entry.active { background: linear-gradient(145deg, #4d3a2c 0%, #6b4a35 58%, #7b5a41 100%); border-color: transparent; color: #f7f1e7; box-shadow: 0 16rpx 36rpx rgba(53, 47, 43, .2); }
.brand-entry-head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.brand-entry-eyebrow { font-size: 17rpx; letter-spacing: 3rpx; color: var(--c-brown); }
.brand-entry.active .brand-entry-eyebrow { color: #e8c58d; }
.brand-entry-state { font-size: 19rpx; letter-spacing: 1rpx; color: var(--c-muted); }
.brand-entry.active .brand-entry-state { color: rgba(247, 241, 231, .78); }
.brand-entry-title { display: block; margin-top: 10rpx; font-size: 38rpx; line-height: 1.35; }
.brand-entry-sub { display: block; margin-top: 6rpx; font-size: 21rpx; color: var(--c-muted); }
.brand-entry.active .brand-entry-sub { color: rgba(247, 241, 231, .78); }
.brand-entry-foot { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-top: 18rpx; padding-top: 16rpx; border-top: 1rpx solid var(--line-soft); font-size: 21rpx; color: var(--c-primary); }
.brand-entry.active .brand-entry-foot { border-top-color: rgba(247, 241, 231, .18); color: #e8c58d; }
.primary-button { background: var(--c-primary); color: var(--c-rice); border-radius: var(--radius-button); min-height: 80rpx; padding: 18rpx 28rpx; font-size: 28rpx; line-height: 1.6; }
/* 登录弹窗（已批准提案）：居中欢迎区 → 整宽一键登录 → 两行协议区 → 行内提示 */
.signin-hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 8rpx 0 36rpx; }
.signin-eyebrow { color: var(--c-brown); font-size: 22rpx; letter-spacing: 3rpx; margin-bottom: 16rpx; }
.signin-title { display: block; font-size: 44rpx; line-height: 1.4; color: var(--c-ink); }
.signin-lead { display: block; color: var(--c-muted); font-size: 26rpx; line-height: 1.7; margin-top: 10rpx; }
.signin-actions { display: flex; flex-direction: column; width: 100%; }
.signin-button { font-size: 30rpx; }
.signin-agreement { display: flex; flex-direction: column; align-items: center; margin-top: 24rpx; }
.agreement-checkline { display: flex; align-items: center; justify-content: center; gap: 10rpx; min-height: 44rpx; }
.agreement-check { width: 32rpx; height: 32rpx; flex-shrink: 0; border: 2rpx solid var(--c-muted); border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--c-card); }
.agreement-check.checked { background: var(--c-primary); border-color: var(--c-primary); }
.agreement-check.alert { border-color: var(--c-error); }
.check-mark { color: var(--c-rice); font-size: 22rpx; line-height: 1; }
.agreement-text { color: var(--c-muted); font-size: 24rpx; line-height: 44rpx; }
.agreement-docs { display: flex; align-items: center; justify-content: center; gap: 8rpx; min-height: 44rpx; }
.agreement-link { color: var(--c-brown); text-decoration: underline; font-size: 24rpx; line-height: 44rpx; }
.consent-hint { display: block; text-align: center; color: var(--c-error); font-size: 24rpx; line-height: 1.6; margin-top: 8rpx; }
/* 退出登录：弱化小字，仅登录态显示 */
.logout-foot { text-align: center; color: var(--c-muted); font-size: 24rpx; padding: 24rpx 0 16rpx; }
.logout-foot:active { opacity: .7; }
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
.sheet-button { width: 100%; margin: 0; white-space: nowrap; }
/* 与次按钮等高：主按钮补同宽边框，避免边框盒高差 */
.sheet-button.primary-button { border: 2rpx solid var(--c-primary); }
.secondary-button { background: var(--c-card); color: var(--c-primary); border: 2rpx solid var(--c-primary); border-radius: var(--radius-button); min-height: 80rpx; padding: 18rpx 28rpx; font-size: 28rpx; line-height: 1.6; }
.sheet-copy { font-size: 28rpx; line-height: 1.8; }
.sheet-copy > text { display: block; }
.about-brand { font-size: 40rpx; margin-bottom: 20rpx; }
.feedback { display: block; color: var(--c-primary); background: var(--c-card-2); padding: 20rpx; margin-top: 20rpx; font-size: 26rpx; line-height: 1.7; }
button[disabled] { opacity: .6; }
@media (max-width: 360px) { .user-card { padding: 28rpx; } .avatar, .avatar-image { width: 100rpx; height: 100rpx; } .edit-link { flex-direction: column; } }
</style>
