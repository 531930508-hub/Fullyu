<template>
  <view class="bm-page">
    <view :style="{ height: statusBarHeight + 'px' }" />
    <view class="bm-nav">
      <button hover-class="none" class="bm-back" aria-label="返回" @click="goBack">
        <AppIcon name="chevronLeft" :size="20" />
      </button>
      <text class="bm-nav-title">Full愈年卡</text>
      <text v-if="isMock" class="bm-dev">合成数据</text>
      <view v-else class="bm-nav-tail" />
    </view>

    <scroll-view scroll-y class="bm-scroll">
      <view class="bm-wrap">
        <view v-if="loading" class="bm-loading">
          <view class="bm-spinner" />
          <text>正在读取会员身份</text>
        </view>

        <view v-else-if="error" class="bm-error">
          <text class="bm-error-title">会员信息暂时连不上</text>
          <text class="bm-error-desc">{{ error }}</text>
          <button hover-class="none" class="bm-btn primary" @click="load">重新加载</button>
        </view>

        <template v-else-if="data">
          <!-- 身份卡 -->
          <view v-if="active" class="bm-identity">
            <view class="bm-identity-top">
              <view>
                <text class="bm-eyebrow">FULL YU ANNUAL MEMBER</text>
                <text class="bm-identity-name serif">{{ data.card.productName }}</text>
              </view>
              <view class="bm-state">{{ stateLabel }}</view>
            </view>
            <text class="bm-identity-sub">
              {{ data.member.name }} · {{ data.member.memberNo }}
            </text>
            <text class="bm-identity-valid">
              有效期至 {{ formatDate(data.card.validUntil) }} · 还有 {{ data.card.remainingDays }} 天
            </text>
            <view class="bm-identity-foot">
              <text>{{ data.card.soldByName }}开通 · 时叙、在场、轻疗三店通用</text>
              <text class="bm-here">本店：时叙</text>
            </view>
            <view v-if="expiring" class="bm-renew-tip">还有 {{ data.card.remainingDays }} 天到期，续费后从当前有效期结束日开始计算。</view>
          </view>

          <view v-else class="bm-join">
            <text class="bm-eyebrow">FULL YU ANNUAL MEMBER</text>
            <text class="bm-join-title serif">一张卡，三店通用</text>
            <text class="bm-join-desc">时叙喝茶、在场上课、轻疗放松，走到哪都认这张卡。积分也只有一个账户。</text>
            <view class="bm-join-price">
              <text class="bm-price">¥{{ formatYuan(annual.priceCents) }}</text>
              <text class="bm-price-unit">/ 年</text>
              <text class="bm-price-alt">月卡 ¥{{ formatYuan(month.priceCents) }}</text>
            </view>
            <button hover-class="none" class="bm-btn primary full" @click="openPurchase('FY_ANNUAL')">开通 Full愈年卡</button>
            <text class="bm-join-note">开通后可玩「愈行之旅」，消费得骰子。</text>
            <text class="bm-join-rule">服务权益卡 · 不含储值余额，不可提现</text>
            <text v-if="purchaseMode !== 'mock'" class="bm-fine">线上支付接入中，暂不能在时叙在线开通；已购卡权益与愈行之旅不受影响。</text>
          </view>

          <!-- 资产 -->
          <view class="bm-wallet">
            <view class="bm-wallet-item">
              <text class="bm-wallet-value">{{ data.points.balance }}</text>
              <text class="bm-wallet-label">积分 · 三店通用</text>
            </view>
            <view class="bm-wallet-item">
              <text class="bm-wallet-value">{{ data.dice.balance }}</text>
              <text class="bm-wallet-label">骰子</text>
            </view>
            <view class="bm-wallet-item">
              <text class="bm-wallet-value">{{ data.prizes.pending }}</text>
              <text class="bm-wallet-label">待领礼物</text>
            </view>
          </view>
          <view v-if="data.points.expiring" class="bm-points-note">
            {{ data.points.expiring }} 积分将于 {{ formatDate(data.points.expireAt) }} 到期
            <text class="bm-points-spend">时叙本期只展示积分，暂不抵扣</text>
          </view>

          <!-- 三店权益 -->
          <view class="bm-section">
            <view class="bm-section-head">
              <text class="bm-section-title serif">三店权益</text>
              <text class="bm-earned">本年已省 ¥{{ formatYuan(data.savedCents) }}</text>
            </view>
            <view v-for="item in data.benefits" :key="item.business" class="bm-benefit">
              <view class="bm-benefit-mark" :class="`is-${item.business}`">{{ businessShort(item.business) }}</view>
              <view class="bm-benefit-copy">
                <text class="bm-benefit-title">{{ item.title }}</text>
                <text class="bm-benefit-desc">{{ item.desc }}</text>
              </view>
              <text v-if="item.business === 'teahour'" class="bm-benefit-here">本店</text>
            </view>
            <text class="bm-fine">权益按业务配置，开卡时锁定；适用门店与商品以门店公示为准，不与券、积分抵扣叠加，系统按最优价结算。</text>
          </view>

          <!-- 愈行之旅 -->
          <view class="bm-section bm-journey">
            <view class="bm-section-head">
              <view>
                <text class="bm-section-title serif">愈行之旅</text>
                <text class="bm-journey-sub">消费得骰子，走到哪都有小惊喜</text>
              </view>
              <view class="bm-dice"><text class="bm-dice-num">{{ data.dice.balance }}</text><text>颗</text></view>
            </view>
            <view class="bm-board">
              <view v-for="(stop, index) in boardStops" :key="stop" class="bm-stop" :class="{ done: index < 3, current: index === 3 }">
                <view class="bm-stop-dot">{{ index + 1 }}</view>
                <text class="bm-stop-name">{{ stop }}</text>
              </view>
            </view>
            <view class="bm-journey-foot">
              <text v-if="active" class="bm-journey-next">下一份礼物：{{ nextPrize }}</text>
              <text v-else class="bm-journey-next">开通年卡后即可开始</text>
              <button hover-class="none" class="bm-btn compact" :disabled="!active" @click="openGame">
                {{ active ? '去掷骰子' : '未解锁' }}
              </button>
            </view>
            <text v-if="!gameReady" class="bm-fine">开通有效 Full愈卡后即可进入愈行之旅。</text>
          </view>

          <!-- 续费 / 购买 -->
          <view class="bm-section">
            <view class="bm-section-head">
              <text class="bm-section-title serif">{{ active ? '续费' : '开通' }}</text>
              <text class="bm-earned">{{ purchaseMode === 'mock' ? '本单由时叙收款' : '线上支付接入中' }}</text>
            </view>
            <view class="bm-products">
              <button
                v-for="product in products"
                :key="product.code"
                hover-class="none"
                class="bm-product"
                :class="{ selected: selectedCode === product.code }"
                @click="selectedCode = product.code"
              >
                <text class="bm-product-name">{{ product.name }}</text>
                <text class="bm-product-price serif">¥{{ formatYuan(product.priceCents) }}</text>
                <text class="bm-product-period">{{ productPeriod(product) }}</text>
              </button>
            </view>
            <button hover-class="none" class="bm-btn primary full" @click="openPurchase(selectedCode)">
              {{ active ? '续费' : '开通' }} {{ selectedProduct.name }} · ¥{{ formatYuan(selectedProduct.priceCents) }}
            </button>
            <text class="bm-fine">开卡后 7 天内且三店均未使用权益可全额退；之后按实付减已省计算，最低为 0。</text>
          </view>

          <!-- 规则摘要：会员卡是服务权益，不是储值，避免只看到「三店通用」就误以为是余额卡 -->
          <view class="bm-section bm-rules">
            <view class="bm-section-head">
              <text class="bm-section-title serif">会员规则</text>
              <text class="bm-earned">权益卡 · 非储值</text>
            </view>
            <text class="bm-rule-line">年卡 365 天、月卡 30 天，续费从当前有效期结束次日起接续</text>
            <text class="bm-rule-line">权益以开卡配置、门店公示与结算页为准，不与券、积分、活动价叠加</text>
            <text class="bm-rule-line">积分三店共用一个账户，不可购买、提现或转让，按批次到期</text>
            <text class="bm-rule-line">卡由开通页注明的业务收款并开票，三店权益由各业务分别提供</text>
            <button hover-class="none" class="bm-text-btn" @click="openRules">查看完整会员权益与退款规则</button>
          </view>

          <view class="bm-foot">
            <text>放松有道　自在生活</text>
            <text class="bm-foot-sub">Full愈 · 时叙</text>
          </view>
        </template>
      </view>
    </scroll-view>

    <BottomSheet v-if="purchaseOpen" title="确认开通" @close="closePurchase">
      <view class="bm-confirm">
        <view class="bm-confirm-head">
          <view>
            <text class="bm-confirm-name serif">{{ selectedProduct.name }}</text>
            <text class="bm-confirm-desc">{{ selectedProduct.period }} · 三店通用</text>
          </view>
          <text class="bm-confirm-price serif">¥{{ formatYuan(selectedProduct.priceCents) }}</text>
        </view>
        <view class="bm-confirm-row"><text>开卡账户</text><text>{{ data.member.name }} · {{ data.member.phoneMasked }}</text></view>
        <view class="bm-confirm-row"><text>包含</text><text>三店会员价 · 统一积分 · 愈行之旅</text></view>
        <view class="bm-confirm-row"><text>卡类型</text><text>服务权益卡（非储值，不可提现）</text></view>
        <view class="bm-confirm-row"><text>收款方</text><text>时叙（本小程序）</text></view>
        <view v-if="isMock" class="bm-mock-note">本地联调：不会发起真实扣款，开通只更新本页状态。</view>
        <view v-else class="bm-mock-note">线上支付接入中，本页暂不会发起扣款；已购卡权益与愈行之旅不受影响。</view>
        <button hover-class="none" class="bm-btn primary full" :disabled="paying" @click="confirmPurchase">
          {{ paying ? '处理中…' : '确认开通' }}
        </button>
        <button hover-class="none" class="bm-text-btn" @click="closePurchase">再想想</button>
      </view>
    </BottomSheet>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import AppIcon from '@/components/AppIcon.vue';
import BottomSheet from '@/components/BottomSheet.vue';
import {
  CARD_PRODUCTS,
  formatDate,
  formatYuan,
  isMock,
  issueBrandCard,
  loadBrandMember,
  purchaseMode,
  quoteBrandCard,
  requestGameTicket,
  setMockCardState,
  cardStateLabel
} from '@/lib/brandMember';

const statusBarHeight = ref(20);
const loading = ref(true);
const error = ref('');
const data = ref(null);
const purchaseOpen = ref(false);
const paying = ref(false);
const openingGame = ref(false);
const selectedCode = ref('FY_ANNUAL');

// 价格只展示 CRM 当前生效的产品版本；目录读取失败时回落到内置展示值，
// 但真正的金额仍以服务端报价为准。
const products = computed(() => {
  const rows = data.value && data.value.products;
  return Array.isArray(rows) && rows.length ? rows : CARD_PRODUCTS;
});
const annual = computed(
  () => products.value.find((item) => item.code === 'FY_ANNUAL') || CARD_PRODUCTS[1]
);
const month = computed(
  () => products.value.find((item) => item.code === 'FY_MONTH') || CARD_PRODUCTS[0]
);
const selectedProduct = computed(
  () => products.value.find((item) => item.code === selectedCode.value) || annual.value
);
const active = computed(() => {
  const state = data.value && data.value.card && data.value.card.state;
  return state === 'ACTIVE' || state === 'EXPIRING' || state === 'PENDING';
});
const expiring = computed(() => data.value && data.value.card && data.value.card.state === 'EXPIRING');
const stateLabel = computed(() => cardStateLabel(data.value && data.value.card && data.value.card.state));
const gameReady = computed(() => Boolean(data.value && data.value.game && data.value.game.enabled));
const boardStops = ['起点', '免费茶饮', '+10 积分', '五感惊喜卡', '在场体验课'];
const nextPrize = '免费茶饮';

function businessShort(business) {
  return { teahour: '时', presence: '在', retreat: '轻' }[business] || '愈';
}

function productPeriod(product) {
  if (product && product.period) return product.period;
  return product && product.validDays ? `${product.validDays} 天` : '';
}

function goBack() {
  const pages = getCurrentPages();
  if (pages && pages.length > 1) {
    uni.navigateBack();
    return;
  }
  uni.switchTab({ url: '/pages/index/index' });
}

function openRules() {
  uni.navigateTo({ url: '/pages/legal/index?tab=member' });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const system = uni.getSystemInfoSync();
    statusBarHeight.value = (system && system.statusBarHeight) || 20;
    data.value = await loadBrandMember();
    // 本地联调：允许用缓存把身份页切到未开通态，方便核对开通前后两套视觉。
    if (isMock) {
      const forced = uni.getStorageSync('fy.brand.mockCard');
      if (forced === 'NONE' || forced === 'ACTIVE') {
        data.value = setMockCardState(forced);
        uni.removeStorageSync('fy.brand.mockCard');
      }
    }
  } catch (err) {
    error.value = '请稍后重试，会员状态不会被误判为未开通。';
  } finally {
    loading.value = false;
  }
}

function openPurchase(code) {
  selectedCode.value = code;
  purchaseOpen.value = true;
}

function closePurchase() {
  if (paying.value) return;
  purchaseOpen.value = false;
}

async function confirmPurchase() {
  if (paying.value) return;
  if (purchaseMode !== 'mock') {
    // 支付通道接入前不进入扣款流程，也不允许跳过后台直接开卡。
    uni.showToast({ title: '线上支付接入中，暂不能在此开通', icon: 'none' });
    return;
  }
  paying.value = true;
  try {
    const quote = await quoteBrandCard(selectedProduct.value.code);
    await issueBrandCard({
      quote,
      orderRef: `teahour:brand-card:${Date.now()}`,
      paidCents: quote.priceCents
    });
    purchaseOpen.value = false;
    await load();
    uni.showToast({ title: '已开通（本地联调）', icon: 'none' });
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '开通失败，请稍后重试', icon: 'none' });
  } finally {
    paying.value = false;
  }
}

async function openGame() {
  if (!active.value || openingGame.value) return;
  openingGame.value = true;
  try {
    const ticket = await requestGameTicket();
    if (!ticket || !ticket.url) {
      uni.showToast({ title: '游戏服务尚未配置', icon: 'none' });
      return;
    }
    uni.navigateTo({ url: `/pages/brand-member/game?url=${encodeURIComponent(ticket.url)}` });
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '游戏暂时进不去，请稍后重试', icon: 'none' });
  } finally {
    openingGame.value = false;
  }
}

onLoad(load);
onShow(() => {
  if (data.value) load();
});
</script>

<style scoped>
.bm-page {
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
}
.bm-nav {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 16px;
}
.bm-back {
  position: absolute;
  left: 10px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}
.bm-nav-title {
  font-family: var(--serif);
  font-size: 16px;
  letter-spacing: var(--tracking-title);
}
.bm-dev {
  position: absolute;
  right: 16px;
  font-size: 10px;
  letter-spacing: var(--tracking-label);
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 8px;
}
.bm-nav-tail {
  position: absolute;
  right: 16px;
  width: 1px;
  height: 1px;
}
.bm-scroll {
  height: calc(100vh - 44px);
}
.bm-wrap {
  max-width: 400px;
  margin: 0 auto;
  padding: 4px 18px 40px;
}
.bm-loading,
.bm-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 20px;
  color: var(--muted);
  font-size: 13px;
}
.bm-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--line);
  border-top-color: var(--wood);
  border-radius: 50%;
  animation: bm-spin 0.8s linear infinite;
}
@keyframes bm-spin {
  to { transform: rotate(360deg); }
}
.bm-error-title {
  font-family: var(--serif);
  font-size: 17px;
  color: var(--ink);
}
.bm-error-desc {
  text-align: center;
  line-height: 1.7;
}
.bm-identity {
  position: relative;
  overflow: hidden;
  padding: 24px 22px 20px;
  border-radius: 24px;
  background: linear-gradient(145deg, #4d3a2c 0%, #6b4a35 58%, #7b5a41 100%);
  color: #f7f1e7;
  box-shadow: 0 18px 40px rgba(53, 47, 43, 0.22);
}
.bm-identity::after {
  content: '';
  position: absolute;
  right: -44px;
  bottom: -52px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  border: 1px solid rgba(247, 241, 231, 0.22);
}
.bm-identity-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.bm-eyebrow {
  display: block;
  font-size: 9px;
  letter-spacing: var(--tracking-wide);
  color: inherit;
  opacity: 0.72;
}
.bm-identity-name {
  display: block;
  margin-top: 8px;
  font-size: 26px;
  letter-spacing: var(--tracking-title);
}
.bm-state {
  flex: none;
  font-size: 10px;
  letter-spacing: var(--tracking-label);
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(247, 241, 231, 0.35);
}
.bm-identity-sub {
  display: block;
  margin-top: 18px;
  font-size: 12px;
  opacity: 0.82;
}
.bm-identity-valid {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  letter-spacing: 0.02em;
}
.bm-identity-foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 22px;
  padding-top: 14px;
  border-top: 1px solid rgba(247, 241, 231, 0.18);
  font-size: 10px;
  opacity: 0.8;
}
.bm-here {
  color: #e8c58d;
}
.bm-renew-tip {
  margin-top: 12px;
  padding: 9px 11px;
  border-radius: 10px;
  background: rgba(247, 241, 231, 0.12);
  font-size: 11px;
  line-height: 1.6;
}
.bm-join {
  padding: 26px 22px 22px;
  border-radius: 24px;
  background: var(--card);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}
.bm-join .bm-eyebrow {
  color: var(--wood);
}
.bm-join-title {
  display: block;
  margin-top: 8px;
  font-size: 28px;
  letter-spacing: var(--tracking-title);
}
.bm-join-desc {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
}
.bm-join-price {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin: 20px 0 16px;
}
.bm-price {
  font-family: var(--serif);
  font-size: 34px;
  letter-spacing: 0.02em;
}
.bm-price-unit {
  font-size: 12px;
  color: var(--muted);
}
.bm-price-alt {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
}
.bm-join-note {
  display: block;
  margin-top: 10px;
  text-align: center;
  font-size: 11px;
  color: var(--muted);
}
.bm-join-rule {
  display: block;
  margin-top: 4px;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--wood);
}
.bm-rule-line {
  display: block;
  position: relative;
  padding-left: 11px;
  font-size: 11px;
  line-height: 1.9;
  color: var(--muted);
}
.bm-rule-line::before {
  content: '';
  position: absolute;
  left: 1px;
  top: 7px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--apricot);
}
.bm-rules .bm-text-btn {
  padding: 0;
  margin-top: 10px;
  min-height: 30px;
  text-align: left;
  font-size: 11px;
  color: var(--wood);
  display: block;
}
.bm-wallet {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: 16px;
  padding: 18px 0;
  border-radius: 18px;
  background: var(--card);
  border: 1px solid var(--line-soft);
}
.bm-wallet-item {
  text-align: center;
  border-right: 1px solid var(--line-soft);
}
.bm-wallet-item:last-child {
  border-right: 0;
}
.bm-wallet-value {
  display: block;
  font-family: var(--serif);
  font-size: 24px;
  letter-spacing: 0.02em;
}
.bm-wallet-label {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: var(--muted);
}
.bm-points-note {
  margin-top: 10px;
  font-size: 10px;
  line-height: 1.6;
  color: var(--muted);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.bm-points-spend {
  flex: none;
  color: var(--wood);
}
.bm-section {
  margin-top: 22px;
  padding: 20px 18px;
  border-radius: 20px;
  background: var(--card);
  border: 1px solid var(--line-soft);
}
.bm-section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 14px;
}
.bm-section-title {
  font-size: 19px;
  letter-spacing: var(--tracking-title);
}
.bm-earned {
  font-size: 10px;
  color: var(--muted);
}
.bm-benefit {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line-soft);
}
.bm-benefit:last-of-type {
  border-bottom: 0;
}
.bm-benefit-mark {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--serif);
  font-size: 15px;
  color: #fffaf2;
  background: var(--wood);
}
.bm-benefit-mark.is-presence { background: #7d8b6a; }
.bm-benefit-mark.is-retreat { background: #a97963; }
.bm-benefit-copy {
  flex: 1;
  min-width: 0;
}
.bm-benefit-title {
  display: block;
  font-size: 13px;
}
.bm-benefit-desc {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  line-height: 1.6;
  color: var(--muted);
}
.bm-benefit-here {
  flex: none;
  font-size: 9px;
  letter-spacing: var(--tracking-label);
  color: var(--wood);
  border: 1px solid var(--apricot);
  border-radius: 999px;
  padding: 2px 7px;
}
.bm-fine {
  display: block;
  margin-top: 12px;
  font-size: 10px;
  line-height: 1.7;
  color: var(--muted);
}
.bm-journey {
  background: #f2ede3;
  border-color: #e4dccd;
}
.bm-journey-sub {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: var(--muted);
}
.bm-dice {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-size: 10px;
  color: var(--muted);
}
.bm-dice-num {
  font-family: var(--serif);
  font-size: 22px;
  color: var(--wood);
}
.bm-board {
  display: flex;
  gap: 6px;
  overflow: hidden;
  padding: 10px 0 4px;
}
.bm-stop {
  flex: 1;
  min-width: 0;
  text-align: center;
}
.bm-stop-dot {
  width: 24px;
  height: 24px;
  margin: 0 auto;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--muted);
  background: #fffdf8;
  border: 1px solid #d9cdb9;
}
.bm-stop.done .bm-stop-dot {
  background: var(--wood);
  border-color: var(--wood);
  color: #fffaf2;
}
.bm-stop.current .bm-stop-dot {
  box-shadow: 0 0 0 3px rgba(105, 75, 61, 0.16);
  border-color: var(--wood);
  color: var(--wood);
  background: #fffaf2;
}
.bm-stop-name {
  display: block;
  margin-top: 6px;
  font-size: 9px;
  line-height: 1.4;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bm-journey-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
}
.bm-journey-next {
  font-size: 11px;
  color: var(--muted);
}
.bm-btn {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--ink);
  font-size: 13px;
  letter-spacing: 0.04em;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bm-btn.primary {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--card);
}
.bm-btn.compact {
  min-height: 34px;
  padding: 0 14px;
  font-size: 11px;
}
.bm-btn.full {
  width: 100%;
  margin-top: 12px;
}
.bm-btn[disabled] {
  opacity: 0.45;
}
.bm-products {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 4px;
}
.bm-product {
  padding: 14px 12px;
  text-align: left;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: #fffdf8;
}
.bm-product.selected {
  border-color: var(--wood);
  box-shadow: inset 0 0 0 1px var(--wood);
}
.bm-product-name {
  display: block;
  font-size: 12px;
}
.bm-product-price {
  display: block;
  margin-top: 6px;
  font-size: 22px;
}
.bm-product-period {
  display: block;
  font-size: 10px;
  color: var(--muted);
}
.bm-confirm {
  padding-bottom: 8px;
}
.bm-confirm-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line-soft);
}
.bm-confirm-name {
  display: block;
  font-size: 20px;
}
.bm-confirm-desc {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: var(--muted);
}
.bm-confirm-price {
  font-size: 24px;
}
.bm-confirm-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 12px;
}
.bm-confirm-row text:last-child {
  color: var(--muted);
  text-align: right;
}
.bm-mock-note {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f4efe6;
  font-size: 10px;
  line-height: 1.6;
  color: var(--muted);
}
.bm-text-btn {
  width: 100%;
  min-height: 40px;
  margin-top: 4px;
  background: transparent;
  font-size: 12px;
  color: var(--muted);
}
.bm-foot {
  margin-top: 30px;
  text-align: center;
  font-size: 10px;
  letter-spacing: var(--tracking-wide);
  color: var(--muted);
}
.bm-foot-sub {
  display: block;
  margin-top: 4px;
  letter-spacing: var(--tracking-label);
  opacity: 0.7;
}
</style>
