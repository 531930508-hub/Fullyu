<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-title serif">{{ t('member.title') }}</text>
    </view>

    <!-- 会员卡展示 -->
    <view class="card-section">
      <view class="member-card" :style="{ background: cardBg }">
        <view class="card-glow"></view>
        <view class="card-header">
          <text class="card-brand latin">Full愈</text>
          <text class="card-type">{{ currentCard.name }}</text>
        </view>
        <view class="card-body">
          <text class="card-user serif">{{ userName }}</text>
          <text class="card-expire">{{ currentCard.expireDate ? t('member.validUntil') + currentCard.expireDate : t('member.notMember') }}</text>
        </view>
        <view class="card-footer">
          <text class="card-no latin">NO.FY20250101</text>
        </view>
      </view>
    </view>

    <!-- 权益说明 -->
    <view class="section">
      <text class="section-title serif">{{ t('member.benefits') }}</text>
      <view class="benefit-list">
        <view v-for="(b, idx) in currentCard.benefits" :key="idx" class="benefit-item">
          <view class="benefit-dot"></view>
          <view class="benefit-info">
            <text class="benefit-name">{{ b }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 卡类型选择 -->
    <view class="section">
      <text class="section-title serif">{{ t('member.upgrade') }}</text>
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
        <text>{{ t('member.buyNow') }}</text>
      </view>
    </view>

    <!-- 购买信息弹窗（Bottom Sheet） -->
    <view v-if="formVisible" class="popup-mask" @tap="formVisible = false">
      <view class="popup-content" @tap.stop>
        <view class="popup-handle"></view>
        <text class="popup-title serif">完善购买信息</text>
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

        <view class="form-item">
          <text class="form-label">个人照片 <text class="required">*</text></text>
          <view class="photo-upload" @tap="choosePhoto">
            <image v-if="buyForm.photo" :src="buyForm.photo" class="photo-preview" mode="aspectFill" />
            <view v-else class="photo-placeholder"><text>+ 上传照片</text></view>
          </view>
          <text class="photo-tip">用于线下签到核验，开卡后本有效期内不可修改</text>
        </view>

        <view class="popup-actions">
          <view class="popup-cancel" @tap="formVisible = false"><text>取消</text></view>
          <view class="popup-confirm" @tap="handleBuy"><text>确认支付</text></view>
        </view>
      </view>
    </view>

    <!-- 悬浮 TabBar -->
    <floating-tab-bar active="member" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listMemberProducts, getActiveCard, purchaseMember, type MemberCardProduct } from '@/api/member'
import { payOrder } from '@/utils/wechat'
import { useUserStore } from '@/stores/user'
import { t } from '@/locale'
import FloatingTabBar from '@/components/FloatingTabBar.vue'

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
  photo: '', // base64 or temp file path for display
  photoPath: '', // original temp file path for upload
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
    MONTHLY: 'linear-gradient(135deg, #6D5934, #A78E70)',
    QUARTERLY: 'linear-gradient(135deg, #584219, #6D5934)',
    YEARLY: 'linear-gradient(135deg, #3F2F10, #584219)',
  }
  return map[currentCard.value.type] || 'linear-gradient(135deg, #3F2F10, #584219)'
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
  // 商品接口需登录态，未登录时不调用（避免 401），页面保留默认展示
  if (!uni.getStorageSync('token')) return
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
      confirmColor: '#584219',
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

/** 选择并读取个人照片（用于线下签到核验） */
function choosePhoto() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res: any) => {
      const path = res.tempFilePaths && res.tempFilePaths[0]
      if (!path) return
      // 先存临时路径用于预览
      buyForm.value.photoPath = path
      buyForm.value.photo = path
    },
  })
}

/** 读取图片为base64（提交时调用） */
function readPhotoAsBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r: any) => resolve('data:image/jpeg;base64,' + r.data),
      fail: (err: any) => reject(err),
    })
    // #endif
    // #ifndef MP-WEIXIN
    // H5/App 环境使用 canvas 转换或直接传文件
    resolve(filePath)
    // #endif
  })
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
  // 首次开卡（无当前有效卡）必须上传个人照片；续期可选不改
  const needPhoto = !currentCard.value.type
  if (needPhoto && !buyForm.value.photoPath) {
    uni.showToast({ title: '请上传个人照片', icon: 'none' })
    return
  }
  if (submitting.value) return
  submitting.value = true
  try {
    // 读取照片base64
    let photoData: string | undefined
    if (buyForm.value.photoPath) {
      try {
        photoData = await readPhotoAsBase64(buyForm.value.photoPath)
      } catch (e) {
        uni.showToast({ title: '图片读取失败，请重新选择', icon: 'none' })
        submitting.value = false
        return
      }
    }
    const res = await purchaseMember(selectedCardInfo.value.id, photoData)
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
.page { min-height: 100vh; background: #EAE0D7; padding-bottom: 380rpx; }
.nav-bar { padding: 32rpx 32rpx 20rpx; }
.nav-title { font-size: 40rpx; color: #3F2F10; }

.card-section { padding: 8rpx 32rpx 36rpx; }
.member-card { position: relative; overflow: hidden; border-radius: 44rpx; padding: 44rpx 40rpx; color: #F7F2E9; min-height: 320rpx; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12rpx 36rpx rgba(63, 47, 16, 0.22); }
.card-glow { position: absolute; top: -140rpx; right: -100rpx; width: 360rpx; height: 360rpx; border-radius: 50%; background: radial-gradient(circle, rgba(201, 163, 92, 0.4), rgba(201, 163, 92, 0) 70%); pointer-events: none; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-brand { font-size: 36rpx; font-weight: 600; letter-spacing: 1rpx; }
.card-type { font-size: 22rpx; background: rgba(201, 163, 92, 0.24); color: #EAD9B8; padding: 6rpx 22rpx; border-radius: 999rpx; letter-spacing: 1rpx; }
.card-body { margin: 28rpx 0; }
.card-user { font-size: 38rpx; display: block; margin-bottom: 8rpx; }
.card-expire { font-size: 24rpx; opacity: 0.75; letter-spacing: 1rpx; }
.card-no { font-size: 22rpx; opacity: 0.65; letter-spacing: 6rpx; }

.section { padding: 0 32rpx 36rpx; }
.section-title { font-size: 32rpx; color: #584219; margin-bottom: 24rpx; display: block; }

.benefit-list { background: #FBF8F3; border-radius: 44rpx; padding: 8rpx 0; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.benefit-item { display: flex; align-items: center; gap: 20rpx; padding: 26rpx 32rpx; }
.benefit-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #C9A35C; flex-shrink: 0; }
.benefit-info { flex: 1; }
.benefit-name { font-size: 28rpx; font-weight: 500; color: #3F2F10; display: block; margin-bottom: 4rpx; letter-spacing: 1rpx; }
.benefit-desc { font-size: 24rpx; color: #A78E70; }

.card-options { display: flex; gap: 20rpx; }
.card-option { flex: 1; background: #FBF8F3; border-radius: 32rpx; padding: 28rpx 16rpx; text-align: center; border: 3rpx solid transparent; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.card-option.selected { border-color: #584219; background: #F4EEE6; }
.card-option:active { transform: scale(0.96); }
.option-name { font-size: 26rpx; font-weight: 600; color: #3F2F10; display: block; margin-bottom: 8rpx; letter-spacing: 1rpx; }
.option-price { font-size: 38rpx; font-weight: 600; color: #584219; display: block; margin-bottom: 4rpx; font-family: var(--font-latin); }
.option-period { font-size: 22rpx; color: #A78E70; display: block; margin-bottom: 10rpx; }
.option-discount { font-size: 20rpx; color: #8C7335; background: rgba(201, 163, 92, 0.18); padding: 4rpx 16rpx; border-radius: 999rpx; }

/* 底部购买栏：悬浮在胶囊 TabBar 上方 */
.bottom-bar { position: fixed; bottom: calc(160rpx + env(safe-area-inset-bottom)); left: 32rpx; right: 32rpx; background: #FBF8F3; display: flex; align-items: center; justify-content: space-between; padding: 24rpx 36rpx; border-radius: 999rpx; box-shadow: 0 12rpx 36rpx rgba(63, 47, 16, 0.12); z-index: 90; }
.bottom-price { font-size: 38rpx; font-weight: 600; color: #584219; display: block; font-family: var(--font-latin); }
.bottom-desc { font-size: 22rpx; color: #A78E70; }
.buy-btn { background: #584219; padding: 20rpx 60rpx; border-radius: 999rpx; }
.buy-btn:active { transform: scale(0.96); }
.buy-btn text { color: #F7F2E9; font-size: 30rpx; font-weight: 600; letter-spacing: 2rpx; }

/* 购买信息弹窗 Bottom Sheet */
.popup-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(63, 47, 16, 0.4); z-index: 999; display: flex; align-items: flex-end; justify-content: center; }
.popup-content { width: 100%; max-height: 85vh; overflow-y: auto; background: #F4EEE6; border-radius: 52rpx 52rpx 0 0; padding: 48rpx 40rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); animation: sheet-up 0.3s ease; }
@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.popup-handle { width: 72rpx; height: 8rpx; border-radius: 999rpx; background: rgba(88, 66, 25, 0.14); margin: 0 auto 32rpx; }
.popup-title { font-size: 36rpx; color: #3F2F10; display: block; margin-bottom: 8rpx; }
.popup-desc { font-size: 24rpx; color: #A78E70; display: block; margin-bottom: 36rpx; }

.form-item { margin-bottom: 32rpx; }
.form-label { font-size: 26rpx; color: #3F2F10; font-weight: 500; display: block; margin-bottom: 12rpx; letter-spacing: 1rpx; }
.required { color: #D3956E; }
.form-input { width: 100%; height: 88rpx; border: 2rpx solid rgba(88, 66, 25, 0.14); background: #FBF8F3; border-radius: 24rpx; padding: 0 28rpx; font-size: 28rpx; color: #3F2F10; box-sizing: border-box; display: flex; align-items: center; }
.picker-input { background: #FBF8F3; }
.placeholder { color: #A78E70; }

.gender-options { display: flex; gap: 20rpx; }
.gender-option { flex: 1; height: 80rpx; border: 2rpx solid rgba(88, 66, 25, 0.14); background: #FBF8F3; border-radius: 24rpx; display: flex; align-items: center; justify-content: center; font-size: 28rpx; color: #6D5934; }
.gender-option.active { border-color: #584219; background: rgba(88, 66, 25, 0.06); color: #584219; font-weight: 600; }

.popup-actions { display: flex; gap: 20rpx; margin-top: 40rpx; }
.popup-cancel { flex: 1; height: 92rpx; border: 2rpx solid #584219; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; font-size: 30rpx; color: #584219; }
.popup-confirm { flex: 2; height: 92rpx; background: #584219; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; }
.popup-confirm:active { transform: scale(0.96); }
.popup-confirm text { color: #F7F2E9; font-size: 30rpx; font-weight: 600; letter-spacing: 2rpx; }

.photo-upload { width: 200rpx; height: 200rpx; border: 2rpx dashed rgba(88, 66, 25, 0.14); background: #FBF8F3; border-radius: 24rpx; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 8rpx; }
.photo-preview { width: 200rpx; height: 200rpx; }
.photo-placeholder { text-align: center; color: #A78E70; font-size: 26rpx; }
.photo-tip { font-size: 22rpx; color: #A78E70; }
</style>
