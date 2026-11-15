<template>
  <BottomSheet :show="show" :title="active ? tr('续费 Full愈大会员', 'Renew Full Yu Member') : tr('开通 Full愈大会员', 'Join Full Yu Member')" :busy="paying" @close="close">
    <view v-if="member" class="confirm">
      <text class="sheet-desc renew-hint">{{ active ? tr('同一张卡，只选时长，续费从到期日往后接。', 'One card, pick a term. The new term starts when your current one ends.') : tr('同一张卡，只选时长，付款后立即生效。', 'One card, pick a term. It starts right after payment.') }}</text>
      <view class="renew-plans">
        <view
          v-for="product in products"
          :key="product.code"
          class="renew-plan"
          :class="{ 'is-on': product.code === selectedCode }"
          role="button"
          @tap="selectedCode = product.code"
        >
          <text class="renew-plan-name">{{ product.name }}</text>
          <text class="renew-plan-price serif">¥{{ formatYuan(product.priceCents) }}</text>
          <text class="renew-plan-period">{{ productPeriod(product) }}</text>
        </view>
      </view>
      <text v-if="!products.length" class="sheet-desc">{{ tr('卡型加载失败，请稍后重试。', 'Could not load the plans. Please try again later.') }}</text>
      <view class="confirm-row"><text>{{ tr('账户', 'Account') }}</text><text>{{ member.member.name }} · {{ member.member.phoneMasked }}</text></view>
      <view class="confirm-row"><text>{{ tr('包含', 'Includes') }}</text><text>{{ tr('三店会员价 · 愈行之旅', 'Member prices · Journey game') }}</text></view>
      <view class="confirm-row"><text>{{ tr('卡类型', 'Card type') }}</text><text>{{ tr('服务权益卡（非储值，不可提现）', 'Service-benefit card (no stored balance)') }}</text></view>
      <view class="confirm-row"><text>{{ tr('收款方', 'Paid to') }}</text><text>{{ tr('在场（本小程序）', 'Presence (this mini program)') }}</text></view>
      <view v-if="isMock" class="mock-note">{{ tr('本地联调：不会发起真实扣款，开通只更新本页状态。', 'Local mock: no real payment. Joining only updates this page state.') }}</view>
      <view v-else class="mock-note">{{ tr('线上支付接入中，本页暂不会发起扣款；已购卡权益与愈行之旅不受影响。', 'Online payment is not live yet. This page will not charge you; your card benefits and the journey game are unaffected.') }}</view>
      <button class="btn primary full" :disabled="paying || !selectedProduct" @tap="confirmPurchase">
        {{ paying ? tr('处理中…', 'Processing…') : selectedProduct ? (active ? tr('确认续费', 'Confirm renewal') : tr('确认开通', 'Confirm')) + ' ¥' + formatYuan(selectedProduct.priceCents) : tr('卡型加载中', 'Loading plans') }}
      </button>
      <button class="text-btn" @tap="close">{{ tr('取消', 'Cancel') }}</button>
    </view>
  </BottomSheet>
</template>

<script setup lang="ts">
/**
 * 会员卡开通 / 续费确认层（品牌身份页与首页共用）。
 *
 * 卡型与金额只认 CRM 目录；支付通道未接入时如实提示，不提供绕过后台的开卡路径。
 */
import { computed, ref } from 'vue'
import BottomSheet from './BottomSheet.vue'
import { tr } from '@/locale'
import {
  formatYuan,
  isMock,
  issueBrandCard,
  purchaseMode,
  quoteBrandCard,
  type BrandCardProduct,
  type BrandMemberData,
} from '@/api/brandMember'

const props = defineProps<{
  show: boolean
  member: BrandMemberData | null
  products: BrandCardProduct[]
  active: boolean
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'paid'): void }>()

const paying = ref(false)
const selectedCode = ref('FY_ANNUAL')
const selectedProduct = computed<BrandCardProduct | undefined>(
  () => props.products.find((item) => item.code === selectedCode.value) || props.products.find((item) => item.code === 'FY_ANNUAL') || props.products[0]
)

/** 商品目录来自 CRM；缺 period 时用有效天数说明，避免空白。 */
function productPeriod(product: BrandCardProduct) {
  return product.period || tr(`${product.validDays} 天`, `${product.validDays} days`)
}

function close() {
  if (paying.value) return
  emit('close')
}

async function confirmPurchase() {
  if (paying.value) return
  if (purchaseMode !== 'mock') {
    // 支付通道接入前不进入扣款流程，也不允许跳过后台直接开卡。
    uni.showToast({ title: tr('线上支付接入中，暂不能在此开通', 'Online payment is not live yet. Joining is unavailable here.'), icon: 'none' })
    return
  }
  const product = selectedProduct.value
  if (!product) {
    uni.showToast({ title: tr('卡型加载失败，请稍后重试', 'Could not load the plans. Please try again.'), icon: 'none' })
    return
  }
  paying.value = true
  try {
    const quote = await quoteBrandCard(product.code)
    await issueBrandCard({
      quote,
      orderRef: `presence:brand-card:${Date.now()}`,
      paidCents: quote.priceCents
    })
    emit('close')
    emit('paid')
    uni.showToast({ title: isMock ? tr('已开通（本地联调）', 'Joined (local mock)') : tr('已开通', 'Joined'), icon: 'none' })
  } catch {
    uni.showToast({ title: tr('开通失败，请稍后重试', 'Could not join. Please retry.'), icon: 'none' })
  } finally {
    paying.value = false
  }
}
</script>

<style scoped>
.sheet-desc { display: block; font-size: 23rpx; line-height: 1.7; color: var(--c-muted); }
.btn { min-height: 84rpx; padding: 0 32rpx; border-radius: 999rpx; border: 1rpx solid var(--line-soft); background: var(--c-card); color: var(--c-ink); font-size: 26rpx; display: flex; align-items: center; justify-content: center; line-height: 1.4; }
.btn.primary { background: var(--c-primary); border-color: var(--c-primary); color: var(--c-rice); }
.btn.full { width: 100%; margin-top: 20rpx; }
.btn[disabled] { opacity: .45; }
.confirm { padding-bottom: 8rpx; }
.renew-hint { margin-bottom: 20rpx; }
.renew-plans { display: flex; gap: 16rpx; margin-bottom: 20rpx; }
.renew-plan { flex: 1; min-width: 0; padding: 20rpx; border-radius: 16rpx; border: 2rpx solid var(--line-soft); display: flex; flex-direction: column; gap: 6rpx; }
.renew-plan.is-on { border-color: var(--c-ink); background: rgba(0, 0, 0, 0.03); }
.renew-plan-name { font-size: 23rpx; color: var(--c-muted); }
.renew-plan-price { font-size: 36rpx; }
.renew-plan-period { font-size: 20rpx; color: var(--c-muted); }
.confirm-row { display: flex; justify-content: space-between; gap: 20rpx; padding: 18rpx 0; border-bottom: 1rpx solid var(--line-soft); font-size: 23rpx; line-height: 1.6; }
.confirm-row text:last-child { color: var(--c-muted); text-align: right; }
.mock-note { margin-top: 18rpx; padding: 16rpx 18rpx; border-radius: 16rpx; background: var(--c-card-2); font-size: 20rpx; line-height: 1.6; color: var(--c-muted); }
.text-btn { width: 100%; min-height: 72rpx; margin-top: 6rpx; background: transparent; font-size: 23rpx; color: var(--c-muted); }
</style>