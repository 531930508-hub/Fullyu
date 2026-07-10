<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-title">会员中心</text>
    </view>

    <!-- 会员卡展示 -->
    <view class="card-section">
      <view class="member-card" :style="{ background: cardBg }">
        <view class="card-header">
          <text class="card-brand">Full愈</text>
          <text class="card-type">{{ currentCard.name }}</text>
        </view>
        <view class="card-body">
          <text class="card-user">{{ userName }}</text>
          <text class="card-expire">{{ currentCard.expireDate ? '有效期至 ' + currentCard.expireDate : '暂未开通会员' }}</text>
        </view>
        <view class="card-footer">
          <text class="card-no">NO.FY20250101</text>
        </view>
      </view>
    </view>

    <!-- 权益说明 -->
    <view class="section">
      <text class="section-title">会员权益</text>
      <view class="benefit-list">
        <view v-for="(b, idx) in currentCard.benefits" :key="idx" class="benefit-item">
          <text class="benefit-icon">✨</text>
          <view class="benefit-info">
            <text class="benefit-name">{{ b }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 卡类型选择 -->
    <view class="section">
      <text class="section-title">升级 / 续费</text>
      <view class="card-options">
        <view v-for="card in cardTypes" :key="card.type" class="card-option" :class="{ selected: selectedCard === card.type }" @tap="selectedCard = card.type">
          <text class="option-name">{{ card.name }}</text>
          <text class="option-price">¥{{ card.price }}</text>
          <text class="option-period">{{ card.period }}</text>
          <text v-if="card.discountPercent" class="option-discount">全课程 {{ (card.discountPercent / 10).toFixed(1) }} 折</text>
        </view>
      </view>
    </view>

    <!-- 购买按钮 -->
    <view class="bottom-bar safe-area-bottom">
      <view class="bottom-info">
        <text class="bottom-price">¥{{ selectedCardInfo.price }}</text>
        <text class="bottom-desc">{{ selectedCardInfo.name }} · {{ selectedCardInfo.period }}</text>
      </view>
      <view class="buy-btn" @tap="showBuyForm">
        <text>立即购买</text>
      </view>
    </view>

    <!-- 购买信息弹窗 -->
    <view v-if="formVisible" class="popup-mask" @tap="formVisible = false">
      <view class="popup-content" @tap.stop>
        <text class="popup-title">完善购买信息</text>
        <text class="popup-desc">购买会员卡需填写以下信息</text>

        <view class="form-item">
          <text class="form-label">称呼 <text class="required">*</text></text>
          <input class="form-input" v-model="buyForm.nickname" placeholder="请输入您的称呼" />
        </view>

        <view class="form-item">
          <text class="form-label">性别 <text class="required">*</text></text>
          <view class="gender-options">
            <view v-for="g in genderList" :key="g.value" class="gender-option" :class="{ active: buyForm.gender === g.value }" @tap="buyForm.gender = g.value">
              <text>{{ g.label }}</text>
            </view>
          </view>
        </view>

        <view class="form-item">
          <text class="form-label">生日 <text class="required">*</text></text>
          <picker mode="date" :value="buyForm.birthday" @change="onBirthdayChange">
            <view class="form-input picker-input">
              <text :class="{ placeholder: !buyForm.birthday }">{{ buyForm.birthday || '请选择生日' }}</text>
            </view>
          </picker>
        </view>

        <view class="popup-actions">
          <view class="popup-cancel" @tap="formVisible = false"><text>取消</text></view>
          <view class="popup-confirm" @tap="handleBuy"><text>确认支付</text></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listMemberProducts, getActiveCard, purchaseMember, type MemberCardProduct } from '@/api/member'
import { payOrder } from '@/utils/wechat'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

interface CardType {
  id: string
  type: string
  name: string
  price: number
  period: string
  durationDays: number
  benefits: string[]
  discountPercent?: number
}

function periodLabel(days: number) {
  if (days > 0 && days % 365 === 0) return `${days / 365}年`
  if (days > 0 && days % 30 === 0) return `${days / 30}个月`
  return `${days}天`
}

function toCardType(p: MemberCardProduct): CardType {
  return {
    id: p.id,
    type: p.type,
    name: p.name,
    price: Number(p.price),
    durationDays: p.durationDays,
    period: periodLabel(p.durationDays),
    benefits: p.benefits || [],
  }
}

const cardTypes = ref<CardType[]>([])
const selectedCard = ref('')
const formVisible = ref(false)
const submitting = ref(false)

const genderList = [
  { value: 'female', label: '女' },
  { value: 'male', label: '男' },
  { value: 'other', label: '其他' },
]

const buyForm = ref({
  nickname: '',
  gender: '',
  birthday: '',
})

// 当前拥有的会员卡
const currentCard = ref<{ type: string; name: string; expireDate: string; benefits: string[] }>({
  type: '',
  name: '普通用户',
  expireDate: '',
  benefits: [],
})

const userName = computed(() => userStore.userInfo?.nickname || '会员')

const cardBg = computed(() => {
  const map: Record<string, string> = {
    MONTHLY: 'linear-gradient(135deg, #A08A72, #C4A882)',
    QUARTERLY: 'linear-gradient(135deg, #6B463C, #A07060)',
    YEARLY: 'linear-gradient(135deg, #4B3621, #6B463C)',
  }
  return map[currentCard.value.type] || 'linear-gradient(135deg, #4B3621, #6B463C)'
})

const selectedCardInfo = computed<CardType>(() => {
  return (
    cardTypes.value.find((c) => c.type === selectedCard.value) ||
    cardTypes.value[cardTypes.value.length - 1] ||
    ({ id: '', type: '', name: '', price: 0, period: '', durationDays: 0, benefits: [] } as CardType)
  )
})

function formatDate(d?: string) {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${m}-${day}`
}

async function loadProducts() {
  try {
    const list = await listMemberProducts()
    const products = (list || [])
      .filter((p) => p.status === 'ON_SHELF')
      .sort((a, b) => a.sort - b.sort)
      .map(toCardType)
    cardTypes.value = products
    if (!selectedCard.value) {
      selectedCard.value = products[products.length - 1]?.type || ''
    }
    // 默认展示选中卡权益（未开通时）
    if (!currentCard.value.type && selectedCardInfo.value) {
      currentCard.value.benefits = selectedCardInfo.value.benefits
    }
  } catch (e) {
    // 错误已由 request 统一提示
  }
}

async function loadActiveCard() {
  if (!userStore.isLoggedIn) return
  try {
    const card = await getActiveCard()
    if (card) {
      currentCard.value = {
        type: card.type,
        name: card.product?.name || '会员卡',
        expireDate: formatDate(card.expiresAt),
        benefits: card.product?.benefits || [],
      }
    }
  } catch (e) {
    // 静默
  }
}

onShow(() => {
  loadProducts()
  loadActiveCard()
})

function showBuyForm() {
  if (!userStore.isLoggedIn) {
    uni.showModal({
      title: '提示',
      content: '请先登录后再购买会员卡',
      confirmText: '去登录',
      confirmColor: '#6B463C',
      success: (res) => {
        if (res.confirm) uni.switchTab({ url: '/pages/profile/index' })
      },
    })
    return
  }
  if (!selectedCardInfo.value.id) {
    uni.showToast({ title: '暂无可购买的会员卡', icon: 'none' })
    return
  }
  formVisible.value = true
}

function onBirthdayChange(e: any) {
  buyForm.value.birthday = e.detail.value
}

async function handleBuy() {
  if (!buyForm.value.nickname.trim()) {
    uni.showToast({ title: '请输入称呼', icon: 'none' })
    return
  }
  if (!buyForm.value.gender) {
    uni.showToast({ title: '请选择性别', icon: 'none' })
    return
  }
  if (!buyForm.value.birthday) {
    uni.showToast({ title: '请选择生日', icon: 'none' })
    return
  }
  if (submitting.value) return
  submitting.value = true
  try {
    const res = await purchaseMember(selectedCardInfo.value.id)
    formVisible.value = false
    await payOrder(res.orderId)
    uni.showToast({ title: '购买成功！', icon: 'success' })
    await loadActiveCard()
  } catch (e) {
    // 错误已由 request / 支付提示
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: #F5E8D8; padding-bottom: 160rpx; }
.nav-bar { padding: 24rpx 32rpx; }
.nav-title { font-size: 36rpx; font-weight: 700; color: #4B3621; }

.card-section { padding: 0 32rpx 32rpx; }
.member-card { border-radius: 24rpx; padding: 40rpx; color: #FFF; min-height: 300rpx; display: flex; flex-direction: column; justify-content: space-between; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-brand { font-size: 32rpx; font-weight: 700; opacity: 0.9; }
.card-type { font-size: 24rpx; background: rgba(255,255,255,0.2); padding: 6rpx 20rpx; border-radius: 16rpx; }
.card-body { margin: 24rpx 0; }
.card-user { font-size: 36rpx; font-weight: 600; display: block; margin-bottom: 8rpx; }
.card-expire { font-size: 24rpx; opacity: 0.8; }
.card-footer { }
.card-no { font-size: 22rpx; opacity: 0.6; letter-spacing: 2rpx; }

.section { padding: 0 32rpx 32rpx; }
.section-title { font-size: 30rpx; font-weight: 700; color: #4B3621; margin-bottom: 20rpx; display: block; }

.benefit-list { background: #FFF; border-radius: 20rpx; padding: 8rpx 0; }
.benefit-item { display: flex; align-items: center; gap: 20rpx; padding: 24rpx 28rpx; }
.benefit-icon { font-size: 36rpx; }
.benefit-info { flex: 1; }
.benefit-name { font-size: 28rpx; font-weight: 500; color: #4B3621; display: block; margin-bottom: 4rpx; }
.benefit-desc { font-size: 24rpx; color: #A08A72; }

.card-options { display: flex; gap: 16rpx; }
.card-option { flex: 1; background: #FFF; border-radius: 16rpx; padding: 24rpx 16rpx; text-align: center; border: 3rpx solid transparent; }
.card-option.selected { border-color: #6B463C; background: #FAF5F0; }
.option-name { font-size: 26rpx; font-weight: 600; color: #4B3621; display: block; margin-bottom: 8rpx; }
.option-price { font-size: 36rpx; font-weight: 700; color: #6B463C; display: block; margin-bottom: 4rpx; }
.option-period { font-size: 22rpx; color: #A08A72; display: block; margin-bottom: 8rpx; }
.option-discount { font-size: 20rpx; color: #27AE60; background: #E8F5E9; padding: 4rpx 12rpx; border-radius: 8rpx; }

.bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; height: 120rpx; background: #FFF; display: flex; align-items: center; justify-content: space-between; padding: 0 32rpx; box-shadow: 0 -2px 8px rgba(0,0,0,0.05); }
.bottom-info { }
.bottom-price { font-size: 36rpx; font-weight: 700; color: #6B463C; display: block; }
.bottom-desc { font-size: 22rpx; color: #A08A72; }
.buy-btn { background: #6B463C; padding: 20rpx 56rpx; border-radius: 40rpx; }
.buy-btn text { color: #FFF; font-size: 30rpx; font-weight: 600; }

/* 购买信息弹窗 */
.popup-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; justify-content: center; }
.popup-content { width: 100%; background: #FFF; border-radius: 32rpx 32rpx 0 0; padding: 48rpx 40rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); }
.popup-title { font-size: 34rpx; font-weight: 700; color: #4B3621; display: block; margin-bottom: 8rpx; }
.popup-desc { font-size: 24rpx; color: #A08A72; display: block; margin-bottom: 32rpx; }

.form-item { margin-bottom: 28rpx; }
.form-label { font-size: 26rpx; color: #4B3621; font-weight: 500; display: block; margin-bottom: 12rpx; }
.required { color: #E74C3C; }
.form-input { width: 100%; height: 80rpx; border: 2rpx solid #E8DDD4; border-radius: 16rpx; padding: 0 24rpx; font-size: 28rpx; color: #4B3621; box-sizing: border-box; display: flex; align-items: center; }
.picker-input { background: #FFF; }
.placeholder { color: #C4B5A6; }

.gender-options { display: flex; gap: 16rpx; }
.gender-option { flex: 1; height: 72rpx; border: 2rpx solid #E8DDD4; border-radius: 16rpx; display: flex; align-items: center; justify-content: center; font-size: 28rpx; color: #7D665C; }
.gender-option.active { border-color: #6B463C; background: #FAF5F0; color: #6B463C; font-weight: 600; }

.popup-actions { display: flex; gap: 20rpx; margin-top: 36rpx; }
.popup-cancel { flex: 1; height: 88rpx; border: 2rpx solid #E8DDD4; border-radius: 44rpx; display: flex; align-items: center; justify-content: center; font-size: 30rpx; color: #7D665C; }
.popup-confirm { flex: 2; height: 88rpx; background: #6B463C; border-radius: 44rpx; display: flex; align-items: center; justify-content: center; }
.popup-confirm text { color: #FFF; font-size: 30rpx; font-weight: 600; }
</style>
