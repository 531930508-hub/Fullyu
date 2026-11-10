<template>
  <view class="bm-page">
    <view :style="{ height: statusBarHeight + 'px' }" />
    <view class="bm-nav">
      <button hover-class="none" class="bm-back" :aria-label="tt('返回', 'Back')" @click="goBack">
        <AppIcon name="chevronLeft" :size="20" />
      </button>
      <text class="bm-nav-title">{{ tt('Full愈会员卡', 'Full Yuk member card') }}</text>
      <text v-if="isMock" class="bm-dev">{{ tt('合成数据', 'Mock data') }}</text>
      <view v-else class="bm-nav-tail" />
    </view>

    <scroll-view scroll-y class="bm-scroll">
      <view class="bm-wrap">
        <view v-if="loading" class="bm-loading">
          <view class="bm-spinner" />
          <text>{{ tt('正在读取会员身份', 'Loading your membership') }}</text>
        </view>

        <view v-else-if="error" class="bm-error">
          <text class="bm-error-title">{{ tt('会员信息暂时连不上', 'Member info is unavailable right now') }}</text>
          <text class="bm-error-desc">{{ error }}</text>
          <button hover-class="none" class="bm-btn primary" @click="load">{{ tt('重新加载', 'Try again') }}</button>
        </view>

        <template v-else-if="data">
          <!-- 会员卡：身份、本年已省、三业态权益与续费都在这张卡里 -->
          <MemberCard
            :data="data"
            :active="active"
            @purchase="openPurchase(selectedCode)"
            @detail="openDetail"
            @rules="openRules"
            @gift="openGift"
          />

          <!-- 01 社区黑板报：门店公告与会员故事贴在同一块板上，置顶公告排最前 -->
          <view v-if="active" class="bm-section bm-panel bm-panel--board">
            <view class="bm-panel-head">
              <text class="bm-panel-index">01</text>
              <view class="bm-panel-copy">
                <text class="bm-panel-title serif">{{ tt('会员黑板报', 'Member board') }}</text>
                <text class="bm-panel-sub">{{ tt('门店的小事与会员的故事', 'Store notes and member stories') }}</text>
              </view>
              <text class="bm-earned">{{ boardCount ? tt(`${boardCount} 条`, `${boardCount} posts`) : tt('仅会员', 'Members only') }}</text>
            </view>

            <view v-if="boardCount" class="bm-board">
              <view
                v-for="item in visibleNotes"
                :key="item.id"
                class="bm-note"
                :class="{ 'is-pinned': item.pinned, 'has-cover': item.coverUrl }"
              >
                <view v-if="item.pinned" class="bm-note-tape" />
                <image v-if="item.coverUrl" :src="item.coverUrl" mode="aspectFill" class="bm-note-cover" />
                <view class="bm-note-inner">
                  <view class="bm-note-meta">
                    <text v-if="item.pinned" class="bm-note-pin">{{ tt('置顶', 'Pinned') }}</text>
                    <text class="bm-note-store">{{ item.store || tt('全部门店', 'All stores') }}</text>
                    <text v-if="item.expireAt" class="bm-note-until">{{ tt(`${shortDay(item.expireAt)} 前`, `until ${shortDay(item.expireAt)}`) }}</text>
                  </view>
                  <text class="bm-note-title serif">{{ item.title }}</text>
                  <text class="bm-note-body">{{ item.body }}</text>
                  <text v-if="item.publishedAt" class="bm-note-date">{{ shortDay(item.publishedAt) }}</text>
                </view>
              </view>
              <button
                v-if="notices.length > visibleNotes.length"
                hover-class="none"
                class="bm-board-more"
                @click="noticesExpanded = true"
              >
                {{ tt(`展开另外 ${notices.length - visibleNotes.length} 条公告`, `Show ${notices.length - visibleNotes.length} more notices`) }}
              </button>

              <view v-for="item in storyPreview" :key="item.id" class="bm-note bm-note--story">
                <view class="bm-note-inner">
                  <view class="bm-note-meta">
                    <text class="bm-note-tag">{{ tt('会员故事', 'Member story') }}</text>
                  </view>
                  <text class="bm-note-title serif">{{ item.title }}</text>
                  <text v-if="item.quote" class="bm-note-quote">“{{ item.quote }}”<text v-if="item.quoteBy" class="bm-note-by"> —— {{ item.quoteBy }}</text></text>
                  <text class="bm-note-body">{{ item.story }}</text>
                </view>
              </view>
            </view>
            <text v-else class="bm-board-empty">{{ storiesError || tt('黑板报正在整理，过几天再来看看。', 'The board is being tidied up — check back in a few days.') }}</text>

            <button v-if="stories.length > storyPreview.length" hover-class="none" class="bm-panel-cta" @click="openStories">
              {{ tt(`查看全部 ${stories.length} 篇会员故事`, `Read all ${stories.length} member stories`) }}
            </button>
            <view class="bm-row bm-row--divided" @click="openFeedback">
              <view class="bm-benefit-copy">
                <text class="bm-benefit-title">{{ tt('写下你的建议', 'Leave a note') }}</text>
                <text class="bm-benefit-desc">{{ tt('想喝什么、哪里不舒服，都可以说', 'Tell us what you would like to drink or what could be better') }}</text>
              </view>
              <text class="bm-row-tail">›</text>
            </view>
          </view>

          <!-- 02 愈行之旅：玩法由进度条与按钮引导，只保留必要的一句说明 -->
          <view v-if="active" class="bm-section bm-panel bm-panel--journey">
            <view class="bm-panel-head">
              <text class="bm-panel-index">02</text>
              <view class="bm-panel-copy">
                <text class="bm-panel-title serif">{{ tt('愈行之旅', 'The Healing Journey') }}</text>
                <text class="bm-panel-sub">{{ tt('消费得骰子', 'Spend to earn dice') }}</text>
              </view>
              <view class="bm-dice" :class="{ debt: diceDebt > 0 }">
                <text class="bm-dice-num">{{ data.dice.balance }}</text>
                <text class="bm-dice-label">{{ diceDebt > 0 ? tt('待补', 'owed') : tt('颗', 'dice') }}</text>
              </view>
            </view>
            <view v-if="progress" class="bm-progress">
              <view class="bm-progress-head">
                <text class="bm-progress-title">{{ progress.headline }}</text>
                <text class="bm-progress-num">{{ progress.percent }}%</text>
              </view>
              <view
                class="bm-progress-track"
                role="progressbar"
                :aria-valuenow="progress.percent"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <view class="bm-progress-fill" :style="{ width: progress.percent + '%' }" />
              </view>
              <text v-if="diceDebt > 0" class="bm-journey-debt">{{ tt(`先补回 ${diceDebt} 颗，再得新骰子`, `Clear the ${diceDebt} owed dice to earn new ones`) }}</text>
              <text v-else class="bm-progress-note">{{ tt(`每满 ¥${formatYuan(progress.perDieCents)} 得 1 颗`, `1 die per ¥${formatYuan(progress.perDieCents)} spent`) }}</text>
              <view v-if="progress.tip" class="bm-progress-tip">
                <view class="bm-benefit-mark" :class="`is-${progress.tip.external}`">{{ businessShort(progress.tip.external) }}</view>
                <view class="bm-benefit-copy">
                  <text class="bm-benefit-title">{{ progress.tip.title }}</text>
                  <text class="bm-benefit-desc">{{ progress.tip.text }}</text>
                </view>
              </view>
            </view>
            <view class="bm-journey-foot">
              <text v-if="data.prizes.pending" class="bm-journey-next">{{ tt(`待领礼物 ${data.prizes.pending} 份`, `${data.prizes.pending} gift${data.prizes.pending > 1 ? 's' : ''} to collect`) }}</text>
              <text v-else class="bm-journey-next" />
              <button hover-class="none" class="bm-btn compact" :disabled="!gameReady" @click="openGame">
                {{ gameReady ? tt('去掷骰子', 'Roll the dice') : tt('未解锁', 'Locked') }}
              </button>
            </view>
          </view>

          <!-- 03 礼物与兑换：年卡礼提货码与会员码收在同一组 -->
          <view v-if="vouchers.length || active" class="bm-section bm-panel bm-panel--gift">
            <view class="bm-panel-head">
              <text class="bm-panel-index">03</text>
              <view class="bm-panel-copy">
                <text class="bm-panel-title serif">{{ tt('礼物与兑换', 'Gifts & redemption') }}</text>
              </view>
              <text class="bm-earned">{{ vouchers.length ? tt('任一门店可领', 'Any store') : tt('会员码', 'Member code') }}</text>
            </view>
            <view v-for="item in vouchers" :key="item.code" class="bm-voucher" :class="{ used: item.status !== 'ISSUED' }">
              <view class="bm-benefit-copy">
                <text class="bm-benefit-title">{{ item.title }}</text>
                <text class="bm-benefit-desc">{{ voucherNote(item) }}</text>
              </view>
              <view class="bm-voucher-code">
                <text class="bm-voucher-num">{{ item.code }}</text>
                <text class="bm-voucher-state">{{ voucherStateLabel(item.status) }}</text>
              </view>
            </view>
            <view v-if="active" class="bm-row" :class="{ 'bm-row--divided': vouchers.length }">
              <view class="bm-benefit-copy">
                <text class="bm-benefit-title">{{ tt('兑换会员码', 'Redeem a member code') }}</text>
                <text class="bm-benefit-desc">{{ tt('兑换后有效期自动顺延', 'Your term extends automatically after redemption') }}</text>
              </view>
              <button hover-class="none" class="bm-btn compact" @click="openGift">{{ tt('兑换', 'Redeem') }}</button>
            </view>
          </view>

          <view class="bm-foot">
            <text>{{ tt('放松有道　自在生活', 'Rest, with intention') }}</text>
            <text class="bm-foot-sub">{{ tt('Full愈 · 时叙', 'Full Yuk · 时叙') }}</text>
          </view>
        </template>
      </view>
    </scroll-view>

    <BottomSheet
      v-if="purchaseOpen"
      :title="active ? tt('续费 Full愈会员', 'Renew Full Yuk membership') : tt('开通 Full愈会员', 'Join Full Yuk membership')"
      @close="closePurchase"
    >
      <view class="bm-confirm">
        <text class="bm-sheet-desc">{{ active
          ? tt('同一张卡，只选时长，从到期日往后接。', 'One card — just pick a term. It starts when your current term ends.')
          : tt('同一张卡，只选时长，付款后立即生效。', 'One card — just pick a term. It starts right after payment.') }}</text>
        <!-- 时长选项：时长 / 价格 / 有效期三行竖排，日期再长也不会折行 -->
        <view class="bm-plans">
          <button
            v-for="product in products"
            :key="product.code"
            hover-class="none"
            class="bm-plan"
            :class="{ selected: selectedCode === product.code }"
            @click="selectedCode = product.code"
          >
            <text class="bm-plan-name">{{ planName(product) }}</text>
            <text class="bm-plan-price serif">¥{{ formatYuan(product.priceCents) }}</text>
            <text class="bm-plan-date">{{ planDate(product) }}</text>
          </button>
        </view>
        <view class="bm-confirm-row"><text>{{ active ? tt('续费账户', 'Renew for') : tt('开卡账户', 'Open for') }}</text><text>{{ data.member.name }} · {{ data.member.phoneMasked }}</text></view>
        <view class="bm-confirm-row"><text>{{ tt('包含', 'Includes') }}</text><text>{{ tt('全业态会员价 · 愈行之旅', 'Member prices · Healing Journey') }}</text></view>
        <view class="bm-confirm-row"><text>{{ tt('卡类型', 'Card type') }}</text><text>{{ tt('服务权益卡（非储值，不可提现）', 'Service benefit card (not stored value, not withdrawable)') }}</text></view>
        <view class="bm-confirm-row"><text>{{ tt('收款方', 'Payee') }}</text><text>{{ tt('时叙（本小程序）', '时叙 (this mini program)') }}</text></view>
        <view v-if="isMock" class="bm-mock-note">{{ tt(`本地联调：不会发起真实扣款，${active ? '续费' : '开通'}只更新本页状态。`, 'Local mock: no real charge is made; this only updates the page state.') }}</view>
        <view v-else class="bm-mock-note">{{ tt('线上支付接入中，本页暂不会发起扣款；已购卡权益与愈行之旅不受影响。', 'Online payment is being connected; no charge is made here. Existing card benefits are unaffected.') }}</view>
        <button hover-class="none" class="bm-btn primary full" :disabled="paying" @click="confirmPurchase">
          {{ paying ? tt('处理中…', 'Processing…') : active ? tt('确认续费', 'Confirm renewal') : tt('确认开通', 'Confirm and join') }}
        </button>
        <button hover-class="none" class="bm-text-btn" @click="closePurchase">{{ tt('再想想', 'Not now') }}</button>
      </view>
    </BottomSheet>

    <BottomSheet v-if="detailOpen" :title="tt('本年已省', 'Saved this year')" @close="closeDetail">
      <view class="bm-confirm">
        <view class="bm-confirm-head">
          <view>
            <text class="bm-confirm-name serif">{{ tt(`本年已省 ¥${formatYuan(data.savedCents)}`, `Saved ¥${formatYuan(data.savedCents)} this year`) }}</text>
            <text class="bm-confirm-desc">{{ tt('按各业态会员价结算累计', 'Accumulated from member-price settlements') }}</text>
          </view>
        </view>
        <view class="bm-confirm-row"><text>{{ tt('计入范围', 'Scope') }}</text><text>{{ tt('时叙 · 轻疗 · 在场 全门店', '时叙 · 轻疗 · 在场, all stores') }}</text></view>
        <view class="bm-confirm-row"><text>{{ tt('统计口径', 'Basis') }}</text><text>{{ tt('会员价与原价差额，按订单实付结算', 'Difference between member and list price, per paid order') }}</text></view>
        <view class="bm-confirm-row"><text>{{ tt('退款订单', 'Refunded orders') }}</text><text>{{ tt('退款后对应节省金额同步扣减', 'Savings are deducted when an order is refunded') }}</text></view>
        <text class="bm-fine">{{ tt('分业态明细与逐笔记录以门店小票为准；需要核对时联系门店店员。', 'Per-store breakdowns and individual records follow the printed receipts; ask in store if you need a check.') }}</text>
        <button hover-class="none" class="bm-btn primary full" @click="closeDetail">{{ tt('知道了', 'Got it') }}</button>
      </view>
    </BottomSheet>

    <BottomSheet v-if="giftOpen" :title="tt('兑换会员码', 'Redeem a member code')" @close="closeGift">
      <view class="bm-confirm">
        <text class="bm-sheet-desc">{{ tt('输入活动卡片或朋友分享的会员码。兑换后会员有效期自动顺延，已开通的从当前到期日起接续。', 'Enter the code from a campaign card or a friend. Your term extends automatically, and active cards continue from the current end date.') }}</text>
        <input
          class="bm-input"
          :value="giftCode"
          :maxlength="16"
          :placeholder="tt('例如 WELCOME30', 'e.g. WELCOME30')"
          placeholder-class="bm-input-ph"
          confirm-type="done"
          @input="(e) => (giftCode = e.detail.value)"
          @confirm="confirmGift"
        />
        <text class="bm-sheet-fine">{{ tt('每个会员码有名额与兑换截止日期，以兑换结果为准；同一账号每个码只能兑换一次。', 'Each code has a quota and a deadline. Codes can be redeemed once per account.') }}</text>
        <button hover-class="none" class="bm-btn primary full" :disabled="claiming" @click="confirmGift">
          {{ claiming ? tt('兑换中…', 'Redeeming…') : tt('确认兑换', 'Redeem') }}
        </button>
        <button hover-class="none" class="bm-text-btn" @click="closeGift">{{ tt('取消', 'Cancel') }}</button>
      </view>
    </BottomSheet>

    <BottomSheet v-if="feedbackOpen" :title="tt('写下你的建议', 'Leave a note')" @close="closeFeedback">
      <view class="bm-confirm">
        <text class="bm-sheet-desc">{{ tt('想要什么样的茶、课程或疗愈体验，哪里让你不舒服，都可以告诉我们。每条都会有人看。', 'Tell us what tea, classes or treatments you would like, and what did not feel right. A real person reads every note.') }}</text>
        <textarea
          class="bm-textarea"
          :value="feedbackText"
          :maxlength="1000"
          :placeholder="tt('至少 5 个字', 'At least 5 characters')"
          placeholder-class="bm-input-ph"
          @input="(e) => (feedbackText = e.detail.value)"
        />
        <text class="bm-count">{{ feedbackLength }} / 1000</text>
        <view
          class="bm-check"
          role="checkbox"
          :aria-checked="allowQuote"
          @click="allowQuote = !allowQuote"
        >
          <view class="bm-check-box" :class="{ on: allowQuote }">
            <AppIcon v-if="allowQuote" name="check" :size="14" color="#fffaf2" />
          </view>
          <text>{{ tt('同意匿名整理进会员故事（只展示姓氏）', 'OK to use this anonymously in member stories (surname only)') }}</text>
        </view>
        <button hover-class="none" class="bm-btn primary full" :disabled="sending" @click="sendFeedback">
          {{ sending ? tt('提交中…', 'Sending…') : tt('提交', 'Send') }}
        </button>
        <button hover-class="none" class="bm-text-btn" @click="closeFeedback">{{ tt('取消', 'Cancel') }}</button>
      </view>
    </BottomSheet>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { getToken } from '@/api/request';
import AppIcon from '@/components/AppIcon.vue';
import BottomSheet from '@/components/BottomSheet.vue';
import MemberCard from '@/components/MemberCard.vue';
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
  claimGiftCode,
  parseGiftScene,
  stashPendingGift,
  submitFeedback,
  loadStories,
  voucherStatusLabel
} from '@/lib/brandMember';
import { useLocale } from '@/lib/useLocale';

const { locale, tt, syncLocale } = useLocale();

const statusBarHeight = ref(20);
const loading = ref(true);
const error = ref('');
const data = ref(null);
const purchaseOpen = ref(false);
const paying = ref(false);
const openingGame = ref(false);
const selectedCode = ref('FY_ANNUAL');
const detailOpen = ref(false);

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
const gameReady = computed(() => Boolean(data.value && data.value.game && data.value.game.enabled));
// 骰子进度、续费提醒与年卡礼都由 CRM 计算；页面只展示，不在前端推算金额。
const progress = computed(() => (data.value && data.value.dice && data.value.dice.progress) || null);
// 退款可能把骰子扣成负数；欠账先补回，进度文案由 CRM 一并计算。
const diceDebt = computed(() => {
  const balance = (data.value && data.value.dice && data.value.dice.balance) || 0;
  return balance < 0 ? Math.abs(balance) : 0;
});
const vouchers = computed(() => (data.value && Array.isArray(data.value.vouchers) ? data.value.vouchers : []));
// 公告、故事都只对有效会员返回；前端不做额外推断。
const notices = computed(() => (data.value && Array.isArray(data.value.notices) ? data.value.notices : []));
// 黑板报首屏只贴 3 条，其余由会员手动展开；排序（置顶优先）由 CRM 决定。
const noticesExpanded = ref(false);
const visibleNotes = computed(() =>
  noticesExpanded.value ? notices.value : notices.value.slice(0, 3)
);

const stories = ref([]);
const storiesError = ref('');
const storyPreview = computed(() => stories.value.slice(0, 2));
const boardCount = computed(() => notices.value.length + stories.value.length);
const giftOpen = ref(false);
const giftCode = ref('');
const claiming = ref(false);
const feedbackOpen = ref(false);
const feedbackText = ref('');
const allowQuote = ref(false);
const sending = ref(false);
const feedbackLength = computed(() => feedbackText.value.trim().length);

function businessShort(business) {
  return { teahour: '时', presence: '在', retreat: '轻' }[business] || '愈';
}

// 黑板报日期只保留「11月30日」这类短格式，公告的 expireAt 与 publishedAt 都是 YYYY-MM-DD。
// 英文界面下用「Nov 30」，避免中文月日混进英文句子。
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDay(value) {
  if (!value) return '';
  const [month, day] = String(value).slice(0, 10).split('-').slice(1);
  if (!month || !day) return String(value);
  if (locale.value === 'en') return `${MONTH_EN[Number(month) - 1] || month} ${Number(day)}`;
  return `${Number(month)}月${Number(day)}日`;
}

/** 时长选项第一行：只用「一年 / 一个月」，卡型只有一个，区别只在时长。 */
function planName(product) {
  if (!product) return '';
  const days = Number(product.validDays) || 0;
  if (locale.value === 'en') {
    if (days >= 365) return 'One year';
    if (days >= 28 && days <= 31) return 'One month';
    return days ? `${days} days` : '';
  }
  if (product.period) return product.period;
  if (days >= 365) return '一年';
  if (days >= 28 && days <= 31) return '一个月';
  return days ? `${days} 天` : '';
}

/** 时长选项第三行：已开通从到期日往后接，未开通直接给生效时长。 */
function planDate(product) {
  const days = Number(product && product.validDays) || 0;
  if (!active.value) return days ? tt(`${days} 天`, `${days} days`) : '';
  const base = nextStartDate();
  if (!base || !days) return '';
  const end = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  const until = formatDate(end.toISOString().slice(0, 10));
  return tt(`至 ${until}`, `until ${until}`);
}

/** 续费从「今天」和「当前到期日」里更晚的那个开始算，避免提前续费吃掉已有天数。 */
function nextStartDate() {
  const until = data.value && data.value.card && data.value.card.validUntil;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!until) return today;
  const parsed = new Date(`${String(until).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return today;
  return parsed > today ? parsed : today;
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

function openStories() {
  uni.navigateTo({ url: '/pages/brand-member/stories/index' });
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
    error.value = tt('请稍后重试，会员状态不会被误判为未开通。', 'Please try again shortly; your card will not be treated as inactive.');
  } finally {
    loading.value = false;
  }
  if (data.value && active.value) refreshStories();
}

async function refreshStories() {
  storiesError.value = '';
  try {
    const res = await loadStories();
    stories.value = (res && Array.isArray(res.stories) ? res.stories : []);
  } catch (err) {
    stories.value = [];
    // 仅会员可见：403 时不展示错误，其他失败给一句温和提示，不影响身份页。
    storiesError.value = err && err.status === 403 ? '' : tt('会员故事暂时没读到，稍后再看看。', 'Member stories are unavailable right now — check back later.');
  }
}

function voucherNote(item) {
  if (item.status === 'REDEEMED' && item.redeemedAt) {
    const when = formatDate(item.redeemedAt);
    if (locale.value === 'en') {
      return item.redeemedStore ? `Collected on ${when} at ${item.redeemedStore}` : `Collected on ${when}`;
    }
    return item.redeemedStore ? `已于 ${when} 在 ${item.redeemedStore} 领取` : `已于 ${when} 领取`;
  }
  if (item.status === 'VOID') return tt('该提货码已作废', 'This pickup code is void');
  if (item.desc) return item.desc;
  return tt('任一门店出示提货码，店员核销一次', 'Show the pickup code at any store; staff redeem it once');
}

/** 礼券状态：CRM 只给状态码，文案在前端按语言出。 */
function voucherStateLabel(status) {
  if (locale.value === 'en') {
    return { ISSUED: 'To collect', REDEEMED: 'Collected', VOID: 'Void', EXPIRED: 'Expired' }[status] || 'To collect';
  }
  return voucherStatusLabel(status);
}

function openGift() {
  giftCode.value = '';
  giftOpen.value = true;
}

function closeGift() {
  if (claiming.value) return;
  giftOpen.value = false;
}

async function confirmGift() {
  if (claiming.value) return;
  const code = giftCode.value.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) {
    uni.showToast({ title: tt('会员码为 4–16 位字母或数字', 'Codes are 4–16 letters or digits'), icon: 'none' });
    return;
  }
  claiming.value = true;
  try {
    const res = await claimGiftCode(code);
    giftOpen.value = false;
    await load();
    const days = res && res.days;
    uni.showToast({
      title: res && res.replayed
        ? tt('这个会员码已兑换过', 'This code was already redeemed')
        : days
          ? tt(`已兑换 ${days} 天`, `${days} days added`)
          : tt('兑换成功', 'Redeemed'),
      icon: 'none'
    });
  } catch (err) {
    // 名额已满、已截止、码无效等文案由 CRM 判定，原样展示。
    uni.showToast({ title: (err && err.message) || tt('兑换失败，请稍后重试', 'Redemption failed — please try again'), icon: 'none' });
  } finally {
    claiming.value = false;
  }
}

function openFeedback() {
  feedbackOpen.value = true;
}

function closeFeedback() {
  if (sending.value) return;
  feedbackOpen.value = false;
}

async function sendFeedback() {
  if (sending.value) return;
  const content = feedbackText.value.trim();
  if (content.length < 5) {
    uni.showToast({ title: tt('再多写几个字吧（至少 5 个字）', 'A few more words, please (at least 5 characters)'), icon: 'none' });
    return;
  }
  sending.value = true;
  try {
    await submitFeedback(content, allowQuote.value);
    feedbackOpen.value = false;
    feedbackText.value = '';
    allowQuote.value = false;
    uni.showToast({ title: tt('收到了，谢谢你', 'Thank you — we got it'), icon: 'none' });
  } catch (err) {
    uni.showToast({ title: (err && err.message) || tt('提交失败，请稍后重试', 'Could not send — please try again'), icon: 'none' });
  } finally {
    sending.value = false;
  }
}

function openDetail() {
  detailOpen.value = true;
}

function closeDetail() {
  detailOpen.value = false;
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
    uni.showToast({ title: tt('线上支付接入中，暂不能在此开通', 'Online payment is not connected yet'), icon: 'none' });
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
    uni.showToast({ title: tt('已开通（本地联调）', 'Card opened (local mock)'), icon: 'none' });
  } catch (err) {
    uni.showToast({ title: (err && err.message) || tt('开通失败，请稍后重试', 'Could not open the card — please try again'), icon: 'none' });
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
      uni.showToast({ title: tt('游戏服务尚未配置', 'The game service is not configured'), icon: 'none' });
      return;
    }
    uni.navigateTo({ url: `/pages/brand-member/game?url=${encodeURIComponent(ticket.url)}` });
  } catch (err) {
    uni.showToast({ title: (err && err.message) || tt('游戏暂时进不去，请稍后重试', 'The game is unavailable — please try again'), icon: 'none' });
  } finally {
    openingGame.value = false;
  }
}

/** 扫后台生成的小程序码进来：登录后自动兑换，不必再手输会员码。 */
async function claimSceneGift(code) {
  if (!code || claiming.value) return;
  claiming.value = true;
  try {
    const res = await claimGiftCode(code);
    await load();
    const days = res && res.days;
    uni.showToast({
      title: res && res.replayed
        ? tt('这个会员码已兑换过', 'This code was already redeemed')
        : days
          ? tt(`已领取 ${days} 天会员`, `${days} days of membership added`)
          : tt('会员码已领取', 'Member code redeemed'),
      icon: 'none'
    });
  } catch (err) {
    uni.showToast({ title: (err && err.message) || tt('会员码领取失败，请稍后重试', 'Could not redeem the code — please try again'), icon: 'none' });
  } finally {
    claiming.value = false;
  }
}

onLoad((options) => {
  syncLocale();
  const sceneCode = parseGiftScene(options || {});
  if (sceneCode && !getToken()) {
    // 未登录先记住口令，登录成功后由首页自动领取并回到会员页。
    stashPendingGift(sceneCode);
    uni.reLaunch({ url: '/pages/index/index' });
    return;
  }
  load().then(() => {
    if (sceneCode) claimSceneGift(sceneCode);
  });
});
onShow(() => {
  // 首页切换语言后再进来：文案随 locale 响应式更新，这里只负责把语言读回来。
  syncLocale();
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
.bm-join-rule {
  display: block;
  margin-top: 4px;
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--wood);
}
.bm-section {
  margin-top: 22px;
  padding: 20px 18px;
  border-radius: 20px;
  background: var(--card);
  border: 1px solid var(--line-soft);
}
.bm-panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.bm-panel-index {
  flex: none;
  font-family: var(--serif);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--accent);
}
.bm-panel-copy {
  flex: 1;
  min-width: 0;
}
.bm-panel-title {
  display: block;
  font-size: 19px;
  letter-spacing: var(--tracking-title);
}
.bm-panel-sub {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--muted);
}
.bm-panel-tail {
  flex: none;
  font-size: 10px;
  color: var(--wood);
}
.bm-panel-cta {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px 0 2px;
  text-align: left;
  font-size: 11px;
  color: var(--wood);
  background: none;
  border: 0;
}
.bm-panel-note {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  line-height: 1.6;
  color: var(--muted);
}
.bm-panel--journey {
  background: #f2ede3;
  border-color: #e4dccd;
}
.bm-panel--gift {
  background: #faf6ec;
  border-color: #ece3d2;
}
.bm-panel--flat {
  padding: 4px 18px;
}
.bm-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
}
.bm-row--divided {
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--line-soft);
}
.bm-row-title {
  flex: 1;
  font-size: 12px;
}
.bm-row-tail {
  flex: none;
  font-size: 11px;
  color: var(--wood);
}
.bm-earned {
  font-size: 10px;
  color: var(--muted);
}
.bm-toggle {
  cursor: pointer;
}
/* 黑板报：纸条式公告，置顶贴在最前并带一小段胶带。 */
.bm-panel--board {
  background: #f5efe3;
  border-color: #e6dccb;
}
.bm-board {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}
.bm-note {
  position: relative;
  overflow: hidden;
  border: 1px solid #ece2d1;
  border-radius: 10px;
  background: #fffdf7;
  box-shadow: 0 6px 14px rgba(90, 72, 48, 0.06);
}
.bm-note.is-pinned {
  border-color: #d9c6a4;
  background: linear-gradient(180deg, #fffaf0 0%, #fffdf8 100%);
}
.bm-note-tape {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 2;
  width: 54px;
  height: 9px;
  margin-left: -27px;
  background: rgba(198, 172, 124, 0.5);
  border-radius: 0 0 2px 2px;
}
.bm-note-cover {
  display: block;
  width: 100%;
  height: 132px;
  background: #efe8da;
}
.bm-note-inner {
  padding: 12px 14px 13px;
}
.bm-note-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.bm-note-pin {
  flex: none;
  padding: 1px 6px;
  color: #7a5a2f;
  border: 1px solid #d9c6a4;
  border-radius: 999px;
  background: #fbf3e3;
}
.bm-note-store {
  color: var(--wood);
}
.bm-note-until {
  margin-left: auto;
}
.bm-note-tag {
  color: var(--wood);
  letter-spacing: 0.14em;
}
.bm-note-title {
  display: block;
  margin-top: 6px;
  font-size: 16px;
  line-height: 1.35;
  letter-spacing: var(--tracking-title);
}
.bm-note-body {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.75;
  color: var(--ink);
  opacity: 0.82;
  white-space: pre-wrap;
}
.bm-note-date {
  display: block;
  margin-top: 8px;
  font-size: 9px;
  color: var(--muted);
}
.bm-note-quote {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--wood);
}
.bm-note-by {
  font-size: 10px;
  color: var(--muted);
}
.bm-note--story {
  border-style: dashed;
  background: #fbf7ee;
}
.bm-board-more {
  width: 100%;
  padding: 6px 0;
  font-size: 10px;
  text-align: center;
  letter-spacing: 0.08em;
  color: var(--wood);
  background: none;
  border: 0;
}
.bm-board-empty {
  display: block;
  margin-top: 14px;
  font-size: 10px;
  line-height: 1.7;
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
.bm-dice.debt .bm-dice-num,
.bm-dice.debt .bm-dice-label {
  color: #a04b32;
}
.bm-journey-debt {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: #a04b32;
}
.bm-progress {
  padding: 14px 14px 12px;
  border-radius: 14px;
  background: #fffdf8;
  border: 1px solid #e4dccd;
}
.bm-progress-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}
.bm-progress-title {
  font-size: 13px;
  letter-spacing: 0.05em;
}
.bm-progress-num {
  flex: none;
  font-family: var(--serif);
  font-size: 15px;
  color: var(--wood);
}
.bm-progress-track {
  height: 6px;
  margin-top: 10px;
  border-radius: 999px;
  background: #ece4d6;
  overflow: hidden;
}
.bm-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--wood);
  transition: width 0.4s ease;
}
.bm-progress-note {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  line-height: 1.6;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.bm-progress-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e4dccd;
}
.bm-progress-tip .bm-benefit-mark {
  width: 28px;
  height: 28px;
  font-size: 13px;
}
.bm-voucher {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line-soft);
}
.bm-voucher:last-of-type {
  border-bottom: 0;
}
.bm-voucher.used {
  opacity: 0.55;
}
.bm-voucher-code {
  flex: none;
  text-align: right;
}
.bm-voucher-num {
  display: block;
  font-family: var(--mono, monospace);
  font-size: 15px;
  letter-spacing: 0.12em;
  color: var(--wood);
}
.bm-voucher-state {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  letter-spacing: var(--tracking-label);
  color: var(--muted);
}
.bm-gift-link {
  color: var(--wood);
}
.bm-renew-tip {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bm-renew-tip text {
  flex: 1;
  min-width: 0;
}
.bm-renew-btn {
  flex: none;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: #f7f1e7;
  color: var(--ink);
  font-size: 11px;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
}
.bm-sheet-desc {
  display: block;
  font-size: 12px;
  line-height: 1.8;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.bm-sheet-fine {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  line-height: 1.7;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.bm-input {
  height: 46px;
  margin-top: 14px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #fffdf8;
  font-size: 15px;
  letter-spacing: 0.12em;
}
.bm-textarea {
  width: auto;
  height: 120px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #fffdf8;
  font-size: 13px;
  line-height: 1.7;
  letter-spacing: 0.05em;
}
.bm-input-ph {
  color: #b9ad9c;
  letter-spacing: 0.05em;
}
.bm-count {
  display: block;
  margin-top: 4px;
  text-align: right;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.bm-check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--ink);
}
.bm-check-box {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid var(--line);
  background: #fffdf8;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bm-check-box.on {
  background: var(--wood);
  border-color: var(--wood);
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
.bm-plans {
  display: flex;
  gap: 10px;
  margin: 12px 0 6px;
}
.bm-plan {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 12px 12px 13px;
  text-align: left;
  line-height: 1.2;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: #fffdf8;
}
.bm-plan.selected {
  border-color: var(--wood);
  box-shadow: inset 0 0 0 1px var(--wood);
  background: #fbf6ec;
}
/* 三行都 nowrap：时长、价格、有效期各占一行，日期再长也不会折行 */
.bm-plan-name {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.bm-plan-price {
  margin-top: 6px;
  font-size: 20px;
  line-height: 1;
  white-space: nowrap;
}
.bm-plan-date {
  margin-top: 6px;
  max-width: 100%;
  font-size: 10px;
  color: #a1907a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
