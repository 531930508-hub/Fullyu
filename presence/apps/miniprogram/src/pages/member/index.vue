<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="page-heading" :style="{ paddingTop: headerTop + 'px' }">
      <text class="page-title serif">{{ tr('在场畅练卡', 'Presence Pass') }}</text>
      <text class="eyebrow">Presence Pass</text>
    </view>
    <view class="content">
      <button v-if="returnTarget" class="return-banner" @tap="returnToCourse">
        <PresenceIcon name="back" :size="28" />
        <text class="return-label">{{ returnTarget.title ? tr(`返回课程「${returnTarget.title}」`, `Back to ${returnTarget.title}`) : tr('返回课程', 'Back to course') }}</text>
      </button>
      <PageState v-if="!isLoggedIn" state="guest" :title="tr('购卡享「愈」', 'Join and enjoy Full Yu')" :message="tr('登录后查看在场畅练卡与真实权益', 'Log in to view your Presence Pass and benefits')" :action="tr('去登录', 'Log in')" @action="goLogin" />
      <PageState v-else-if="loading" state="loading" :title="tr('正在读取会员信息', 'Loading membership')" />
      <PageState v-else-if="loadError" state="error" :title="tr('会员信息加载失败', 'Failed to load membership')" :message="tr('暂时无法确认会员状态，请重试', 'Membership status is unavailable. Please retry.')" :action="tr('重新加载', 'Reload')" @action="loadMemberData" />
      <template v-else>
        <view class="member-card">
          <text class="card-brand">{{ tr('Full愈 · 在场 畅练卡', 'FULL YU · PRESENCE PASS') }}</text>
          <text class="card-user serif">{{ userName }}</text>
          <text class="card-status">{{ activeCard ? memberName : tr('尚未开通畅练卡', 'Presence Pass not active') }}{{ memberExpiry ? tr(' · 有效期至 ', ' · Valid until ') + memberExpiry : '' }}</text>
          <view class="card-footer">
            <text>{{ activeCard ? tr('有效期内不限次报课 0 元', 'Unlimited ¥0 classes during the term') : tr('为自己留一段在场的时间', 'Set aside time to be present') }}</text>
            <PresenceIcon name="leaf" :size="40" :color="iconColors.gold" />
          </view>
        </view>
        <view v-if="renewalDue" class="renewal">
          <text class="renewal-title serif">{{ tr(`还有 ${daysLeft} 天到期`, `${daysLeft} days left`) }}</text>
          <text class="renewal-note">{{ renewalNote }}</text>
        </view>

        <view class="section-heading"><text class="section-title serif">{{ tr('会员权益', 'Member benefits') }}</text><text class="eyebrow">Benefits</text></view>
        <view v-if="displayBenefits.length" class="benefit-grid">
          <view v-for="(benefit, index) in displayBenefits" :key="index" class="benefit-card">
            <PresenceIcon :name="benefitIcon(index)" :size="42" />
            <text class="benefit-text">{{ benefitText(benefit) }}</text>
          </view>
        </view>
        <view v-else class="plain-card muted">{{ cardTypes.length ? tr('此卡种暂未提供权益说明', 'No benefit details for this card yet') : tr('暂无上架的会员卡权益', 'No member cards are available yet') }}</view>
        <button v-if="activeCard && !showPlans" class="quiet-link" @tap="plansOpen = true">{{ tr('查看卡种', 'View plans') }}</button>

        <template v-if="showPlans">
          <view class="section-heading"><text class="section-title serif">{{ activeCard ? tr('续费', 'Renew') : tr('选择卡种', 'Choose a plan') }}</text><text class="eyebrow">Plans</text></view>
          <view v-if="cardTypes.length" class="plan-grid">
            <button v-for="card in cardTypes" :key="card.id" class="plan-option" :class="{ selected: selectedCard === card.id }" :disabled="submitting || !!pendingOrderId" @tap="selectCard(card.id)">
              <view v-if="selectedCard === card.id" class="selected-mark"><PresenceIcon name="check" :size="24" :color="iconColors.rice" /></view>
              <text class="plan-name">{{ memberCardName(card) }}</text>
              <text class="plan-price serif">¥{{ cardPrice(card.price) }}</text>
              <text class="plan-period">{{ card.period }}</text>
            </button>
          </view>
          <PageState v-else state="empty" :title="tr('暂无可购买的会员卡', 'No member cards available')" :message="tr('卡种上架后会展示在这里', 'Plans will appear here once published')" :action="tr('重新加载', 'Reload')" @action="loadMemberData" />
          <text v-if="selectedCardInfo?.description" class="plan-description">{{ selectedCardInfo.description }}</text>
          <button v-if="selectedCardInfo" class="primary-button buy-button" :disabled="submitting" @tap="showBuyForm">
            {{ pendingOrderId ? tr('继续支付', 'Continue payment') : activeCard ? tr('确认续费', 'Renew') : tr('立即开通', 'Activate now') }} · {{ memberCardName(selectedCardInfo) }} ¥{{ cardPrice(selectedCardInfo.price) }}
          </button>
        </template>
      </template>
    </view>

    <BottomSheet :show="formVisible" :title="activeCard ? tr('确认畅练卡续费', 'Confirm Presence Pass renewal') : tr('确认会员卡购买', 'Confirm membership purchase')" :busy="submitting" @close="closeBuyForm">
      <view v-if="selectedCardInfo" class="purchase-summary">
        <PresenceIcon name="card" :size="44" />
        <view class="purchase-copy"><text class="purchase-name">{{ memberCardName(selectedCardInfo) }}</text><text class="muted">{{ selectedCardInfo.period }}</text></view>
        <text class="purchase-price serif">¥{{ cardPrice(selectedCardInfo.price) }}</text>
      </view>
      <view class="account-row"><text>{{ tr('开卡账户', 'Account') }} · {{ userName }}</text><button class="text-button" :disabled="submitting || !!pendingOrderId" @tap="goEditProfile">{{ tr('编辑资料', 'Edit profile') }}</button></view>
      <view v-if="!pendingOrderId" class="photo-section">
        <text class="field-label">{{ tr('个人核验照片', 'Verification photo') }}{{ hasVerificationPhoto ? tr('（选填）', ' (optional)') : tr('（必填）', ' (required)') }}</text>
        <button class="photo-upload" :disabled="submitting" @tap="choosePhoto">
          <image v-if="buyForm.photo" :src="buyForm.photo" class="photo-preview" mode="aspectFill" />
          <view v-else class="photo-placeholder"><PresenceIcon name="camera" :size="44" /><text>{{ hasVerificationPhoto ? tr('选择新照片', 'Choose a new photo') : tr('上传照片', 'Upload photo') }}</text></view>
        </button>
        <text class="muted">{{ hasVerificationPhoto ? tr('可沿用已有照片；仅用于签到核验，卡期内不可修改。', 'Your existing photo is reused; it is only used for check-in and cannot be changed during the term.') : tr('首次开卡需上传本人照片，仅用于签到核验，卡期内不可修改。', 'A photo of yourself is required for your first card; it is only used for check-in and cannot be changed during the term.') }}</text>
      </view>
      <view v-else class="notice"><PresenceIcon name="info" :size="30" /><text>{{ tr('已创建订单，请继续完成支付，勿重复下单。放弃支付后，可等待订单失效再核实状态。', 'An order has been created. Continue to payment and do not place another order. If you abandon payment, wait for the order to expire before checking its status.') }}</text></view>
      <button v-if="pendingOrderId" class="text-button" :disabled="submitting" @tap="refreshPendingPurchase">{{ tr('重新核实订单状态', 'Recheck order status') }}</button>
      <text v-if="purchaseError" class="feedback" role="alert">{{ purchaseError }}</text>
      <template #actions>
        <button class="primary-button full-button" :loading="submitting" :disabled="submitting" @tap="handleBuy">{{ submitting ? tr('处理中', 'Processing') : pendingOrderId ? tr('继续支付', 'Continue payment') : activeCard ? tr('确认续费', 'Confirm renewal') : tr('确认支付', 'Confirm payment') }}</button>
      </template>
    </BottomSheet>
    <FloatingTabBar active="member" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { listMemberProducts, getActiveCard, purchaseMember, type MemberCardProduct, type MemberCard } from '@/api/member'
import { getProfile } from '@/api/user'
import { payOrder, isOrderPaid } from '@/utils/wechat'
import { useUserStore } from '@/stores/user'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import FloatingTabBar from '@/components/FloatingTabBar.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'
import PageState from '@/components/PageState.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { listMyOrders } from '@/api/order'
import { compressImageToDataUrl } from '@/utils/image'
import { brandShareMessage, brandShareTimeline } from '@/utils/share'

// SVG data-URL images require resolved DESIGN token values, not page CSS variables.
const iconColors = { gold: '#eec76f', rice: '#f5f6ed' }
const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const userStore = useUserStore()
const isLoggedIn = computed(() => userStore.isLoggedIn)
// The server currently returns endDate; expiresAt is retained for API-client compatibility.
type ActiveCard = MemberCard & { endDate?: string }
interface CardType { id: string; type: string; name: string; price: number; period: string; benefits: string[]; description?: string }
const cardTypes = ref<CardType[]>([])
const selectedCard = ref('')
const activeCard = ref<ActiveCard | null>(null)
const loading = ref(false)
const loadError = ref(false)
const hasVerificationPhoto = ref(false)
const formVisible = ref(false)
const submitting = ref(false)
const pendingOrderId = ref('')
const purchaseError = ref('')
/** 有卡且未临期时，卡种与续费入口默认隐藏；用户主动点开才展示 */
const plansOpen = ref(false)
const returnTarget = ref<{ type: string; id: string; title?: string; at?: number } | null>(null)
/** 从课程页跳来了解会员权益时，保留 2 小时内的回跳入口。 */
const RETURN_TTL_MS = 2 * 3600 * 1000
function readReturnTarget() {
  const saved = uni.getStorageSync('presence_member_return')
  if (!saved?.id || (saved.at && Date.now() - Number(saved.at) > RETURN_TTL_MS)) {
    if (saved) uni.removeStorageSync('presence_member_return')
    returnTarget.value = null
    return
  }
  returnTarget.value = saved
}
function returnToCourse() {
  const target = returnTarget.value
  if (!target) return
  uni.removeStorageSync('presence_member_return')
  returnTarget.value = null
  if (target.type === 'course') {
    uni.navigateTo({ url: `/pages/course-detail/index?id=${encodeURIComponent(target.id)}` })
  } else {
    uni.switchTab({ url: '/pages/index/index' })
  }
}
const buyForm = ref({ photo: '', photoPath: '' })
const userName = computed(() => userStore.userInfo?.nickname || tr('在场会员', 'Presence Member'))
const selectedCardInfo = computed(() => cardTypes.value.find(c => c.id === selectedCard.value) || null)
/** 服务端权益文案固定中文；这里做展示映射，并把「赠送品牌大会员」写进权益本身。 */
const BENEFIT_COPY: Record<string, { zh: string; en: string }> = {
  '有效期内报课 0 元（不限次）': { zh: '有效期内报课 0 元（不限次）', en: 'Unlimited ¥0 classes during the term' },
  '免费赠送同期 Full愈 品牌大会员': { zh: '免费赠送同等有效期的 Full愈 品牌大会员（三店通用）', en: 'Full Yu brand membership included for the same term (all three stores)' },
  '专属活动': { zh: '专属活动', en: 'Members-only events' },
}
function benefitText(value: string) {
  const copy = BENEFIT_COPY[value]
  if (!copy) return value
  return isEnglish() ? copy.en : copy.zh
}
/** 「到店签到核验」是开卡与签到流程，不是会员权益；后台历史配置里带了也不展示。 */
const NON_BENEFIT = /签到/
const displayBenefits = computed(() =>
  (selectedCardInfo.value?.benefits || []).filter(b => !NON_BENEFIT.test(b))
)
const memberName = computed(() => {
  const card = activeCard.value
  if (!card) return ''
  const plan = ({ MONTHLY: tr('月卡', 'Monthly'), QUARTERLY: tr('季卡', 'Quarterly'), YEARLY: tr('年卡', 'Yearly') } as Record<string, string>)[card.type || ''] || card.product?.name || ''
  return plan ? tr(`在场畅练卡 · ${plan}`, `Presence Pass · ${plan}`) : tr('在场畅练卡', 'Presence Pass')
})
const memberExpiry = computed(() => formatDate(activeCard.value?.endDate || activeCard.value?.expiresAt))

const DAY_MS = 24 * 60 * 60 * 1000
/** 有卡时只在「最后一段」才强提醒续费：年卡约 30 天、季卡约 18 天、月卡约 7 天。 */
function endTimeOf(card: ActiveCard | null) {
  const raw = card?.endDate || card?.expiresAt
  if (!raw) return 0
  const time = new Date(raw).getTime()
  return Number.isFinite(time) ? time : 0
}
const daysLeft = computed(() => {
  const end = endTimeOf(activeCard.value)
  return end ? Math.max(0, Math.ceil((end - Date.now()) / DAY_MS)) : 0
})
const totalDays = computed(() => {
  const card = activeCard.value
  const end = endTimeOf(card)
  if (!end) return 30
  const start = card?.startDate ? new Date(card.startDate).getTime() : NaN
  if (!Number.isFinite(start)) {
    return ({ MONTHLY: 30, QUARTERLY: 90, YEARLY: 365 } as Record<string, number>)[card?.type || ''] || 30
  }
  return Math.max(1, Math.round((end - start) / DAY_MS))
})
const renewalWindowDays = computed(() => Math.min(30, Math.max(7, Math.round(totalDays.value * 0.2))))
const renewalDue = computed(() => {
  if (!activeCard.value) return false
  const end = endTimeOf(activeCard.value)
  return end > 0 && daysLeft.value <= renewalWindowDays.value
})
/** 有卡且未临期时不展示卡种与续费按钮，只留一行很轻的入口。 */
const showPlans = computed(() => !activeCard.value || renewalDue.value || plansOpen.value)
const activePlanPrice = computed(() => {
  const card = activeCard.value
  if (!card) return 0
  const plan = cardTypes.value.find(c => c.type === card.type)
  return Number(plan?.price ?? card.product?.price ?? 0)
})
const savedCents = computed(() => Math.max(0, Number(activeCard.value?.stats?.savedCents) || 0))
/** 省得足够多才拿出来说：至少 ¥200，且接近或超过本期卡价的六成。 */
const strongSavings = computed(() => {
  const saved = savedCents.value / 100
  const price = activePlanPrice.value
  return saved >= 200 && price > 0 && saved >= price * 0.6
})
const renewalNote = computed(() =>
  strongSavings.value
    ? tr(`这期用卡已省 ¥${formatCents(savedCents.value)}，续上继续 0 元报课。`, `You saved ¥${formatCents(savedCents.value)} this term. Renew to keep ¥0 classes.`)
    : tr('续费后从当前到期日次日起接续，继续不限次 0 元报课。', 'Renewal continues the day after your current end date, with unlimited ¥0 classes.')
)

function formatDate(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  if (isEnglish()) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** 会员卡价格以「元」存储，可能带小数，统一补两位小数，避免出现「¥0.1」这种半截价 */
function cardPrice(value: unknown) {
  return (Number(value) || 0).toFixed(2)
}
/** 节省金额按「分」返回，展示成元；整数不补小数位。 */
function formatCents(cents: number) {
  const value = (Number(cents) || 0) / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
function memberCardName(card: { type?: string; name: string }) {
  const labels: Record<string, string> = {
    // 加「畅练」前缀，避免与 Full愈 品牌年卡混淆
    MONTHLY: tr('畅练月卡', 'Monthly Pass'),
    QUARTERLY: tr('畅练季卡', 'Quarterly Pass'),
    YEARLY: tr('畅练年卡', 'Yearly Pass'),
  }
  return labels[card.type || ''] || card.name
}
function periodLabel(days: number) { return isEnglish() ? `${days} days` : `${days} 天` }
function toCardType(p: MemberCardProduct): CardType {
  return { id: p.id, type: p.type, name: p.name, price: Number(p.price), period: periodLabel(p.durationDays), benefits: Array.isArray(p.benefits) ? p.benefits.filter(b => typeof b === 'string') : [], description: p.description }
}
function benefitIcon(index: number) { return ['card', 'calendar', 'users', 'clock'][index % 4] }
function selectCard(id: string) { if (!submitting.value && !pendingOrderId.value) selectedCard.value = id }

async function loadMemberData() {
  if (!uni.getStorageSync('token')) userStore.logout()
  if (!isLoggedIn.value) {
    cardTypes.value = []; activeCard.value = null; selectedCard.value = ''
    hasVerificationPhoto.value = false; formVisible.value = false; pendingOrderId.value = ''
    plansOpen.value = false
    buyForm.value = { photo: '', photoPath: '' }
    return
  }
  if (loading.value || submitting.value || formVisible.value || pendingOrderId.value) return
  loading.value = true
  loadError.value = false
  try {
    const [products, card, profile] = await Promise.all([listMemberProducts(), getActiveCard(true), getProfile()])
    if (!uni.getStorageSync('token')) { userStore.logout(); return }
    cardTypes.value = (products || []).filter(p => p.status === 'ON_SHELF').sort((a, b) => a.sort - b.sort).map(toCardType)
    activeCard.value = card as ActiveCard | null
    if (!cardTypes.value.some(c => c.id === selectedCard.value)) {
      // 已持卡用户默认展示其当前卡种权益，避免「年卡会员」看到月卡权益
      const activeType = activeCard.value?.type
      selectedCard.value = cardTypes.value.find(c => c.type === activeType)?.id || cardTypes.value[0]?.id || ''
    }
    // Keep only the existence flag; the server never returns the private photo itself.
    hasVerificationPhoto.value = profile?.hasVerificationPhoto === true
  } catch {
    activeCard.value = null
    loadError.value = true
    if (!uni.getStorageSync('token')) userStore.logout()
  } finally { loading.value = false }
}
function goLogin() { uni.switchTab({ url: '/pages/profile/index' }) }
function goEditProfile() {
  if (submitting.value || pendingOrderId.value) return
  closeBuyForm()
  uni.navigateTo({ url: '/pages/profile-edit/index' })
}
function showBuyForm() {
  if (!isLoggedIn.value) { goLogin(); return }
  if (loading.value || loadError.value || !selectedCardInfo.value || submitting.value) return
  purchaseError.value = ''
  formVisible.value = true
}
function closeBuyForm() {
  if (submitting.value) return
  formVisible.value = false
  buyForm.value = { photo: '', photoPath: '' }
}
function choosePhoto() {
  if (submitting.value || pendingOrderId.value) return
  uni.chooseImage({
    count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
    success: (res: any) => {
      const path = res.tempFilePaths?.[0]
      if (path) buyForm.value = { photo: path, photoPath: path }
    },
  })
}
async function handleBuy() {
  if (submitting.value || !selectedCardInfo.value || !isLoggedIn.value) return
  if (!pendingOrderId.value && !hasVerificationPhoto.value && !buyForm.value.photoPath) {
    purchaseError.value = tr('请上传个人照片用于签到核验', 'Please upload a photo of yourself for check-in verification.')
    return
  }
  submitting.value = true
  purchaseError.value = ''
  try {
    if (!pendingOrderId.value) {
      const photoData = buyForm.value.photoPath ? await compressImageToDataUrl(buyForm.value.photoPath) : undefined
      const result = await purchaseMember(selectedCardInfo.value.id, photoData)
      pendingOrderId.value = result.orderId
      buyForm.value = { photo: '', photoPath: '' }
    }
    await payOrder(pendingOrderId.value)
    pendingOrderId.value = ''
    formVisible.value = false
    plansOpen.value = false
    uni.showToast({ title: tr('支付流程已完成，会员状态以到账为准', 'Payment completed. Membership activates once payment is confirmed.'), icon: 'none' })
  } catch (e: any) {
    // 微信回调丢失/晚到时不直接判定失败，先核对订单真实状态
    if (pendingOrderId.value && await isOrderPaid(pendingOrderId.value)) {
      pendingOrderId.value = ''
      formVisible.value = false
      plansOpen.value = false
      uni.showToast({ title: tr('支付流程已完成，会员状态以到账为准', 'Payment completed. Membership activates once payment is confirmed.'), icon: 'none' })
    } else {
      purchaseError.value = pendingOrderId.value
        ? tr('支付未完成，可继续支付；若订单已失效，请重新核实订单状态。', 'Payment was not completed. You can continue payment; if the order has expired, recheck its status.')
        : (e?.message || tr('购买未完成，请检查信息后重试', 'Purchase was not completed. Check your details and retry.'))
    }
    if (!uni.getStorageSync('token')) { userStore.logout(); formVisible.value = false }
  } finally {
    submitting.value = false
  }
  if (!formVisible.value) await loadMemberData()
}
async function refreshPendingPurchase() {
  if (!pendingOrderId.value || submitting.value) return
  submitting.value = true
  purchaseError.value = ''
  try {
    const orders = await listMyOrders()
    const order = orders.find(item => item.id === pendingOrderId.value && item.orderType === 'MEMBER_CARD')
    if (order && ['PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
      pendingOrderId.value = ''
      formVisible.value = false
      buyForm.value = { photo: '', photoPath: '' }
    } else {
      purchaseError.value = order?.status === 'PENDING_PAYMENT'
        ? tr('订单仍待支付，可继续支付；放弃购买请等待订单失效后再核实。', 'The order is still awaiting payment. You can continue; if you give up, wait for it to expire before checking again.')
        : tr('订单状态暂未确认，请稍后重试或联系客服。', 'Order status is not confirmed yet. Retry later or contact support.')
    }
  } catch {
    purchaseError.value = tr('订单状态读取失败，请重试，勿重复付款', 'Could not read order status. Retry and do not pay again.')
    if (!uni.getStorageSync('token')) { userStore.logout(); formVisible.value = false }
  } finally { submitting.value = false }
  if (!formVisible.value) await loadMemberData()
}
onShow(() => {
  readReturnTarget()
  void loadMemberData()
})

const shareTitle = () => tr('Full愈 · 在场畅练卡｜把时间留给自己', 'Full Yu · Presence Pass | Time for yourself')
onShareAppMessage(() => brandShareMessage(shareTitle()))
// #ifdef MP-WEIXIN
onShareTimeline(() => brandShareTimeline(shareTitle()))
// #endif
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); padding-bottom: calc(200rpx + env(safe-area-inset-bottom)); font-size: 28rpx; }
.page-heading { padding: 32rpx 32rpx 24rpx; }
.page-title { display: block; font-size: 48rpx; }
.eyebrow { font-size: 22rpx; color: var(--c-muted); letter-spacing: 1rpx; }
.content { padding: 0 32rpx; }
.return-banner { display: flex; align-items: center; gap: 10rpx; width: 100%; margin-bottom: 20rpx; padding: 18rpx 24rpx; border-radius: var(--radius-button); background: var(--c-card-2); color: var(--c-primary); font-size: 26rpx; text-align: left; }
.return-label { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.renewal { margin-top: 24rpx; padding: 28rpx 30rpx; border-radius: var(--radius-card); background: #fbf1df; border: 1rpx solid #ecd9b6; }
.renewal-title { display: block; font-size: 34rpx; line-height: 1.4; color: var(--c-primary); }
.renewal-note { display: block; margin-top: 8rpx; font-size: 23rpx; line-height: 1.7; color: var(--c-brown); }
.quiet-link { display: block; width: 100%; margin-top: 18rpx; padding: 4rpx 0; background: transparent; text-align: left; font-size: 22rpx; line-height: 1.6; color: var(--c-muted); }
.member-card { padding: 40rpx; border-radius: var(--radius-card); background: var(--c-primary); color: var(--c-rice); box-shadow: var(--shadow-card); }
.card-brand { display: block; color: var(--c-gold); font-size: 24rpx; letter-spacing: 3rpx; }
.card-user { display: block; font-size: 44rpx; margin-top: 32rpx; }
.card-status { display: block; font-size: 26rpx; margin-top: 14rpx; line-height: 1.7; }
.card-footer { margin-top: 44rpx; display: flex; align-items: center; justify-content: space-between; gap: 16rpx; font-size: 24rpx; }
.notice { display: flex; gap: 16rpx; align-items: flex-start; padding: 24rpx; margin-top: 24rpx; background: var(--c-card-2); color: var(--c-primary); border-radius: var(--radius-button); font-size: 24rpx; line-height: 1.7; }
.section-heading { display: flex; gap: 12rpx; align-items: baseline; margin: 48rpx 0 24rpx; }
.section-title { font-size: 36rpx; }
.benefit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24rpx; }
.benefit-card, .plain-card { padding: 32rpx; background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.benefit-text { display: block; margin-top: 20rpx; line-height: 1.7; overflow-wrap: anywhere; }
.plan-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16rpx; }
.plan-option { position: relative; margin: 0; padding: 32rpx 12rpx 24rpx; background: var(--c-card); color: var(--c-ink); border: 2rpx solid var(--line-soft); border-radius: var(--radius-button); line-height: 1.6; overflow: hidden; }
.plan-option.selected { border-color: var(--c-primary); background: var(--c-card-2); }
.selected-mark { position: absolute; right: 0; top: 0; padding: 4rpx; border-radius: 0 0 0 12rpx; background: var(--c-primary); }
.plan-name, .plan-period, .plan-price { display: block; overflow-wrap: anywhere; }
.plan-name { font-size: 28rpx; font-weight: 600; }
.plan-price { font-size: 36rpx; margin: 12rpx 0; color: var(--c-primary); }
.plan-period { font-size: 24rpx; color: var(--c-muted); }
.plan-description { display: block; color: var(--c-muted); font-size: 24rpx; line-height: 1.7; margin-top: 20rpx; }
button::after { border: none; }
.primary-button { margin: 0; min-height: 88rpx; padding: 22rpx 28rpx; border-radius: var(--radius-button); font-size: 28rpx; line-height: 1.6; background: var(--c-primary); color: var(--c-rice); }
button[disabled] { opacity: .6; }
.buy-button { margin-top: 32rpx; width: 100%; }
.purchase-summary { display: flex; align-items: center; gap: 20rpx; padding: 28rpx; background: var(--c-card-2); border-radius: var(--radius-card); }
.purchase-copy { flex: 1; min-width: 0; }
.purchase-name { display: block; font-size: 30rpx; font-weight: 600; }
.purchase-price { color: var(--c-primary); font-size: 40rpx; }
.account-row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin: 20rpx 0; font-size: 26rpx; }
.text-button { margin: 0; padding: 20rpx 0 20rpx 16rpx; color: var(--c-brown); font-size: 24rpx; background: transparent; line-height: 1.6; }
.field-label { display: block; margin-bottom: 20rpx; font-weight: 600; font-size: 28rpx; }
.photo-upload { display: flex; align-items: center; justify-content: center; width: 200rpx; height: 200rpx; padding: 0; margin: 0 0 20rpx; background: var(--c-card-2); border: 2rpx dashed var(--line-soft); border-radius: var(--radius-button); overflow: hidden; }
.photo-preview { width: 200rpx; height: 200rpx; }
.photo-placeholder { display: flex; flex-direction: column; align-items: center; gap: 16rpx; font-size: 24rpx; color: var(--c-brown); }
.muted { color: var(--c-muted); font-size: 24rpx; line-height: 1.7; }
.feedback { display: block; color: var(--c-primary); background: var(--c-card-2); border-left: 4rpx solid var(--c-apricot); padding: 20rpx; margin-top: 24rpx; font-size: 26rpx; line-height: 1.7; }
.full-button { width: 100%; }
</style>
