<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack fallback="/pages/profile/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <text class="nav-title serif">{{ tr('兑换代金券', 'Redeem voucher') }}</text>
    </view>
    <view class="content">
      <PageState
        v-if="!isLoggedIn"
        state="guest"
        :title="tr('登录后兑换代金券', 'Log in to redeem')"
        :message="tr('兑换码会绑定到你的账号，登录后即可领取。', 'A voucher code is bound to your account once you log in.')"
        :action="tr('去登录', 'Log in')"
        @action="goLogin"
      />

      <template v-else>
        <view v-if="!redeemed" class="card redeem-card">
          <text class="eyebrow">REDEEM VOUCHER</text>
          <text class="card-title serif">{{ tr('输入券码领取', 'Enter your code') }}</text>
          <text class="muted hint">{{ tr('8 位字母或数字，不区分大小写，短横线可忽略。', '8 letters or digits, case-insensitive. Dashes are ignored.') }}</text>
          <view class="code-field" :class="{ filled: code.length === CODE_LENGTH }">
            <input
              class="code-input"
              :value="displayCode"
              type="text"
              :maxlength="9"
              :placeholder="tr('ABCD-EFGH', 'ABCD-EFGH')"
              placeholder-class="code-placeholder"
              :focus="autoFocus"
              @input="onInput"
              @confirm="submit"
            />
            <text class="code-count">{{ code.length }}/{{ CODE_LENGTH }}</text>
          </view>
          <text v-if="errorText" class="error-text">{{ errorText }}</text>
          <button class="btn-primary submit" :disabled="!canSubmit" :loading="submitting" @tap="submit">{{ submitting ? tr('兑换中…', 'Redeeming…') : tr('立即兑换', 'Redeem now') }}</button>
          <view class="tips">
            <text class="tip">{{ tr('每张券只能兑换一次；兑换后可在「我的资产」查看。', 'Each code can be redeemed once. Find it in My assets.') }}</text>
            <text class="tip">{{ tr('代金券在报名结算时抵扣，有效期以券面为准。', 'Vouchers apply at checkout. Expiry is shown on the voucher.') }}</text>
          </view>
        </view>

        <view v-else class="card success-card">
          <view class="success-head">
            <PresenceIcon name="check" :size="34" />
            <text class="success-label">{{ justRedeemed ? tr('兑换成功，已存入你的账户', 'Redeemed — saved to your account') : tr('这张券已在你的账户里', 'This voucher is already in your account') }}</text>
          </view>
          <view class="voucher-row">
            <view class="voucher-value">
              <text class="voucher-mode">{{ voucherView.modeLabel }}</text>
              <text class="voucher-amount">{{ voucherView.amountText }}</text>
            </view>
            <view class="voucher-copy">
              <text class="voucher-name">{{ voucherView.name }}</text>
              <text class="muted">{{ voucherView.condition }}</text>
              <text class="muted">{{ voucherView.expire }}</text>
            </view>
          </view>
          <button class="btn-primary submit" @tap="goVouchers">{{ tr('查看我的代金券', 'View my vouchers') }}</button>
          <button class="btn-ghost submit" @tap="reset">{{ tr('再兑换一张', 'Redeem another') }}</button>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { redeemVoucher, type RedeemedVoucher } from '@/api/voucher'
import { useUserStore } from '@/stores/user'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'
import PageState from '@/components/PageState.vue'
import FloatingBack from '@/components/FloatingBack.vue'

const CODE_LENGTH = 8

const userStore = useUserStore()
const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const isLoggedIn = computed(() => userStore.isLoggedIn)

const code = ref('')
const displayCode = computed(() => (code.value.length > 4 ? `${code.value.slice(0, 4)}-${code.value.slice(4)}` : code.value))
const autoFocus = ref(false)
const submitting = ref(false)
const errorText = ref('')
const redeemed = ref<RedeemedVoucher | null>(null)
const justRedeemed = ref(false)
/** 扫码进入时带上的券码，登录后自动兑换一次 */
const pendingAuto = ref('')
let autoAttempted = false

/** 与服务端一致：大写、去分隔符、O→0、I/L→1 */
function normalizeCode(raw: unknown) {
  if (typeof raw !== 'string') return ''
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').slice(0, CODE_LENGTH)
}

function formatTime(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  if (isEnglish()) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const voucherView = computed(() => {
  const v = redeemed.value
  if (!v) return { modeLabel: '', amountText: '', name: '', condition: '', expire: '' }
  const reduceTo = v.mode === 'REDUCE_TO'
  const rawAmount = reduceTo ? v.targetPrice : v.amount
  const amount = rawAmount != null && Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : null
  const courseIds = Array.isArray(v.applicableCourseIds) ? v.applicableCourseIds : []
  return {
    modeLabel: reduceTo ? tr('减至券', 'Reduce-to voucher') : tr('减额券', 'Discount voucher'),
    amountText: amount === null ? tr('金额待确认', 'Pending') : `¥${amount.toFixed(2)}`,
    name: v.source || tr('代金券', 'Voucher'),
    condition: v.applicableAll ? tr('全部课程可用', 'Valid for all courses') : tr(`指定 ${courseIds.length} 门课程可用`, `Valid for ${courseIds.length} selected courses`),
    expire: formatTime(v.expiresAt) ? tr(`有效期至 ${formatTime(v.expiresAt)}`, `Valid until ${formatTime(v.expiresAt)}`) : tr('有效期信息暂缺', 'Expiry information unavailable'),
  }
})

const canSubmit = computed(() => code.value.length === CODE_LENGTH && !submitting.value)

function onInput(e: any) {
  code.value = normalizeCode(e?.detail?.value)
  errorText.value = ''
}

async function submit() {
  if (!isLoggedIn.value) {
    goLogin()
    return
  }
  if (submitting.value) return
  if (code.value.length !== CODE_LENGTH) {
    errorText.value = tr('兑换码为 8 位字母或数字', 'Codes are 8 letters or digits')
    return
  }
  submitting.value = true
  errorText.value = ''
  try {
    const result = await redeemVoucher(code.value)
    if (!result?.voucher) throw new Error(tr('兑换未完成，请重试。', 'The redemption did not complete. Please retry.'))
    redeemed.value = result.voucher
    justRedeemed.value = result.replayed !== true
    pendingAuto.value = ''
    uni.showToast({ title: justRedeemed.value ? tr('兑换成功', 'Redeemed') : tr('你已兑换过该券', 'Already redeemed'), icon: 'success' })
  } catch (error) {
    // 券码不存在、已被兑换、已过期、尝试过于频繁等文案由服务端给出，原样展示
    errorText.value = error instanceof Error && error.message ? error.message : tr('兑换失败，请稍后重试。', 'Redemption failed. Please retry later.')
  } finally {
    submitting.value = false
  }
}

/** 扫码进入的券码：登录态就绪后自动兑换一次，失败后不再自动重试 */
function tryAutoRedeem() {
  if (autoAttempted || !pendingAuto.value || !isLoggedIn.value || redeemed.value) return
  autoAttempted = true
  code.value = pendingAuto.value
  submit()
}

function reset() {
  redeemed.value = null
  justRedeemed.value = false
  code.value = ''
  errorText.value = ''
  autoFocus.value = true
}
function goVouchers() { uni.navigateTo({ url: '/pages/assets/index?tab=vouchers' }) }
function goLogin() { uni.switchTab({ url: '/pages/profile/index' }) }

onLoad((query) => {
  const preset = normalizeCode(query?.code ? decodeURIComponent(String(query.code)) : '')
  if (!preset) {
    autoFocus.value = true
    return
  }
  code.value = preset
  pendingAuto.value = preset
})
onShow(() => {
  tryAutoRedeem()
  if (!pendingAuto.value && !redeemed.value) autoFocus.value = !code.value
})
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); }
.nav-bar { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 32rpx; }
.back-spacer { width: 80rpx; height: 80rpx; flex-shrink: 0; }
.nav-title { font-size: 36rpx; }
button::after { border: none; }
.content { padding: 0 32rpx; }
.card { background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 40rpx 36rpx; }
.eyebrow { color: var(--c-brown); font-size: 22rpx; letter-spacing: 3rpx; }
.card-title { display: block; font-size: 40rpx; margin: 14rpx 0 12rpx; }
.muted { display: block; font-size: 24rpx; color: var(--c-muted); line-height: 1.7; margin-top: 6rpx; }
.hint { margin-bottom: 28rpx; }
.code-field { display: flex; align-items: center; gap: 16rpx; padding: 24rpx 28rpx; background: var(--c-card-2); border: 2rpx solid var(--line-soft); border-radius: var(--radius-card); }
.code-field.filled { border-color: var(--c-primary); }
.code-input { flex: 1; min-width: 0; font-size: 44rpx; letter-spacing: 6rpx; font-weight: 600; color: var(--c-ink); height: 72rpx; line-height: 72rpx; }
.code-placeholder { color: var(--c-muted); font-weight: 400; letter-spacing: 4rpx; }
.code-count { font-size: 24rpx; color: var(--c-muted); }
.error-text { display: block; margin-top: 20rpx; font-size: 26rpx; color: #b3261e; line-height: 1.7; overflow-wrap: anywhere; }
.submit { margin-top: 32rpx; width: 100%; min-height: 92rpx; line-height: 92rpx; padding: 0; border-radius: var(--radius-button); font-size: 30rpx; }
.btn-primary { background: var(--c-primary); color: var(--c-rice); }
.btn-primary[disabled] { opacity: 0.45; }
.btn-ghost { background: transparent; color: var(--c-primary); border: 2rpx solid var(--c-primary); box-sizing: border-box; }
.tips { margin-top: 32rpx; padding-top: 24rpx; border-top: 1rpx solid var(--line-soft); }
.tip { display: block; font-size: 24rpx; color: var(--c-muted); line-height: 1.8; }
.success-head { display: flex; align-items: center; gap: 14rpx; color: var(--c-brown); }
.success-label { font-size: 28rpx; font-weight: 600; }
.voucher-row { display: flex; margin-top: 28rpx; background: var(--c-card-2); border-radius: var(--radius-card); overflow: hidden; }
.voucher-value { width: 200rpx; flex-shrink: 0; padding: 32rpx 16rpx; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; border-right: 2rpx dashed var(--line-soft); color: var(--c-primary); }
.voucher-mode { font-size: 24rpx; }
.voucher-amount { font-size: 40rpx; font-weight: 600; margin-top: 12rpx; overflow-wrap: anywhere; }
.voucher-copy { flex: 1; min-width: 0; padding: 28rpx 24rpx; }
.voucher-name { font-size: 30rpx; font-weight: 600; overflow-wrap: anywhere; }
</style>