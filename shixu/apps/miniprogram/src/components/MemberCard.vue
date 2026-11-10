<template>
  <!--
    会员卡：一张卡承载身份、本年已省、三业态权益与续费。
    不做翻面：卡脚是稳稳的一条，左侧看明细、右侧拉开权益，
    所有内容都在文档流里，不会有元素互相压住。
  -->
  <view class="bmc" :class="{ 'is-open': open, 'is-dim': !active }">
    <view class="bmc-main">
      <view class="bmc-row1">
        <text class="bmc-eyebrow">FULL YU MEMBER</text>
        <text class="bmc-scope">{{ tt('全业态通用', 'All locations') }}</text>
        <text class="bmc-state" :class="{ 'is-warn': expiring }">{{ stateText }}</text>
      </view>
      <text class="bmc-name serif">{{ tt('Full愈会员卡', 'Full Yuk member card') }}</text>
      <view class="bmc-meta">
        <text class="bmc-who">{{ whoLine }}</text>
        <text class="bmc-valid">{{ validLine }}</text>
      </view>
    </view>

    <!-- 卡脚：两个互不重叠的点击区 -->
    <view class="bmc-foot" :class="{ 'is-warn': expiring }">
      <view class="bmc-cell bmc-saved" role="button" @click="onSaved">
        <text class="bmc-lab">{{ active ? tt('本年已省', 'Saved this year') : tt('开卡', 'Join') }}</text>
        <text class="bmc-amt serif">¥{{ active ? formatYuan(savedCents) : formatYuan(annualPrice) }}</text>
        <text class="bmc-more">{{ active ? tt('明细 ›', 'Details ›') : tt('起 ›', 'from ›') }}</text>
      </view>
      <view class="bmc-cell bmc-toggle" role="button" @click="open = !open">
        <text>{{ active ? (expiring ? tt('去续费', 'Renew') : tt('权益与续费', 'Benefits & renewal')) : tt('查看权益', 'See benefits') }}</text>
        <text class="bmc-car" :class="{ 'is-up': open }">⌄</text>
      </view>
    </view>

    <!-- 展开区：往下长，把下面的内容推下去 -->
    <view class="bmc-drawer">
      <view class="bmc-drawer-in">
        <text class="bmc-dhead">{{ tt('三业态权益 · 全门店可用', 'Benefits across three stores · all locations') }}</text>
        <view v-for="item in benefitRows" :key="item.business + item.title" class="bmc-ben">
          <text class="bmc-brand">{{ brandName(item.business) }}</text>
          <view class="bmc-ben-body">
            <text class="bmc-ben-t">{{ item.title }}</text>
            <text v-if="item.desc" class="bmc-ben-d">{{ item.desc }}</text>
          </view>
          <text v-if="item.business === homeBusiness" class="bmc-here">{{ tt('本店', 'Here') }}</text>
        </view>

        <button hover-class="none" class="bmc-renew" @click="$emit('purchase')">
          {{ active ? tt('续费', 'Renew') : tt('开通 Full愈会员卡', 'Join Full Yuk member card') }}
        </button>
        <text class="bmc-note">{{ active ? tt('续费从到期日往后接；', 'Renewal starts when your current term ends. ') : '' }}{{ tt('7 天内可自助退款，已领年卡礼按价值扣除。', 'Self-service refund within 7 days; received annual gifts are deducted at value.') }}</text>
        <view class="bmc-link" @click="$emit('rules')">
          <text>{{ tt('会员权益与退款规则', 'Member benefits & refund rules') }}</text>
          <text class="bmc-link-tail">{{ tt('查看 ›', 'View ›') }}</text>
        </view>
        <view v-if="!active" class="bmc-link" @click="$emit('gift')">
          <text>{{ tt('有会员码？点此兑换', 'Have a member code? Redeem here') }}</text>
          <text class="bmc-link-tail">›</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { CARD_PRODUCTS, cardStateLabel, formatDate, formatYuan } from '@/lib/brandMember';
import { useLocale } from '@/lib/useLocale';

const props = defineProps({
  data: { type: Object, required: true },
  active: { type: Boolean, default: false }
});
const emit = defineEmits(['purchase', 'detail', 'rules', 'gift']);

const { locale, tt } = useLocale();
const open = ref(false);
const homeBusiness = 'teahour';
const BRAND_LABEL = { teahour: '时叙', retreat: '轻疗', presence: '在场' };
const STATE_EN = {
  ACTIVE: 'Active',
  EXPIRING: 'Expiring',
  PENDING: 'Starts soon',
  EXPIRED: 'Expired',
  NONE: 'Not joined',
  REFUND_LOCKED: 'Refund pending',
  REFUNDED: 'Refunded'
};

const card = computed(() => (props.data && props.data.card) || {});
const expiring = computed(() => card.value.state === 'EXPIRING');
const stateText = computed(() => {
  if (!props.active) return tt('未开通', 'Not joined');
  return locale.value === 'en' ? STATE_EN[card.value.state] || STATE_EN.NONE : cardStateLabel(card.value.state);
});
const savedCents = computed(() => (props.data && props.data.savedCents) || 0);

const whoLine = computed(() => {
  const member = (props.data && props.data.member) || {};
  return props.active
    ? `${member.name || ''} · ${member.memberNo || ''}`
    : tt('时叙喝茶 · 在场上课 · 轻疗放松', 'Tea at 时叙 · classes at 在场 · rest at 轻疗');
});

const validLine = computed(() => {
  if (!props.active) return tt('一卡通用 · 全门店可用', 'One card · all locations');
  const until = card.value.validUntil ? formatDate(card.value.validUntil) : '';
  const days = card.value.remainingDays;
  // 剩余天数只在临期露出来，平时只报到期日，避免天天看到数字变钝。
  const tail = expiring.value && days ? tt(` · 剩 ${days} 天`, ` · ${days} days left`) : '';
  return tt(`至 ${until} 到期${tail} · 全门店可用`, `Valid until ${until}${tail} · all locations`);
});

const annualPrice = computed(() => {
  const rows = (props.data && props.data.products) || [];
  const hit = rows.find((item) => item.code === 'FY_ANNUAL');
  return (hit || CARD_PRODUCTS[1] || { priceCents: 29900 }).priceCents;
});

const benefitRows = computed(() => {
  const rows = (props.data && props.data.benefits) || [];
  if (rows.length) return rows;
  return [
    { business: 'teahour', title: '会员茶饮权益', desc: '具体内容以门店公示为准' },
    { business: 'retreat', title: '项目会员价', desc: '提前一天预约享会员价，当日另计' },
    { business: 'presence', title: '优先排位与课程阶梯价', desc: '热门课程优先排位' }
  ];
});

function brandName(business) {
  return BRAND_LABEL[business] || '全业态';
}

function onSaved() {
  // 未开通没有历史节省可看，直接展开权益，别弹一个空明细。
  if (!props.active) {
    open.value = true;
    return;
  }
  emit('detail');
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
  max-height: 460px;
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
  width: 28px;
  padding-top: 1px;
  font-size: 9.5px;
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
.bmc-renew {
  width: 100%;
  margin-top: 10px;
  padding: 9px;
  border-radius: 10px;
  background: #f7f1e7;
  color: #3a2a1e;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.2;
}
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