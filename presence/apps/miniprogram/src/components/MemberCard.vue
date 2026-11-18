<template>
  <!--
    会员卡：一张卡承载身份、本年已省、全平台权益与续费。
    不做翻面：卡脚是稳稳的一条，左侧报账、右侧拉开权益与卡型，
    所有内容都在文档流里，不会有元素互相压住。
  -->
  <view class="bmc" :class="{ 'is-open': open, 'is-dim': !active }">
    <view class="bmc-main">
      <view class="bmc-row1">
        <text class="bmc-eyebrow">FULL YU MEMBER</text>
        <text class="bmc-scope">{{ tr('全平台通用', 'All locations') }}</text>
        <text class="bmc-state" :class="{ 'is-warn': expiring }">{{ stateText }}</text>
      </view>
      <text class="bmc-name serif">{{ nameLine }}</text>
      <view class="bmc-meta">
        <text class="bmc-who">{{ whoLine }}</text>
        <text class="bmc-valid">{{ validLine }}</text>
      </view>
      <text v-if="renewalText" class="bmc-renewal">{{ renewalText }}</text>
    </view>

    <!-- 卡脚：左侧报账，右侧拉开抽屉 -->
    <view class="bmc-foot" :class="{ 'is-warn': expiring }">
      <view class="bmc-cell bmc-saved">
        <text class="bmc-lab">{{ active ? tr('本年已省', 'Saved this year') : tr('开卡', 'Join') }}</text>
        <text class="bmc-amt serif">{{ active ? '¥' + formatYuan(savedCents) : entry ? '¥' + formatYuan(entry.amountCents) : '—' }}</text>
        <text v-if="!active && entry && entry.from" class="bmc-more">{{ tr('起', 'from') }}</text>
      </view>
      <view class="bmc-cell bmc-toggle" role="button" @tap="open = !open">
        <text>{{ footText }}</text>
        <text class="bmc-car" :class="{ 'is-up': open }">⌄</text>
      </view>
    </view>

    <!-- 展开区：往下长，把下面的内容推下去 -->
    <view class="bmc-drawer">
      <view class="bmc-drawer-in">
        <view v-if="benefitRows.length" class="bmc-benefits">
          <text class="bmc-dhead">{{ tr('全平台权益 · 全门店可用', 'Platform-wide benefits · all locations') }}</text>
          <view v-for="item in benefitRows" :key="item.business + item.title" class="bmc-ben">
            <text class="bmc-brand">{{ brandName(item.business) }}</text>
            <view class="bmc-ben-body">
              <text class="bmc-ben-t">{{ item.title }}</text>
              <text v-if="item.desc" class="bmc-ben-d">{{ item.desc }}</text>
            </view>
            <text v-if="item.business === homeBusiness" class="bmc-here">{{ tr('本店', 'Here') }}</text>
          </view>
        </view>

        <view v-if="benefitRows.length" class="bmc-sep"></view>
        <text class="bmc-note">{{ active ? tr('续费从到期日往后接；', 'Renewal starts when your current term ends. ') : '' }}{{ tr('7 天内可自助退款，已领会员礼按价值扣除。', 'Self-service refund within 7 days; gifts already collected are deducted at value.') }}</text>
        <text v-if="!active && purchaseMode !== 'mock'" class="bmc-note">{{ tr('线上支付接入中，暂不能在线开通。', 'Online payment is not live yet, so joining here is unavailable.') }}</text>
        <view class="bmc-link" @tap="$emit('rules')">
          <text>{{ tr('会员权益与退款规则', 'Member benefits & refund rules') }}</text>
          <text class="bmc-link-tail">{{ tr('查看 ›', 'View ›') }}</text>
        </view>
        <view v-if="!active" class="bmc-link" @tap="$emit('gift')">
          <text>{{ tr('有会员码？点此兑换', 'Have a member code? Redeem here') }}</text>
          <text class="bmc-link-tail">›</text>
        </view>
        <!-- 续费/开通统一收进抽屉：点开是选时长的确认弹窗，卡外不再重复放按钮 -->
        <button hover-class="none" class="bmc-renew" @tap.stop="$emit('renew')">
          {{ active ? tr('续费 Full愈大会员', 'Renew Full Yu Membership') : tr('开通 Full愈大会员', 'Join Full Yu Membership') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { cardStateLabel, formatDate, formatYuan, type BrandCardProduct, type BrandMemberData } from '@/api/brandMember'
import { isEnglish, tr } from '@/locale'

const props = defineProps<{
  data: BrandMemberData
  active: boolean
  products: BrandCardProduct[]
  purchaseMode: string
}>()
defineEmits<{ (e: 'rules'): void; (e: 'gift'): void; (e: 'renew'): void }>()

const open = ref(false)
/** 当前门店＝在场；权益行上标出「本店」。 */
const homeBusiness = 'presence'
const PLAN_EN: Record<string, string> = {
  FY_MONTH: 'Monthly card',
  FY_ANNUAL: 'Annual card'
}
/** 卡面大字用产品全名，英文界面下按已知全名翻译。 */
const PLAN_NAME_EN: Record<string, string> = {
  'Full愈大会员': 'Full Yu Member',
  'Full愈月会员': 'Full Yu Monthly Member'
}

const card = computed(() => props.data?.card || ({} as BrandMemberData['card']))
const expiring = computed(() => card.value.state === 'EXPIRING')
const savedCents = computed(() => props.data?.savedCents || 0)
const stateText = computed(() => (props.active ? cardStateLabel(card.value.state) : tr('未开通', 'Not active')))

const nameLine = computed(() => {
  const name = props.active ? card.value.productName : ''
  const fallback = name || tr('Full愈大会员', 'Full Yu Member')
  return isEnglish() ? PLAN_NAME_EN[fallback] || (card.value.productCode ? PLAN_EN[card.value.productCode] : '') || fallback : fallback
})
const whoLine = computed(() => {
  const member = props.data?.member
  return props.active && member
    ? `${member.name || ''} · ${member.memberNo || ''}`
    : tr('在场上课 · 时叙喝茶 · 轻疗放松', 'Classes at Presence · tea at Teahour · rest at Retreat')
})
const validLine = computed(() => {
  if (!props.active) return tr('一卡通用 · 三店均可用', 'One card · valid at all three stores')
  const until = card.value.validUntil ? formatDate(card.value.validUntil) : ''
  const days = card.value.remainingDays
  // 剩余天数只在临期露出来，平时只报到期日，避免天天看到数字变钝。
  const tail = expiring.value && days ? tr(` · 还剩 ${days} 天`, ` · ${days} days left`) : ''
  return tr(`有效期至 ${until}${tail} · 三店通用`, `Valid until ${until}${tail} · all three stores`)
})
/** 续费提醒的金额与文案以 CRM 为准，前端不自己推算；CRM 没给时只在临期补一句天数。 */
const renewalText = computed(() => {
  const value = props.data
  if (!value?.card) return ''
  if (value.renewal?.show && value.renewal.text) return value.renewal.text
  if (value.card.state === 'EXPIRING' && value.card.remainingDays) {
    return tr(`还有 ${value.card.remainingDays} 天到期，续费后从当前有效期结束日开始计算。`, `${value.card.remainingDays} days left. Renewal starts when the current term ends.`)
  }
  return ''
})
/**
 * 卡脚入口价：只从 CRM 目录取最低一档（90 天 ¥99 与 365 天 ¥365 并存时报 ¥99），
 * 「起」只在多档时标；目录没拿到就显示占位符，不写死价格。
 */
const entry = computed<{ amountCents: number; from: boolean } | null>(() => {
  const rows = (props.products || []).filter(
    (item) => item && item.priceCents != null && Number.isFinite(Number(item.priceCents))
  )
  if (!rows.length) return null
  const cheapest = rows.reduce((low, item) => (Number(item.priceCents) < Number(low.priceCents) ? item : low))
  return { amountCents: Number(cheapest.priceCents), from: rows.length > 1 }
})
const footText = computed(() =>
  props.active ? tr('权益与续费', 'Benefits & renewal') : tr('查看权益', 'See benefits')
)
/** 权益行只认 CRM 文案并原样展示：后台改什么，三端就显示什么。 */
const benefitRows = computed(() => props.data?.benefits || [])

function brandName(business: string) {
  return ({ teahour: tr('时叙', 'Teahour'), presence: tr('在场', 'Presence'), retreat: tr('轻疗', 'Retreat') } as Record<string, string>)[business] || tr('全平台', 'All')
}
</script>

<style scoped>
.bmc {
  border-radius: 22px;
  overflow: hidden;
  color: #f7f1e7;
  background:
    radial-gradient(120% 90% at 100% 0%, rgba(232, 197, 141, 0.18) 0%, rgba(232, 197, 141, 0) 58%),
    linear-gradient(150deg, #4b3828 0%, #654633 55%, #75543c 100%);
  box-shadow: 0 14px 30px rgba(53, 47, 43, 0.2);
}
.bmc-main {
  padding: 17px 18px 14px;
}
.bmc-row1 {
  display: flex;
  align-items: center;
  gap: 7px;
}
.bmc-eyebrow {
  font-size: 8px;
  letter-spacing: 0.15em;
  opacity: 0.6;
  white-space: nowrap;
}
.bmc-scope {
  font-size: 8px;
  letter-spacing: 0.03em;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(247, 241, 231, 0.13);
  border: 1px solid rgba(247, 241, 231, 0.2);
  white-space: nowrap;
}
.bmc-state {
  margin-left: auto;
  flex: none;
  font-size: 8.5px;
  letter-spacing: 0.08em;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(247, 241, 231, 0.3);
  white-space: nowrap;
}
.bmc-state.is-warn {
  border-color: rgba(232, 197, 141, 0.7);
  color: #f4d9ae;
  background: rgba(232, 197, 141, 0.14);
}
.bmc-name {
  display: block;
  margin-top: 10px;
  font-size: 21px;
  line-height: 1.15;
  letter-spacing: 0.02em;
}
.bmc-meta {
  margin-top: 8px;
}
.bmc-who {
  display: block;
  font-size: 9.5px;
  line-height: 1.5;
  opacity: 0.66;
}
.bmc-valid {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  line-height: 1.5;
  opacity: 0.78;
}
.bmc-renewal {
  display: block;
  margin-top: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  border-left: 2px solid #e8c58d;
  background: rgba(232, 197, 141, 0.12);
  font-size: 9.5px;
  line-height: 1.5;
  color: #f4d9ae;
}

/* 卡脚：同色同体，只一道细线分隔 */
.bmc-foot {
  display: flex;
  align-items: stretch;
  border-top: 1px solid rgba(247, 241, 231, 0.15);
  background: rgba(247, 241, 231, 0.05);
}
.bmc-foot.is-warn {
  background: rgba(232, 197, 141, 0.12);
}
.bmc-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  min-width: 0;
}
.bmc-saved {
  flex: 1;
}
.bmc-lab {
  font-size: 9px;
  opacity: 0.6;
  white-space: nowrap;
}
.bmc-amt {
  font-size: 14px;
  line-height: 1;
  white-space: nowrap;
}
.bmc-more {
  font-size: 8.5px;
  opacity: 0.5;
  white-space: nowrap;
}
.bmc-toggle {
  flex: none;
  border-left: 1px solid rgba(247, 241, 231, 0.15);
  font-size: 10px;
  letter-spacing: 0.03em;
  color: #e8c58d;
  white-space: nowrap;
}
.bmc-foot.is-warn .bmc-toggle {
  color: #f4d9ae;
  font-weight: 600;
}
.bmc-car {
  display: inline-block;
  font-size: 10px;
  transition: transform 0.25s ease;
}
.bmc-car.is-up {
  transform: rotate(180deg);
}

/* 展开区：max-height 过渡，微信与安卓都比 grid-template-rows 动画稳 */
.bmc-drawer {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.28s ease;
}
.bmc.is-open .bmc-drawer {
  max-height: 720px;
}
.bmc-drawer-in {
  padding: 2px 18px 14px;
  border-top: 1px solid rgba(247, 241, 231, 0.13);
}
.bmc-dhead {
  display: block;
  margin: 10px 0 8px;
  font-size: 8px;
  letter-spacing: 0.14em;
  opacity: 0.55;
}
.bmc-dhead.tight {
  margin: 0;
}
.bmc-ben {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 0;
}
.bmc-ben + .bmc-ben {
  border-top: 1px solid rgba(247, 241, 231, 0.08);
}
.bmc-brand {
  flex: none;
  width: 34px;
  padding-top: 1px;
  font-size: 9px;
  letter-spacing: 0.02em;
  color: #f0dfc4;
}
.bmc-ben-body {
  flex: 1;
  min-width: 0;
}
.bmc-ben-t {
  display: block;
  font-size: 10.5px;
  line-height: 1.4;
}
.bmc-ben-d {
  display: block;
  margin-top: 2px;
  font-size: 8.5px;
  line-height: 1.4;
  opacity: 0.48;
}
.bmc-here {
  flex: none;
  margin-top: 1px;
  font-size: 7.5px;
  letter-spacing: 0.02em;
  color: #5b3d22;
  background: #e8c58d;
  border-radius: 999px;
  padding: 1px 5px;
}

.bmc-sep {
  height: 1px;
  margin: 10px 0;
  background: rgba(247, 241, 231, 0.13);
}
.bmc-renew-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.bmc-renew-tail {
  flex: none;
  font-size: 8px;
  opacity: 0.45;
}
.bmc-plans {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.bmc-plan {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid rgba(247, 241, 231, 0.2);
  background: rgba(247, 241, 231, 0.06);
}
.bmc-plan.is-on {
  border-color: #e8c58d;
  background: rgba(232, 197, 141, 0.14);
}
.bmc-plan-name {
  display: block;
  font-size: 9px;
  opacity: 0.62;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bmc-plan-price {
  display: block;
  margin-top: 2px;
  font-size: 15px;
  line-height: 1.1;
}
.bmc-plan-period {
  display: block;
  font-size: 8.5px;
  opacity: 0.45;
}
.bmc-renew {
  width: 100%;
  margin-top: 10px;
  padding: 9px;
  border: 0;
  border-radius: 10px;
  background: #f7f1e7;
  color: #3a2a1e;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.2;
}
.bmc-renew::after { border: 0; }
.bmc-note {
  display: block;
  margin-top: 7px;
  font-size: 8.5px;
  line-height: 1.5;
  opacity: 0.42;
}
.bmc-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 9px;
  font-size: 9px;
  letter-spacing: 0.02em;
  color: rgba(247, 241, 231, 0.62);
}
.bmc-link-tail {
  opacity: 0.8;
}
</style>