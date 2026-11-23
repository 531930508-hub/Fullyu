<template>
  <view class="page login-page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="login-body">
      <view class="login-hero">
        <text class="login-eyebrow latin">FULL YU · PRESENCE</text>
        <text class="login-title serif">{{ tr('欢迎来到在场', 'Welcome to Presence') }}</text>
        <text class="login-lead">{{ tr('登录后，预约、会员卡与积分都在这里', 'Sign in to keep bookings, your member card and points in one place') }}</text>
      </view>

      <view class="login-benefits">
        <view v-for="item in benefits" :key="item.icon" class="benefit">
          <PresenceIcon :name="item.icon" :size="36" :color="iconColors.primary" />
          <text class="benefit-text">{{ item.label }}</text>
        </view>
      </view>

      <view class="login-actions">
        <!-- 授权按钮始终是静态 open-type 节点：未勾选协议时由 usePhoneLogin 先弹确认框（不会被本页布局遮住），
             点「同意并登录」即记为已同意并直接继续登录，避免旧版「点了没反应」 -->
        <!-- #ifndef H5 -->
        <button class="login-button" open-type="getPhoneNumber" :loading="loggingIn" :disabled="loggingIn" @getphonenumber="onPhoneAuth">
          {{ loggingIn ? tr('正在登录…', 'Signing in…') : tr('手机号一键登录', 'Continue with phone number') }}
        </button>
        <!-- #endif -->
        <!-- #ifdef H5 -->
        <input v-model="loginPhone" class="phone-input" type="number" maxlength="11" :placeholder="tr('请输入手机号', 'Enter your phone number')" :disabled="loggingIn" />
        <button class="login-button" :loading="loggingIn" :disabled="loggingIn" @tap="onPhoneSubmit">
          {{ loggingIn ? tr('正在登录…', 'Signing in…') : tr('手机号一键登录', 'Continue with phone number') }}
        </button>
        <text class="login-hint">{{ tr('H5 快捷登录仅在服务端开启时可用。', 'H5 quick login is only available when enabled on the server.') }}</text>
        <!-- #endif -->

        <text v-if="loginError" class="login-error" role="alert">{{ loginError }}</text>

        <view class="login-agreement">
          <view class="agreement-checkline" @tap="toggleAgreement">
            <view class="agreement-check" :class="{ checked: agreed }" :aria-label="tr('同意用户协议与隐私政策', 'Agree to terms and privacy policy')"><text v-if="agreed" class="check-mark">✓</text></view>
            <text class="agreement-text">{{ tr('我已阅读并同意', 'I have read and agree to') }}</text>
          </view>
          <view class="agreement-docs">
            <text class="agreement-link" @tap.stop="openLegal('terms')">{{ tr('《用户协议》', 'Terms of Service') }}</text>
            <text class="agreement-text">{{ tr('与', '&') }}</text>
            <text class="agreement-link" @tap.stop="openLegal('privacy')">{{ tr('《隐私政策》', 'Privacy Policy') }}</text>
          </view>
        </view>

        <button class="login-skip" @tap="browseAsGuest">{{ tr('先逛逛', 'Browse first') }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { tr } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import { consumeShareJump } from '@/utils/share'
import { usePhoneLogin } from '@/composables/usePhoneLogin'
import PresenceIcon from '@/components/PresenceIcon.vue'

// SVG data-URL 图标需要解析后的设计令牌色值，不能引用页面 CSS 变量
const iconColors = { primary: '#683611', muted: '#756a55' }
const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight

const { agreed, loggingIn, loginError, loginPhone, toggleAgreement, handlePhoneAuth, handleDevLogin } = usePhoneLogin()

const benefits = computed(() => [
  { icon: 'calendar', label: tr('查看预约与到店提醒', 'See bookings and class reminders') },
  { icon: 'card', label: tr('会员卡三店通用', 'One member card across three stores') },
  { icon: 'leaf', label: tr('积分与代金券自动累计', 'Points and vouchers add up automatically') },
])

/**
 * 冷启动未登录时由 App.vue 引导到这里，原入口页面通过 redirect 带过来；
 * 只接受站内 pages 路径，避免这个参数被用来跳到外部地址。
 */
const redirect = ref('')
onLoad((query: any) => {
  const raw = query && typeof query.redirect === 'string' ? query.redirect : ''
  let target = raw
  try { target = decodeURIComponent(raw) } catch { target = '' }
  redirect.value = target.indexOf('/pages/') === 0 ? target : ''
})

/** 登录成功后回到原处：先还分享落地，再回来源页，最后才回首页 */
function afterLogin() {
  const shareJump = consumeShareJump()
  if (shareJump) {
    setTimeout(() => { uni.navigateTo({ url: shareJump, fail: () => uni.redirectTo({ url: shareJump }) }) }, 320)
    return
  }
  const stack = typeof getCurrentPages === 'function' ? (getCurrentPages() || []) : []
  if (stack.length > 1) { uni.navigateBack({}); return }
  if (redirect.value) { uni.reLaunch({ url: redirect.value }); return }
  uni.switchTab({ url: '/pages/index/index' })
}

async function onPhoneAuth(e: any) {
  if (await handlePhoneAuth(e)) afterLogin()
}
// #ifdef H5
async function onPhoneSubmit() {
  if (await handleDevLogin()) afterLogin()
}
// #endif

/** 先逛逛：不登录也让他看到首页，站内需要登录的入口会在「我的」里再引导 */
function browseAsGuest() {
  if (redirect.value) { uni.reLaunch({ url: redirect.value }); return }
  uni.switchTab({ url: '/pages/index/index' })
}

function openLegal(tab: 'terms' | 'privacy') {
  uni.navigateTo({ url: `/pages/legal/index?tab=${tab}` })
}
</script>

<style scoped>
.login-page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(60rpx + env(safe-area-inset-bottom)); }
.login-body { padding: 0 48rpx; }
.login-hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 96rpx 0 56rpx; }
.login-eyebrow { color: var(--c-brown); font-size: 22rpx; letter-spacing: 3rpx; margin-bottom: 24rpx; }
.login-title { display: block; font-size: 52rpx; line-height: 1.4; }
.login-lead { display: block; color: var(--c-muted); font-size: 26rpx; line-height: 1.8; margin-top: 16rpx; max-width: 480rpx; }
.login-benefits { background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 12rpx 32rpx; margin-bottom: 48rpx; }
.benefit { display: flex; align-items: center; gap: 20rpx; padding: 24rpx 0; border-bottom: 1rpx solid var(--line-soft); }
.benefit:last-child { border-bottom: none; }
.benefit-text { font-size: 26rpx; color: var(--c-ink); line-height: 1.6; }
.login-actions { display: flex; flex-direction: column; align-items: stretch; }
button::after { border: none; }
.login-button { width: 100%; height: 96rpx; border: 2rpx solid var(--c-primary); border-radius: var(--radius-button); background: var(--c-primary); color: var(--c-rice); font-size: 30rpx; font-weight: 500; line-height: 92rpx; }
.login-button:active { opacity: .86; }
button[disabled] { opacity: .6; }
.phone-input { width: 100%; height: 96rpx; box-sizing: border-box; border: 2rpx solid var(--line-soft); border-radius: var(--radius-button); background: var(--c-card); padding: 0 24rpx; font-size: 28rpx; color: var(--c-ink); margin-bottom: 24rpx; }
.login-hint { display: block; color: var(--c-muted); font-size: 22rpx; line-height: 1.7; margin-top: 16rpx; }
.login-error { display: block; color: var(--c-error); background: #fbf1df; border-radius: 16rpx; padding: 20rpx; margin-top: 20rpx; font-size: 24rpx; line-height: 1.7; }
.login-agreement { display: flex; flex-direction: column; align-items: center; margin-top: 32rpx; }
.agreement-checkline { display: flex; align-items: center; justify-content: center; gap: 10rpx; min-height: 56rpx; }
.agreement-check { width: 32rpx; height: 32rpx; flex-shrink: 0; border: 2rpx solid var(--c-muted); border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--c-card); }
.agreement-check.checked { background: var(--c-primary); border-color: var(--c-primary); }
.check-mark { color: var(--c-rice); font-size: 22rpx; line-height: 1; }
.agreement-text { color: var(--c-muted); font-size: 24rpx; line-height: 56rpx; }
.agreement-docs { display: flex; align-items: center; justify-content: center; gap: 8rpx; min-height: 56rpx; }
.agreement-link { color: var(--c-brown); text-decoration: underline; font-size: 24rpx; line-height: 56rpx; }
.login-skip { margin-top: 24rpx; background: transparent; color: var(--c-muted); font-size: 26rpx; line-height: 1.7; padding: 20rpx; }
.login-skip:active { opacity: .7; }
</style>