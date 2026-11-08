<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack fallback="/pages/profile/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <view class="nav-copy">
        <text class="nav-title serif">{{ tr('Full愈年卡', 'Full Yu Annual') }}</text>
        <text class="nav-sub">{{ tr('品牌通用会员', 'One card across Full Yu') }}</text>
      </view>
      <text v-if="isMock" class="dev-chip">{{ tr('合成数据', 'Mock data') }}</text>
    </view>

    <view class="content">
      <PageState
        v-if="loading"
        state="loading"
        :title="tr('正在读取品牌会员身份', 'Loading your brand membership')"
      />
      <PageState
        v-else-if="error"
        state="error"
        :title="tr('品牌会员信息暂时连不上', 'Brand membership is unavailable')"
        :message="tr('请稍后重试，会员状态不会被误判为未开通。', 'Retry later. Your status will not be treated as inactive.')"
        :action="tr('重新加载', 'Reload')"
        @action="load"
      />

      <template v-else-if="data">
        <!-- 品牌身份卡 -->
        <view v-if="active" class="identity">
          <view class="identity-top">
            <view>
              <text class="identity-eyebrow latin">FULL YU ANNUAL MEMBER</text>
              <text class="identity-name serif">{{ data.card.productName }}</text>
            </view>
            <text class="identity-state">{{ stateLabel }}</text>
          </view>
          <text class="identity-sub">{{ data.member.name }} · {{ data.member.memberNo }}</text>
          <text class="identity-valid">
            {{ tr('有效期至 ', 'Valid until ') }}{{ formatDate(data.card.validUntil) }} ·
            {{ tr(`还有 ${data.card.remainingDays} 天`, `${data.card.remainingDays} days left`) }}
          </text>
          <view class="identity-foot">
            <text>{{ data.card.soldByName }}{{ tr('开通 · 时叙、在场、轻疗三店通用', ' · valid at Teahour, Presence and Retreat') }}</text>
            <text class="identity-here">{{ tr('本店：在场', 'Here: Presence') }}</text>
          </view>
          <view v-if="expiring" class="identity-tip">
            {{ tr(`还有 ${data.card.remainingDays} 天到期，续费后从当前有效期结束日开始计算。`, `${data.card.remainingDays} days left. Renewal starts when the current term ends.`) }}
          </view>
          <view v-if="localActive" class="identity-tip calm">
            {{ tr('上课先按在场畅练卡免费，品牌年卡不重复计费。', 'Classes stay free with your Presence Pass; the brand card is not charged again.') }}
          </view>
        </view>

        <view v-else class="join">
          <text class="join-eyebrow latin">FULL YU ANNUAL MEMBER</text>
          <text class="join-title serif">{{ tr('一张卡，三店通用', 'One card, three places') }}</text>
          <text class="join-desc">
            {{ tr('时叙喝茶、在场上课、轻疗放松，走到哪都认这张卡。积分也只有一个账户。', 'Tea at Teahour, classes at Presence, rest at Retreat. One card and one points account across all three.') }}
          </text>
          <view class="join-price">
            <text class="price serif">¥{{ formatYuan(annual.priceCents) }}</text>
            <text class="price-unit">{{ tr('/ 年', '/ year') }}</text>
            <text class="price-alt">{{ tr('月卡 ¥', 'Monthly ¥') }}{{ formatYuan(month.priceCents) }}</text>
          </view>
          <button class="btn primary full" @tap="openPurchase('FY_ANNUAL')">{{ tr('开通 Full愈年卡', 'Join Full Yu Annual') }}</button>
          <text class="join-note">{{ tr('开通后可玩「愈行之旅」，消费得骰子。', 'Join to unlock the Journey game and earn dice as you spend.') }}</text>
          <text class="join-rule">{{ tr('服务权益卡 · 不含储值余额，不可提现', 'Service-benefit card · no stored balance, no cash withdrawal') }}</text>
        </view>

        <!-- 两张卡：把品牌卡和畅练卡分开说清楚 -->
        <view class="dual">
          <view class="section-head">
            <view>
              <text class="section-title serif">{{ tr('你的两张卡', 'Your two cards') }}</text>
              <text class="section-sub">{{ tr('各管一件事，互不替代', 'Each has its own job') }}</text>
            </view>
            <button class="text-link" @tap="goCompare">{{ tr('看区别', 'Compare') }}<PresenceIcon name="arrow" :size="24" /></button>
          </view>

          <view class="dual-card brand" :class="{ muted: !active }">
            <view class="dual-top">
              <view class="dual-mark">品</view>
              <view class="dual-copy">
                <text class="dual-name">{{ tr('Full愈年卡', 'Full Yu Annual') }}</text>
                <text class="dual-role">{{ tr('品牌通用 · 三店权益', 'Brand-wide · all three stores') }}</text>
              </view>
              <text class="dual-state" :class="{ on: active }">{{ active ? stateLabel : tr('未开通', 'Not active') }}</text>
            </view>
            <text class="dual-desc">{{ tr('三店会员价 · 通用积分 · 愈行之旅', 'Member prices · shared points · Journey game') }}</text>
            <text class="dual-valid">{{ active ? tr(`有效期至 ${formatDate(data.card.validUntil)} · 还有 ${data.card.remainingDays} 天`, `Valid until ${formatDate(data.card.validUntil)} · ${data.card.remainingDays} days left`) : tr('可选开通，不影响畅练卡', 'Optional. Your Presence Pass is unaffected.') }}</text>
            <text class="dual-points">{{ tr('积分 ', 'Points ') }}{{ data.points.balance }} · {{ tr('骰子 ', 'Dice ') }}{{ data.dice.balance }}</text>
          </view>

          <view class="dual-card local" :class="{ muted: !localActive }">
            <view class="dual-top">
              <view class="dual-mark pass">练</view>
              <view class="dual-copy">
                <text class="dual-name">{{ tr('在场畅练卡', 'Presence Pass') }}</text>
                <text class="dual-role">{{ tr('在场本店 · 有效期免费上课', 'Presence only · free classes') }}</text>
              </view>
              <text class="dual-state" :class="{ on: localActive }">{{ localActive ? cardStateLabel(localPass?.state) : tr('未开通', 'Not active') }}</text>
            </view>
            <text class="dual-desc">{{ tr('有效期内课程免费 · 可提前预约 · 到店签到', 'Free classes · priority booking · on-site check-in') }}</text>
            <text class="dual-valid">{{ localPass?.validUntil ? tr(`有效期至 ${formatDate(localPass.validUntil)} · 还有 ${localPass.remainingDays} 天`, `Valid until ${formatDate(localPass.validUntil)} · ${localPass.remainingDays} days left`) : tr('按在场会员页的卡种与规则', 'See Presence membership for plans') }}</text>
            <text class="dual-note">{{ tr('由在场单独管理，购买与续费仍在畅练卡页面。', 'Managed by Presence. Buy or renew on the Presence Pass page.') }}</text>
            <button class="text-link dual-link" @tap="goLocalMember">{{ localActive ? tr('查看畅练卡', 'View Presence Pass') : tr('了解畅练卡', 'About Presence Pass') }}<PresenceIcon name="arrow" :size="24" /></button>
          </view>

          <view class="dual-tip" :class="{ calm: localActive }">
            <PresenceIcon name="info" :size="28" />
            <text>{{ dualNote }}</text>
          </view>

          <view class="precedence">
            <text class="precedence-title">{{ tr('上课怎么计价', 'How class pricing works') }}</text>
            <view class="precedence-flow">
              <text class="precedence-step on">{{ tr('畅练卡免费', 'Pass free') }}</text>
              <PresenceIcon name="arrow" :size="22" color="#756a55" />
              <text class="precedence-step" :class="{ dim: !active }">{{ tr('品牌会员价', 'Brand member price') }}</text>
              <PresenceIcon name="arrow" :size="22" color="#756a55" />
              <text class="precedence-step dim">{{ tr('原价', 'List price') }}</text>
            </view>
            <text class="precedence-note">{{ tr('按从左到右的顺序取第一个可用价格，不叠加。', 'The first available price applies; they do not stack.') }}</text>
          </view>
        </view>

        <!-- 资产 -->
        <view class="wallet">
          <view class="wallet-item">
            <text class="wallet-value serif">{{ data.points.balance }}</text>
            <text class="wallet-label">{{ tr('积分 · 三店通用', 'Points · all stores') }}</text>
          </view>
          <view class="wallet-item">
            <text class="wallet-value serif">{{ data.dice.balance }}</text>
            <text class="wallet-label">{{ tr('骰子', 'Dice') }}</text>
          </view>
          <view class="wallet-item">
            <text class="wallet-value serif">{{ data.prizes.pending }}</text>
            <text class="wallet-label">{{ tr('待领礼物', 'Pending gifts') }}</text>
          </view>
        </view>
        <view v-if="data.points.expiring" class="points-note">
          <text>{{ tr(`${data.points.expiring} 积分将于 ${formatDate(data.points.expireAt)} 到期`, `${data.points.expiring} points expire on ${formatDate(data.points.expireAt)}`) }}</text>
          <text class="points-spend">{{ tr('在场本期只展示积分，暂不抵扣', 'Display only at Presence for now') }}</text>
        </view>

        <!-- 三店权益 -->
        <view class="section">
          <view class="section-head">
            <text class="section-title serif">{{ tr('三店权益', 'Benefits across three stores') }}</text>
            <text class="earned">{{ tr('本年已省 ¥', 'Saved ¥') }}{{ formatYuan(data.savedCents) }}</text>
          </view>
          <view v-for="item in data.benefits" :key="item.business" class="benefit">
            <view class="benefit-mark" :class="`is-${item.business}`">{{ businessShort(item.business) }}</view>
            <view class="benefit-copy">
              <text class="benefit-title">{{ item.title }}</text>
              <text class="benefit-desc">{{ item.desc }}</text>
            </view>
            <text v-if="item.business === 'presence'" class="benefit-here">{{ tr('本店', 'Here') }}</text>
          </view>
          <text class="fine">{{ tr('权益按业务配置，开卡时锁定；适用门店与课程以门店公示为准，不与券、积分抵扣叠加，系统按最优价结算。', 'Benefits follow each business configuration and lock at purchase. Participating venues and classes follow in-store notices; benefits do not stack with vouchers or points, and the best price applies.') }}</text>
        </view>

        <!-- 愈行之旅 -->
        <view class="section journey">
          <view class="section-head">
            <view>
              <text class="section-title serif">{{ tr('愈行之旅', 'Journey of Healing') }}</text>
              <text class="journey-sub">{{ tr('消费得骰子，走到哪都有小惊喜', 'Earn dice as you spend and find small surprises') }}</text>
            </view>
            <view class="dice"><text class="dice-num serif">{{ data.dice.balance }}</text><text>{{ tr('颗', 'dice') }}</text></view>
          </view>
          <view class="board">
            <view v-for="(stop, index) in boardStops" :key="stop" class="stop" :class="{ done: index < 3, current: index === 3 }">
              <view class="stop-dot">{{ index + 1 }}</view>
              <text class="stop-name">{{ stop }}</text>
            </view>
          </view>
          <view class="journey-foot">
            <text class="journey-next">{{ active ? tr(`下一份礼物：${nextPrize}`, `Next gift: ${nextPrize}`) : tr('开通年卡后即可开始', 'Unlocks with Full Yu Annual') }}</text>
            <button class="btn compact" :disabled="!active" @tap="openGame">{{ active ? tr('去掷骰子', 'Roll the dice') : tr('未解锁', 'Locked') }}</button>
          </view>
          <text v-if="!gameReady" class="fine">{{ tr('开通有效 Full愈卡后即可进入愈行之旅。', 'Unlocks with an active Full Yu card.') }}</text>
        </view>

        <!-- 开通 / 续费 -->
        <view class="section">
          <view class="section-head">
            <text class="section-title serif">{{ active ? tr('续费', 'Renew') : tr('开通', 'Join') }}</text>
            <text class="earned">{{ purchaseMode === 'mock' ? tr('本单由在场收款', 'Paid to Presence') : tr('线上支付接入中', 'Online payment coming soon') }}</text>
          </view>
          <view class="products">
            <button
              v-for="product in products"
              :key="product.code"
              class="product"
              :class="{ selected: selectedCode === product.code }"
              @tap="selectedCode = product.code"
            >
              <text class="product-name">{{ product.name }}</text>
              <text class="product-price serif">¥{{ formatYuan(product.priceCents) }}</text>
              <text class="product-period">{{ productPeriod(product) }}</text>
            </button>
          </view>
          <button class="btn primary full" @tap="openPurchase(selectedCode)">
            {{ active ? tr('续费 ', 'Renew ') : tr('开通 ', 'Join ') }}{{ selectedProduct.name }} · ¥{{ formatYuan(selectedProduct.priceCents) }}
          </button>
          <text class="fine">{{ tr('品牌年卡不包含畅练卡的免费课程；两张卡可同时生效。开卡后 7 天内且三店均未使用权益可全额退；之后按实付减已省计算，最低为 0。', 'The brand card does not include free class passes. Both cards can be active together. Full refund within 7 days if no benefit is used at any store; afterwards, the amount paid less savings already enjoyed, with a minimum of 0.') }}</text>
          <text v-if="purchaseMode !== 'mock'" class="fine">{{ tr('线上支付接入中，暂不能在在场在线开通；已购卡权益与愈行之旅不受影响。', 'Online payment is not live yet, so joining here is unavailable; existing card benefits and the journey game are unaffected.') }}</text>
        </view>

        <!-- 规则摘要：年卡是服务权益，不是储值，避免只看到「三店通用」就误以为是余额卡 -->
        <view class="section rules">
          <view class="section-head">
            <text class="section-title serif">{{ tr('会员规则', 'Member rules') }}</text>
            <text class="earned">{{ tr('权益卡 · 非储值', 'Benefit card') }}</text>
          </view>
          <text class="rule-line">{{ tr('年卡 365 天、月卡 30 天，续费从当前有效期结束次日起接续', 'Annual 365 days, monthly 30 days; renewal starts the day after the current term ends') }}</text>
          <text class="rule-line">{{ tr('权益以开卡配置、门店公示与结算页为准，不与券、积分、活动价叠加', 'Benefits follow the configuration at purchase, venue notices and checkout; they do not stack') }}</text>
          <text class="rule-line">{{ tr('积分三店共用一个账户，不可购买、提现或转让，按批次到期', 'One shared points account; points cannot be bought, withdrawn or transferred and expire in batches') }}</text>
          <text class="rule-line">{{ tr('卡由开通页注明的业务收款并开票，三店权益由各业务分别提供', 'The business named at checkout collects payment and issues invoices; each business provides its own benefits') }}</text>
          <button class="text-link rules-link" @tap="openRules">{{ tr('查看完整会员权益与退款规则', 'Read the full member rules') }}<PresenceIcon name="arrow" :size="24" /></button>
        </view>

        <view class="foot">
          <text>{{ tr('身心在场 · 向内生长', 'Be present · grow inward') }}</text>
          <text class="foot-sub">{{ tr('Full愈 · 在场', 'Full Yu · Presence') }}</text>
        </view>
      </template>
    </view>

    <BottomSheet :show="purchaseOpen" :title="tr('确认开通品牌会员', 'Confirm brand membership')" :busy="paying" @close="closePurchase">
      <view v-if="data" class="confirm">
        <view class="confirm-head">
          <view>
            <text class="confirm-name serif">{{ selectedProduct.name }}</text>
            <text class="confirm-desc">{{ productPeriod(selectedProduct) }} · {{ tr('三店通用', 'All three stores') }}</text>
          </view>
          <text class="confirm-price serif">¥{{ formatYuan(selectedProduct.priceCents) }}</text>
        </view>
        <view class="confirm-row"><text>{{ tr('开卡账户', 'Account') }}</text><text>{{ data.member.name }} · {{ data.member.phoneMasked }}</text></view>
        <view class="confirm-row"><text>{{ tr('包含', 'Includes') }}</text><text>{{ tr('三店会员价 · 统一积分 · 愈行之旅', 'Member prices · shared points · Journey game') }}</text></view>
        <view class="confirm-row"><text>{{ tr('卡类型', 'Card type') }}</text><text>{{ tr('服务权益卡（非储值，不可提现）', 'Service-benefit card (no stored balance)') }}</text></view>
        <view class="confirm-row"><text>{{ tr('收款方', 'Paid to') }}</text><text>{{ tr('在场（本小程序）', 'Presence (this mini program)') }}</text></view>
        <view class="confirm-row"><text>{{ tr('畅练卡', 'Presence Pass') }}</text><text>{{ localActive ? tr('保持有效，不受影响', 'Stays active, unaffected') : tr('不包含，需单独开通', 'Not included; buy separately') }}</text></view>
        <view v-if="isMock" class="mock-note">{{ tr('本地联调：不会发起真实扣款，开通只更新本页状态。', 'Local mock: no real payment. Joining only updates this page state.') }}</view>
        <view v-else class="mock-note">{{ tr('线上支付接入中，本页暂不会发起扣款；已购卡权益与愈行之旅不受影响。', 'Online payment is not live yet. This page will not charge you; your card benefits and the journey game are unaffected.') }}</view>
        <button class="btn primary full" :disabled="paying" @tap="confirmPurchase">{{ paying ? tr('处理中…', 'Processing…') : tr('确认开通', 'Confirm') }}</button>
        <button class="text-btn" @tap="closePurchase">{{ tr('再想想', 'Not now') }}</button>
      </view>
    </BottomSheet>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import FloatingBack from '@/components/FloatingBack.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'
import PageState from '@/components/PageState.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { readCapsuleLayout } from '@/utils/capsule'
import { tr, isEnglish } from '@/locale'
import { brandShareMessage, brandShareTimeline } from '@/utils/share'
import {
  CARD_PRODUCTS,
  cardStateLabel,
  formatDate,
  formatYuan,
  isMock,
  issueBrandCard,
  loadBrandMember,
  purchaseMode,
  quoteBrandCard,
  requestGameTicket,
  setMockCardState,
  type BrandCardProduct,
  type BrandMemberData
} from '@/api/brandMember'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop

const loading = ref(true)
const error = ref(false)
const data = ref<BrandMemberData | null>(null)
const purchaseOpen = ref(false)
const paying = ref(false)
const openingGame = ref(false)
const selectedCode = ref('FY_ANNUAL')
/** 本地联调强制态（?card=NONE&pass=NONE），只影响合成数据。 */
const forcedCard = ref('')
const forcedPass = ref('')

const products = computed<BrandCardProduct[]>(() => {
  const rows = data.value && data.value.products
  return Array.isArray(rows) && rows.length ? rows : CARD_PRODUCTS
})
const annual = computed(
  () => products.value.find((item) => item.code === 'FY_ANNUAL') || CARD_PRODUCTS[1]
)
const month = computed(
  () => products.value.find((item) => item.code === 'FY_MONTH') || CARD_PRODUCTS[0]
)
const selectedProduct = computed(
  () => products.value.find((item) => item.code === selectedCode.value) || annual.value
)

const active = computed(() => {
  const state = data.value?.card?.state
  return state === 'ACTIVE' || state === 'EXPIRING' || state === 'PENDING'
})
const expiring = computed(() => data.value?.card?.state === 'EXPIRING')
const stateLabel = computed(() => cardStateLabel(data.value?.card?.state))
const localPass = computed(
  () => data.value?.businessCards?.find((card) => card.code === 'PRESENCE_PASS') || null
)
const localActive = computed(
  () => localPass.value?.state === 'ACTIVE' || localPass.value?.state === 'EXPIRING'
)
/** 愈行之旅是否解锁以 CRM 返回为准，不在前端按卡状态自行推断。 */
const gameReady = computed(() => Boolean(data.value?.game?.enabled))
/** 商品目录来自 CRM；缺 period 时用有效天数说明，避免空白。 */
function productPeriod(product: BrandCardProduct) {
  return product.period || `${product.validDays} 天`
}
const boardStops = computed(() => [
  tr('起点', 'Start'),
  tr('免费茶饮', 'Free tea'),
  tr('+10 积分', '+10 points'),
  tr('五感惊喜卡', 'Sensory gift'),
  tr('在场体验课', 'Presence class')
])
const nextPrize = computed(() => tr('免费茶饮', 'Free tea'))
const dualNote = computed(() => {
  if (active.value && localActive.value) {
    return tr('两张卡同时生效：上课先按畅练卡免费，时叙和轻疗用品牌会员价。', 'Both cards are active: classes stay free with your Presence Pass; member prices apply at Teahour and Retreat.')
  }
  if (!active.value && localActive.value) {
    return tr('你的畅练卡不受影响。品牌年卡是可选的跨店权益，不会替代畅练卡。', 'Your Presence Pass is unaffected. The brand card is an optional cross-store benefit and never replaces it.')
  }
  if (active.value && !localActive.value) {
    return tr('品牌年卡不含免费课程。需要畅练时，请在在场单独开通畅练卡。', 'The brand card does not include free classes. To practice freely, join the Presence Pass separately.')
  }
  return tr('两张卡各管一件事：畅练卡管免费上课，品牌年卡管三店权益与积分。', 'Each card has one job: the Pass covers free classes; the Annual card covers cross-store benefits and points.')
})

function businessShort(business: string) {
  return ({ teahour: tr('时', 'T'), presence: tr('在', 'P'), retreat: tr('轻', 'R') } as Record<string, string>)[business] || tr('愈', 'F')
}

async function load() {
  loading.value = true
  error.value = false
  try {
    data.value = await loadBrandMember()
    if (isMock) {
      const forced =
        forcedCard.value || uni.getStorageSync('fy.brand.mockCard') || ''
      if (forced === 'NONE' || forced === 'ACTIVE') {
        data.value = setMockCardState(
          forced,
          forcedPass.value === 'NONE' ? 'NONE' : 'ACTIVE'
        )
        uni.removeStorageSync('fy.brand.mockCard')
      }
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

onLoad((options: any) => {
  // 本地联调：?card=NONE&pass=NONE 快速核对两张卡各自的未开通态，真实环境忽略。
  if (isMock && (options?.card === 'NONE' || options?.card === 'ACTIVE')) {
    forcedCard.value = options.card
  }
  if (isMock && options?.pass === 'NONE') {
    forcedPass.value = 'NONE'
  }
  void load()
})
onShow(() => {
  if (data.value && !loading.value) void load()
})

function goCompare() {
  uni.navigateTo({ url: '/pages/brand-member/compare' })
}
function openRules() {
  uni.navigateTo({ url: '/pages/legal/index?tab=member' })
}
function goLocalMember() {
  uni.switchTab({ url: '/pages/member/index' })
}
function openPurchase(code: string) {
  selectedCode.value = code
  purchaseOpen.value = true
}
function closePurchase() {
  if (paying.value) return
  purchaseOpen.value = false
}
async function confirmPurchase() {
  if (paying.value) return
  if (purchaseMode !== 'mock') {
    // 支付通道接入前不进入扣款流程，也不允许跳过后台直接开卡。
    uni.showToast({ title: tr('线上支付接入中，暂不能在此开通', 'Online payment is not live yet. Joining is unavailable here.'), icon: 'none' })
    return
  }
  paying.value = true
  try {
    const quote = await quoteBrandCard(selectedProduct.value.code)
    await issueBrandCard({
      quote,
      orderRef: `presence:brand-card:${Date.now()}`,
      paidCents: quote.priceCents
    })
    purchaseOpen.value = false
    await load()
    uni.showToast({ title: isMock ? tr('已开通（本地联调）', 'Joined (local mock)') : tr('已开通', 'Joined'), icon: 'none' })
  } catch {
    uni.showToast({ title: tr('开通失败，请稍后重试', 'Could not join. Please retry.'), icon: 'none' })
  } finally {
    paying.value = false
  }
}
async function openGame() {
  if (!active.value || openingGame.value) return
  openingGame.value = true
  try {
    // 每次点击都换新票据：身份页停留超过 5 分钟后旧票据会失效。
    const ticket = await requestGameTicket()
    if (!ticket || !ticket.url) {
      uni.showToast({ title: tr('游戏服务尚未配置', 'Game service is not configured'), icon: 'none' })
      return
    }
    uni.navigateTo({ url: `/pages/brand-member/game?url=${encodeURIComponent(ticket.url)}` })
  } catch {
    uni.showToast({ title: tr('游戏暂时进不去，请稍后重试', 'The game is unavailable. Please retry.'), icon: 'none' })
  } finally {
    openingGame.value = false
  }
}

const shareTitle = () => tr('Full愈年卡｜一张卡，三店通用', 'Full Yu Annual | One card across three places')
onShareAppMessage(() => brandShareMessage(shareTitle()))
// #ifdef MP-WEIXIN
onShareTimeline(() => brandShareTimeline(shareTitle()))
// #endif
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); font-size: 28rpx; }
.nav-bar { padding: 20rpx 32rpx; display: flex; align-items: center; gap: 16rpx; }
.back-spacer { width: 80rpx; height: 80rpx; flex-shrink: 0; }
.nav-copy { flex: 1; min-width: 0; }
.nav-title { display: block; font-size: 36rpx; line-height: 1.4; }
.nav-sub { display: block; font-size: 20rpx; letter-spacing: 1rpx; color: var(--c-muted); }
.dev-chip { flex-shrink: 0; font-size: 18rpx; letter-spacing: 1rpx; color: var(--c-muted); border: 1rpx solid var(--line-soft); border-radius: 999rpx; padding: 4rpx 12rpx; }
.content { padding: 8rpx 32rpx 0; }
button::after { border: none; }

.identity { position: relative; overflow: hidden; padding: 42rpx 36rpx 32rpx; border-radius: 36rpx; background: linear-gradient(145deg, #4d3a2c 0%, #6b4a35 58%, #7b5a41 100%); color: #f7f1e7; box-shadow: 0 20rpx 44rpx rgba(53, 47, 43, .22); }
.identity::after { content: ''; position: absolute; right: -76rpx; bottom: -96rpx; width: 280rpx; height: 280rpx; border-radius: 50%; border: 1rpx solid rgba(247, 241, 231, .22); }
.identity-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20rpx; }
.identity-eyebrow { display: block; font-size: 18rpx; letter-spacing: 4rpx; opacity: .72; }
.identity-name { display: block; margin-top: 12rpx; font-size: 50rpx; line-height: 1.3; }
.identity-state { flex: none; font-size: 20rpx; letter-spacing: 2rpx; padding: 6rpx 18rpx; border-radius: 999rpx; border: 1rpx solid rgba(247, 241, 231, .35); }
.identity-sub { display: block; margin-top: 26rpx; font-size: 24rpx; opacity: .82; }
.identity-valid { display: block; margin-top: 6rpx; font-size: 25rpx; }
.identity-foot { display: flex; justify-content: space-between; gap: 16rpx; margin-top: 36rpx; padding-top: 22rpx; border-top: 1rpx solid rgba(247, 241, 231, .18); font-size: 20rpx; line-height: 1.6; opacity: .82; }
.identity-here { flex: none; color: #e8c58d; }
.identity-tip { margin-top: 18rpx; padding: 16rpx 18rpx; border-radius: 16rpx; background: rgba(247, 241, 231, .12); font-size: 21rpx; line-height: 1.65; }
.identity-tip.calm { background: rgba(214, 232, 199, .16); }

.join { padding: 46rpx 38rpx 38rpx; border-radius: 36rpx; background: var(--c-card); border: 1rpx solid var(--line-soft); box-shadow: var(--shadow-card); }
.join-eyebrow { display: block; font-size: 18rpx; letter-spacing: 4rpx; color: var(--c-brown); }
.join-title { display: block; margin-top: 12rpx; font-size: 52rpx; line-height: 1.3; }
.join-desc { display: block; margin-top: 14rpx; font-size: 25rpx; line-height: 1.75; color: var(--c-muted); }
.join-price { display: flex; align-items: baseline; gap: 8rpx; margin: 34rpx 0 20rpx; }
.price { font-size: 64rpx; line-height: 1; }
.price-unit { font-size: 24rpx; color: var(--c-muted); }
.price-alt { margin-left: auto; font-size: 21rpx; color: var(--c-muted); }
.join-note { display: block; margin-top: 16rpx; text-align: center; font-size: 21rpx; color: var(--c-muted); }
.join-rule { display: block; margin-top: 8rpx; text-align: center; font-size: 22rpx; color: var(--c-brown); }
.rule-line { display: block; position: relative; padding-left: 22rpx; font-size: 22rpx; line-height: 1.85; color: var(--c-muted); }
.rule-line::before { content: ''; position: absolute; left: 2rpx; top: 14rpx; width: 6rpx; height: 6rpx; border-radius: 50%; background: var(--c-gold); }
.rules-link { margin-top: 10rpx; }

.section, .dual { margin-top: 28rpx; padding: 32rpx 30rpx; border-radius: 30rpx; background: var(--c-card); border: 1rpx solid var(--line-soft); }
.section-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16rpx; margin-bottom: 20rpx; }
.section-title { display: block; font-size: 34rpx; line-height: 1.4; }
.section-sub { display: block; margin-top: 4rpx; font-size: 21rpx; color: var(--c-muted); }
.earned { font-size: 20rpx; color: var(--c-muted); }
.text-link { display: inline-flex; align-items: center; gap: 2rpx; margin: 0; padding: 8rpx 0; background: transparent; color: var(--c-brown); font-size: 23rpx; line-height: 1.6; }

.dual-card { margin-top: 18rpx; padding: 26rpx 24rpx; border-radius: 24rpx; border: 1rpx solid var(--line-soft); background: #fffdf8; }
.dual-card.brand { background: #f6f0e5; border-color: #e2d4bb; }
.dual-card.local { background: #f2f5ea; border-color: #dbe3c8; }
.dual-card.muted { background: var(--c-card); }
.dual-top { display: flex; align-items: center; gap: 16rpx; }
.dual-mark { flex: none; width: 60rpx; height: 60rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--c-primary); color: #fbf3e2; font-family: var(--font-serif); font-size: 26rpx; }
.dual-mark.pass { background: #6d7f52; }
.dual-copy { flex: 1; min-width: 0; }
.dual-name { display: block; font-size: 29rpx; font-weight: 600; }
.dual-role { display: block; margin-top: 2rpx; font-size: 20rpx; color: var(--c-muted); }
.dual-state { flex: none; font-size: 19rpx; letter-spacing: 1rpx; color: var(--c-muted); border: 1rpx solid var(--line-soft); border-radius: 999rpx; padding: 4rpx 12rpx; }
.dual-state.on { color: var(--c-primary); border-color: rgba(104, 54, 17, .32); }
.dual-desc { display: block; margin-top: 18rpx; font-size: 23rpx; line-height: 1.65; }
.dual-valid { display: block; margin-top: 6rpx; font-size: 21rpx; line-height: 1.6; color: var(--c-muted); }
.dual-points { display: block; margin-top: 10rpx; font-size: 21rpx; color: var(--c-brown); }
.dual-note { display: block; margin-top: 10rpx; font-size: 20rpx; line-height: 1.6; color: var(--c-muted); }
.dual-link { margin-top: 8rpx; }
.dual-tip { display: flex; gap: 12rpx; align-items: flex-start; margin-top: 20rpx; padding: 20rpx 22rpx; border-radius: 20rpx; background: #fbf1df; color: #7a5518; font-size: 22rpx; line-height: 1.7; }
.dual-tip.calm { background: #eef2e3; color: #4f6135; }
.dual-tip :deep(.presence-icon) { margin-top: 4rpx; }

.precedence { margin-top: 22rpx; padding-top: 22rpx; border-top: 1rpx solid var(--line-soft); }
.precedence-title { display: block; font-size: 22rpx; font-weight: 600; }
.precedence-flow { display: flex; align-items: center; gap: 8rpx; margin-top: 14rpx; flex-wrap: wrap; }
.precedence-step { font-size: 20rpx; padding: 6rpx 14rpx; border-radius: 999rpx; background: var(--c-card-2); color: var(--c-primary); }
.precedence-step.on { background: #6d7f52; color: #f6f8ef; }
.precedence-step.dim { background: var(--c-cream); color: var(--c-muted); }
.precedence-note { display: block; margin-top: 10rpx; font-size: 20rpx; line-height: 1.6; color: var(--c-muted); }

.wallet { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 24rpx; padding: 28rpx 0; border-radius: 28rpx; background: var(--c-card); border: 1rpx solid var(--line-soft); }
.wallet-item { text-align: center; border-right: 1rpx solid var(--line-soft); }
.wallet-item:last-child { border-right: 0; }
.wallet-value { display: block; font-size: 44rpx; line-height: 1.3; }
.wallet-label { display: block; margin-top: 4rpx; font-size: 20rpx; color: var(--c-muted); }
.points-note { display: flex; justify-content: space-between; gap: 16rpx; margin-top: 14rpx; font-size: 20rpx; line-height: 1.6; color: var(--c-muted); }
.points-spend { flex: none; color: var(--c-brown); }

.benefit { display: flex; align-items: center; gap: 20rpx; padding: 18rpx 0; border-bottom: 1rpx solid var(--line-soft); }
.benefit:last-of-type { border-bottom: 0; }
.benefit-mark { flex: none; width: 60rpx; height: 60rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-serif); font-size: 25rpx; color: #fffaf2; background: #96581c; }
.benefit-mark.is-presence { background: #6d7f52; }
.benefit-mark.is-retreat { background: #a97963; }
.benefit-copy { flex: 1; min-width: 0; }
.benefit-title { display: block; font-size: 25rpx; }
.benefit-desc { display: block; margin-top: 2rpx; font-size: 21rpx; line-height: 1.6; color: var(--c-muted); }
.benefit-here { flex: none; font-size: 19rpx; letter-spacing: 1rpx; color: var(--c-brown); border: 1rpx solid var(--c-gold); border-radius: 999rpx; padding: 3rpx 12rpx; }
.fine { display: block; margin-top: 18rpx; font-size: 20rpx; line-height: 1.7; color: var(--c-muted); }

.journey { background: #f2ede3; border-color: #e4dccd; }
.journey-sub { display: block; margin-top: 4rpx; font-size: 20rpx; color: var(--c-muted); }
.dice { display: flex; align-items: baseline; gap: 4rpx; font-size: 20rpx; color: var(--c-muted); }
.dice-num { font-size: 42rpx; color: var(--c-brown); }
.board { display: flex; gap: 8rpx; overflow: hidden; padding: 12rpx 0 6rpx; }
.stop { flex: 1; min-width: 0; text-align: center; }
.stop-dot { width: 44rpx; height: 44rpx; margin: 0 auto; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 19rpx; color: var(--c-muted); background: #fffdf8; border: 1rpx solid #d9cdb9; }
.stop.done .stop-dot { background: var(--c-primary); border-color: var(--c-primary); color: #fffaf2; }
.stop.current .stop-dot { box-shadow: 0 0 0 5rpx rgba(105, 75, 61, .16); border-color: var(--c-primary); color: var(--c-primary); background: #fffaf2; }
.stop-name { display: block; margin-top: 8rpx; font-size: 18rpx; line-height: 1.4; color: var(--c-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.journey-foot { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-top: 10rpx; }
.journey-next { font-size: 21rpx; color: var(--c-muted); }

.btn { min-height: 84rpx; padding: 0 32rpx; border-radius: 999rpx; border: 1rpx solid var(--line-soft); background: var(--c-card); color: var(--c-ink); font-size: 26rpx; display: flex; align-items: center; justify-content: center; line-height: 1.4; }
.btn.primary { background: var(--c-primary); border-color: var(--c-primary); color: var(--c-rice); }
.btn.compact { min-height: 64rpx; padding: 0 26rpx; font-size: 22rpx; }
.btn.full { width: 100%; margin-top: 20rpx; }
.btn[disabled] { opacity: .45; }

.products { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; }
.product { padding: 24rpx 20rpx; text-align: left; border-radius: 22rpx; border: 1rpx solid var(--line-soft); background: #fffdf8; line-height: 1.5; }
.product.selected { border-color: var(--c-primary); box-shadow: inset 0 0 0 1rpx var(--c-primary); }
.product-name { display: block; font-size: 23rpx; }
.product-price { display: block; margin-top: 8rpx; font-size: 40rpx; color: var(--c-primary); }
.product-period { display: block; font-size: 20rpx; color: var(--c-muted); }

.foot { margin-top: 44rpx; text-align: center; font-size: 20rpx; letter-spacing: 4rpx; color: var(--c-muted); }
.foot-sub { display: block; margin-top: 6rpx; letter-spacing: 2rpx; opacity: .7; }

.confirm { padding-bottom: 8rpx; }
.confirm-head { display: flex; justify-content: space-between; gap: 20rpx; padding-bottom: 22rpx; border-bottom: 1rpx solid var(--line-soft); }
.confirm-name { display: block; font-size: 34rpx; }
.confirm-desc { display: block; margin-top: 4rpx; font-size: 21rpx; color: var(--c-muted); }
.confirm-price { font-size: 40rpx; }
.confirm-row { display: flex; justify-content: space-between; gap: 20rpx; padding: 18rpx 0; border-bottom: 1rpx solid var(--line-soft); font-size: 23rpx; line-height: 1.6; }
.confirm-row text:last-child { color: var(--c-muted); text-align: right; }
.mock-note { margin-top: 18rpx; padding: 16rpx 18rpx; border-radius: 16rpx; background: var(--c-card-2); font-size: 20rpx; line-height: 1.6; color: var(--c-muted); }
.text-btn { width: 100%; min-height: 72rpx; margin-top: 6rpx; background: transparent; font-size: 23rpx; color: var(--c-muted); }
</style>
