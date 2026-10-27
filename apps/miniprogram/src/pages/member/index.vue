<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="page-heading" :style="{ paddingTop: headerTop + 'px' }">
      <text class="page-title serif">{{ t('member.title') }}</text>
      <text class="eyebrow">Membership</text>
    </view>
    <view class="content">
      <PageState v-if="!isLoggedIn" state="guest" :title="tr('购卡享「愈」', 'Join and enjoy Full愈')" :message="tr('登录后查看在场会员卡与真实权益', 'Log in to view Presence member cards and real benefits')" :action="tr('去登录', 'Log in')" @action="goLogin" />
      <PageState v-else-if="loading" state="loading" :title="tr('正在读取会员信息', 'Loading membership')" />
      <PageState v-else-if="loadError" state="error" :title="tr('会员信息加载失败', 'Failed to load membership')" :message="tr('暂时无法确认会员状态，请重试', 'Membership status is unavailable. Please retry.')" :action="tr('重新加载', 'Reload')" @action="loadMemberData" />
      <template v-else>
        <view class="member-card">
          <text class="card-brand">{{ tr('Full愈 · 在场 MEMBERSHIP', 'Full愈 · PRESENCE MEMBERSHIP') }}</text>
          <text class="card-user serif">{{ userName }}</text>
          <text class="card-status">{{ activeCard ? memberName : tr('尚未开通会员', 'Membership not active') }}{{ memberExpiry ? tr(' · 有效期至 ', ' · Valid until ') + memberExpiry : '' }}</text>
          <view class="card-footer">
            <text>{{ activeCard ? tr('身心在场 · 向内生长', 'Be present · grow inward') : tr('为自己留一段在场的时间', 'Set aside time to be present') }}</text>
            <PresenceIcon name="leaf" :size="40" :color="iconColors.gold" />
          </view>
        </view>
        <view class="notice"><PresenceIcon name="info" :size="30" /><text>{{ tr('在场 Presence 会员卡，具体权益以所选卡种说明为准', 'Presence membership benefits follow the description of the selected card.') }}</text></view>

        <view class="section-heading"><text class="section-title serif">{{ tr('会员权益', 'Member benefits') }}</text><text class="eyebrow">Benefits</text></view>
        <text v-if="selectedCardInfo" class="section-caption">{{ memberCardName(selectedCardInfo) }} · {{ tr('卡种权益', 'card benefits') }}</text>
        <view v-if="displayBenefits.length" class="benefit-grid">
          <view v-for="(benefit, index) in displayBenefits" :key="index" class="benefit-card">
            <PresenceIcon :name="benefitIcon(index)" :size="42" />
            <text class="benefit-text">{{ benefit }}</text>
          </view>
        </view>
        <view v-else class="plain-card muted">{{ cardTypes.length ? tr('此卡种暂未提供权益说明', 'No benefit details for this card yet') : tr('暂无上架的会员卡权益', 'No member cards are available yet') }}</view>

        <view class="section-heading"><text class="section-title serif">{{ activeCard ? tr('续费 / 选购', 'Renew / choose a plan') : tr('选择卡种', 'Choose a plan') }}</text><text class="eyebrow">Plans</text></view>
        <view v-if="cardTypes.length" class="plan-grid">
          <button v-for="card in cardTypes" :key="card.id" class="plan-option" :class="{ selected: selectedCard === card.id }" :disabled="submitting || !!pendingOrderId" @tap="selectCard(card.id)">
            <view v-if="selectedCard === card.id" class="selected-mark"><PresenceIcon name="check" :size="24" :color="iconColors.rice" /></view>
            <text class="plan-name">{{ memberCardName(card) }}</text>
            <text class="plan-price serif">¥{{ card.price }}</text>
            <text class="plan-period">{{ card.period }}</text>
          </button>
        </view>
        <PageState v-else state="empty" :title="tr('暂无可购买的会员卡', 'No member cards available')" :message="tr('卡种上架后会展示在这里', 'Plans will appear here once published')" :action="tr('重新加载', 'Reload')" @action="loadMemberData" />
        <text v-if="selectedCardInfo?.description" class="plan-description">{{ selectedCardInfo.description }}</text>
        <button v-if="selectedCardInfo" class="primary-button buy-button" :disabled="submitting" @tap="showBuyForm">
          {{ pendingOrderId ? tr('继续支付', 'Continue payment') : activeCard ? tr('续费 / 购买', 'Renew / buy') : tr('立即开通', 'Activate now') }} · {{ memberCardName(selectedCardInfo) }} ¥{{ selectedCardInfo.price }}
        </button>
      </template>
    </view>

    <BottomSheet :show="formVisible" :title="tr('确认会员卡购买', 'Confirm membership purchase')" :busy="submitting" @close="closeBuyForm">
      <view v-if="selectedCardInfo" class="purchase-summary">
        <PresenceIcon name="card" :size="44" />
        <view class="purchase-copy"><text class="purchase-name">{{ memberCardName(selectedCardInfo) }}</text><text class="muted">{{ selectedCardInfo.period }}</text></view>
        <text class="purchase-price serif">¥{{ selectedCardInfo.price }}</text>
      </view>
      <view class="account-row"><text>{{ tr('开卡账户', 'Account') }} · {{ userName }}</text><button class="text-button" :disabled="submitting || !!pendingOrderId" @tap="goEditProfile">{{ tr('编辑资料', 'Edit profile') }}</button></view>
      <view v-if="!pendingOrderId" class="photo-section">
        <text class="field-label">{{ tr('个人核验照片', 'Verification photo') }}{{ hasVerificationPhoto ? tr('（选填）', ' (optional)') : tr('（必填）', ' (required)') }}</text>
        <button class="photo-upload" :disabled="submitting" @tap="choosePhoto">
          <image v-if="buyForm.photo" :src="buyForm.photo" class="photo-preview" mode="aspectFill" />
          <view v-else class="photo-placeholder"><PresenceIcon name="camera" :size="44" /><text>{{ hasVerificationPhoto ? tr('选择新照片', 'Choose a new photo') : tr('上传照片', 'Upload photo') }}</text></view>
        </button>
        <text class="muted">{{ hasVerificationPhoto ? tr('不上传将沿用已有核验照片。', 'Leave empty to reuse your existing verification photo. ') : tr('首次开卡需上传本人照片。', 'A photo of yourself is required for your first card. ') }}{{ tr('照片仅用于线下签到核验，开卡后有效期内不可在资料页修改。', 'The photo is only used to verify on-site check-ins and cannot be changed on the profile page during the card term.') }}</text>
      </view>
      <view v-else class="notice"><PresenceIcon name="info" :size="30" /><text>{{ tr('已创建订单，请继续完成支付，勿重复下单。放弃支付后，可等待订单失效再核实状态。', 'An order has been created. Continue to payment and do not place another order. If you abandon payment, wait for the order to expire before checking its status.') }}</text></view>
      <button v-if="pendingOrderId" class="text-button" :disabled="submitting" @tap="refreshPendingPurchase">{{ tr('重新核实订单状态', 'Recheck order status') }}</button>
      <text v-if="purchaseError" class="feedback" role="alert">{{ purchaseError }}</text>
      <template #actions>
        <view class="sheet-actions">
          <button class="outline-button" :disabled="submitting" @tap="closeBuyForm">{{ tr('稍后', 'Later') }}</button>
          <button class="primary-button" :loading="submitting" :disabled="submitting" @tap="handleBuy">{{ submitting ? tr('处理中', 'Processing') : pendingOrderId ? tr('继续支付', 'Continue payment') : tr('确认支付', 'Confirm payment') }}</button>
        </view>
      </template>
    </BottomSheet>
    <FloatingTabBar active="member" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listMemberProducts, getActiveCard, purchaseMember, type MemberCardProduct, type MemberCard } from '@/api/member'
import { getProfile } from '@/api/user'
import { payOrder, isOrderPaid } from '@/utils/wechat'
import { useUserStore } from '@/stores/user'
import { t, tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import FloatingTabBar from '@/components/FloatingTabBar.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'
import PageState from '@/components/PageState.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { listMyOrders } from '@/api/order'
import { compressImageToDataUrl } from '@/utils/image'

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
const buyForm = ref({ photo: '', photoPath: '' })
const userName = computed(() => userStore.userInfo?.nickname || tr('在场会员', 'Presence Member'))
const selectedCardInfo = computed(() => cardTypes.value.find(c => c.id === selectedCard.value) || null)
const displayBenefits = computed(() => selectedCardInfo.value?.benefits || [])
const memberName = computed(() => {
  const card = activeCard.value
  if (!card) return ''
  if (card.product?.name) return card.product.name
  return ({ MONTHLY: tr('月卡会员', 'Monthly member'), QUARTERLY: tr('季卡会员', 'Quarterly member'), YEARLY: tr('年卡会员', 'Yearly member') } as Record<string, string>)[card.type || ''] || tr('会员卡', 'Membership card')
})
const memberExpiry = computed(() => formatDate(activeCard.value?.endDate || activeCard.value?.expiresAt))

function formatDate(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  if (isEnglish()) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function memberCardName(card: { type?: string; name: string }) {
  const labels: Record<string, string> = {
    MONTHLY: tr('月卡会员', 'Monthly member'),
    QUARTERLY: tr('季卡会员', 'Quarterly member'),
    YEARLY: tr('年卡会员', 'Yearly member'),
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
    buyForm.value = { photo: '', photoPath: '' }
    return
  }
  if (loading.value || submitting.value || formVisible.value || pendingOrderId.value) return
  loading.value = true
  loadError.value = false
  try {
    const [products, card, profile] = await Promise.all([listMemberProducts(), getActiveCard(), getProfile()])
    if (!uni.getStorageSync('token')) { userStore.logout(); return }
    cardTypes.value = (products || []).filter(p => p.status === 'ON_SHELF').sort((a, b) => a.sort - b.sort).map(toCardType)
    if (!cardTypes.value.some(c => c.id === selectedCard.value)) selectedCard.value = cardTypes.value[0]?.id || ''
    activeCard.value = card as ActiveCard | null
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
    uni.showToast({ title: tr('支付流程已完成，会员状态以到账为准', 'Payment completed. Membership activates once payment is confirmed.'), icon: 'none' })
  } catch (e: any) {
    // 微信回调丢失/晚到时不直接判定失败，先核对订单真实状态
    if (pendingOrderId.value && await isOrderPaid(pendingOrderId.value)) {
      pendingOrderId.value = ''
      formVisible.value = false
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
onShow(loadMemberData)
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); padding-bottom: calc(200rpx + env(safe-area-inset-bottom)); font-size: 28rpx; }
.page-heading { padding: 32rpx 32rpx 24rpx; }
.page-title { display: block; font-size: 48rpx; }
.eyebrow { font-size: 22rpx; color: var(--c-muted); letter-spacing: 1rpx; }
.content { padding: 0 32rpx; }
.member-card { padding: 40rpx; border-radius: var(--radius-card); background: var(--c-primary); color: var(--c-rice); box-shadow: var(--shadow-card); }
.card-brand { display: block; color: var(--c-gold); font-size: 24rpx; letter-spacing: 3rpx; }
.card-user { display: block; font-size: 44rpx; margin-top: 32rpx; }
.card-status { display: block; font-size: 26rpx; margin-top: 14rpx; line-height: 1.7; }
.card-footer { margin-top: 44rpx; display: flex; align-items: center; justify-content: space-between; gap: 16rpx; font-size: 24rpx; }
.notice { display: flex; gap: 16rpx; align-items: flex-start; padding: 24rpx; margin-top: 24rpx; background: var(--c-card-2); color: var(--c-primary); border-radius: var(--radius-button); font-size: 24rpx; line-height: 1.7; }
.section-heading { display: flex; gap: 12rpx; align-items: baseline; margin: 48rpx 0 24rpx; }
.section-title { font-size: 36rpx; }
.section-caption { display: block; font-size: 24rpx; color: var(--c-muted); margin-bottom: 16rpx; }
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
.primary-button, .outline-button { margin: 0; min-height: 88rpx; padding: 22rpx 28rpx; border-radius: var(--radius-button); font-size: 28rpx; line-height: 1.6; }
.primary-button { background: var(--c-primary); color: var(--c-rice); }
.outline-button { background: var(--c-card); color: var(--c-primary); border: 2rpx solid var(--c-primary); }
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
.sheet-actions { display: flex; gap: 20rpx; width: 100%; }
.sheet-actions .outline-button { flex: 1; }
.sheet-actions .primary-button { flex: 2; }
</style>
