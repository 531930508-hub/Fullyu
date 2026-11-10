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
        <!-- 01 两张卡：品牌卡承载身份、权益与续费；畅练卡管在场上课 -->
        <view class="section cards">
          <view class="chapter-head">
            <text class="chapter-index">01</text>
            <view class="chapter-copy">
              <text class="section-title serif">{{ tr('你的两张卡', 'Your two cards') }}</text>
              <text class="section-sub">{{ tr('畅练卡同期附赠品牌会员', 'The Pass includes brand membership') }}</text>
            </view>
            <button class="text-link" @tap="goCompare">{{ tr('看区别', 'Compare') }}<PresenceIcon name="arrow" :size="24" /></button>
          </view>

          <!-- 品牌卡：权益与续费都收在卡内抽屉，页面不再另开两节 -->
          <MemberCard
            :data="data"
            :active="active"
            :products="products"
            :selected="selectedCode"
            :purchase-mode="purchaseMode"
            @select="selectedCode = $event"
            @purchase="openPurchase"
            @rules="openRules"
            @gift="openGift"
          />

          <!-- 畅练卡：在场本店的卡，卡种与续费以在场会员页为准 -->
          <view class="pass" :class="{ 'is-open': passOpen, 'is-off': !localActive }">
            <view class="pass-main">
              <view class="pass-top">
                <view class="pass-mark">练</view>
                <view class="pass-copy">
                  <text class="pass-name">{{ passName }}</text>
                  <text class="pass-role">{{ tr('在场本店 · 有效期内报课 0 元', 'Presence only · ¥0 classes while active') }}</text>
                </view>
                <text class="pass-state" :class="{ on: localActive }">{{ localActive ? cardStateLabel(localPass?.state) : tr('未开通', 'Not active') }}</text>
              </view>
              <text class="pass-valid">{{ passValidLine }}</text>
            </view>
            <view class="pass-foot" role="button" @tap="passOpen = !passOpen">
              <text>{{ localActive ? tr('畅练卡权益', 'Pass benefits') : tr('了解畅练卡', 'About the Pass') }}</text>
              <text class="pass-car" :class="{ 'is-up': passOpen }">⌄</text>
            </view>
            <view class="pass-drawer">
              <view class="pass-drawer-in">
                <view v-for="item in passBenefits" :key="item" class="pass-ben">
                  <text class="pass-ben-t">{{ item }}</text>
                </view>
                <text class="pass-note">{{ tr('畅练卡由在场单独售卖与核销，卡种与续费以在场会员页为准。', 'Sold and managed by Presence; plans and renewal live on the Presence membership page.') }}</text>
                <button class="btn compact pass-link" @tap="goLocalMember">{{ localActive ? tr('查看畅练卡', 'View Presence Pass') : tr('打开在场会员页', 'Open Presence membership') }}</button>
              </view>
            </view>
          </view>

          <view class="precedence">
            <text class="precedence-title">{{ tr('上课怎么计价', 'How class pricing works') }}</text>
            <view class="precedence-flow">
              <text class="precedence-step on">{{ tr('畅练卡 0 元', 'Pass ¥0') }}</text>
              <PresenceIcon name="arrow" :size="22" color="#756a55" />
              <text class="precedence-step" :class="{ dim: !active }">{{ tr('品牌会员价', 'Brand member price') }}</text>
              <PresenceIcon name="arrow" :size="22" color="#756a55" />
              <text class="precedence-step dim">{{ tr('原价', 'List price') }}</text>
            </view>
          </view>
        </view>

        <!-- 02 会员公告：后台发布后只对有效会员展示，置顶优先 -->
        <view v-if="active && notices.length" class="section notices">
          <view class="chapter-head">
            <text class="chapter-index">{{ chap.notices }}</text>
            <view class="chapter-copy">
              <text class="section-title serif">{{ tr('会员公告', 'Member notices') }}</text>
            </view>
            <text class="earned">{{ tr('仅会员', 'Members only') }}</text>
          </view>
          <view v-for="item in notices" :key="item.id" class="notice-item">
            <view class="notice-head">
              <text class="notice-title">{{ item.title }}</text>
              <text v-if="item.pinned" class="notice-pin">{{ tr('置顶', 'Pinned') }}</text>
            </view>
            <text class="notice-body">{{ item.body }}</text>
            <text v-if="item.publishedAt" class="notice-date">{{ item.publishedAt }}</text>
          </view>
        </view>

        <!-- 03 愈行之旅：用进度条和按钮引导，不堆规则文字 -->
        <view v-if="active" class="section journey">
          <view class="chapter-head">
            <text class="chapter-index">{{ chap.journey }}</text>
            <view class="chapter-copy">
              <text class="section-title serif">{{ tr('愈行之旅', 'Journey of Healing') }}</text>
              <text class="section-sub">{{ tr('消费得骰子', 'Earn dice as you spend') }}</text>
            </view>
            <view class="dice" :class="{ debt: diceDebt > 0 }">
              <text class="dice-num serif">{{ data.dice.balance }}</text>
              <text>{{ diceDebt > 0 ? tr('待补', 'owed') : tr('颗', 'dice') }}</text>
            </view>
          </view>
          <view v-if="progress" class="progress">
            <view class="progress-head">
              <text class="progress-title">{{ progress.headline }}</text>
              <text class="progress-num serif">{{ progress.percent }}%</text>
            </view>
            <view class="progress-track" role="progressbar" :aria-valuenow="progress.percent" aria-valuemin="0" aria-valuemax="100">
              <view class="progress-fill" :style="{ width: progress.percent + '%' }" />
            </view>
            <text v-if="diceDebt > 0" class="journey-debt">{{ tr(`先补回 ${diceDebt} 颗，再得新骰子`, `Repay ${diceDebt} dice before earning new ones`) }}</text>
            <text v-else class="progress-note">{{ tr(`每满 ¥${formatYuan(progress.perDieCents)} 得 1 颗`, `1 die per ¥${formatYuan(progress.perDieCents)}`) }}</text>
            <view v-if="progress.tip" class="progress-tip">
              <view class="benefit-mark small" :class="`is-${progress.tip.external}`">{{ businessShort(progress.tip.external) }}</view>
              <view class="benefit-copy">
                <text class="benefit-title">{{ progress.tip.title }}</text>
                <text class="benefit-desc">{{ progress.tip.text }}</text>
              </view>
            </view>
          </view>
          <view class="journey-foot">
            <text class="journey-next">{{ data.prizes.pending ? tr(`待领礼物 ${data.prizes.pending} 份`, `${data.prizes.pending} ${data.prizes.pending === 1 ? 'gift' : 'gifts'} to collect`) : '' }}</text>
            <button class="btn compact" :disabled="!gameReady" @tap="openGame">{{ gameReady ? tr('去掷骰子', 'Roll the dice') : tr('未解锁', 'Locked') }}</button>
          </view>
        </view>

        <!-- 04 礼物与邀请：年卡礼、邀请、会员码收在同一组 -->
        <view v-if="vouchers.length || active" class="section gift-panel">
          <view class="chapter-head">
            <text class="chapter-index">{{ chap.gifts }}</text>
            <view class="chapter-copy">
              <text class="section-title serif">{{ tr('礼物与邀请', 'Gifts & invites') }}</text>
            </view>
            <text class="earned">{{ vouchers.length ? tr('任一门店可领', 'Redeem at any store') : tr('会员专享', 'Members') }}</text>
          </view>
          <view v-for="item in vouchers" :key="item.code" class="voucher" :class="{ used: item.status !== 'ISSUED' }">
            <view class="benefit-copy">
              <text class="benefit-title">{{ item.title }}</text>
              <text class="benefit-desc">{{ voucherNote(item) }}</text>
            </view>
            <view class="voucher-code">
              <text class="voucher-num">{{ item.code }}</text>
              <text class="voucher-state">{{ voucherStatusLabel(item.status) }}</text>
            </view>
          </view>

          <!-- 邀请好友：名额由会员卡权益配置 -->
          <view v-if="active && inviteQuota > 0" class="group-row">
            <view class="benefit-copy">
              <text class="benefit-title">{{ tr('邀请好友来在场', 'Invite a friend') }}</text>
              <text class="benefit-desc">{{ tr(`本月还可邀请 ${inviteRemaining} 位 · 好友得 1 节体验课`, `${inviteRemaining} left this month · friend gets 1 trial class`) }}</text>
            </view>
          </view>
          <view v-for="item in openInvites" :key="item.code" class="invite-row">
            <view class="benefit-copy">
              <text class="voucher-num">{{ item.code }}</text>
            </view>
            <!-- #ifdef MP-WEIXIN -->
            <button class="btn compact" open-type="share" :data-code="item.code">{{ tr('发给好友', 'Share') }}</button>
            <!-- #endif -->
            <!-- #ifndef MP-WEIXIN -->
            <button class="btn compact" @tap="copyInvite(item.code)">{{ tr('复制邀请码', 'Copy code') }}</button>
            <!-- #endif -->
          </view>
          <button v-if="active && inviteQuota > 0" class="btn full" :disabled="creatingInvite || inviteRemaining <= 0" @tap="newInvite">
            {{ inviteRemaining <= 0 ? tr('本月邀请名额已用完', 'No invites left this month') : creatingInvite ? tr('生成中…', 'Creating…') : tr('生成一张邀请', 'Create an invite') }}
          </button>
          <text v-if="claimedInvites" class="fine">{{ tr(`本月已有 ${claimedInvites} 位好友领取`, `${claimedInvites} friends claimed this month`) }}</text>
          <text v-if="inviteError" class="fine">{{ inviteError }}</text>

          <view v-if="active" class="group-row divided">
            <view class="benefit-copy">
              <text class="benefit-title">{{ tr('兑换会员码', 'Redeem a member code') }}</text>
              <text class="benefit-desc">{{ tr('兑换后有效期自动顺延', 'Extends your membership') }}</text>
            </view>
            <button class="btn compact" @tap="openGift">{{ tr('兑换', 'Redeem') }}</button>
          </view>
        </view>

        <!-- 05 会员专属：故事与反馈放在同一组 -->
        <view v-if="active" class="section">
          <view class="chapter-head">
            <text class="chapter-index">{{ chap.members }}</text>
            <view class="chapter-copy">
              <text class="section-title serif">{{ tr('会员专属', 'Members only') }}</text>
            </view>
            <text class="earned">{{ tr('故事与建议', 'Stories & ideas') }}</text>
          </view>
          <template v-if="storyPreview.length">
            <view v-for="item in storyPreview" :key="item.id" class="story">
              <text class="story-title serif">{{ item.title }}</text>
              <text v-if="item.quote" class="story-quote">“{{ item.quote }}”{{ item.quoteBy ? ` —— ${item.quoteBy}` : '' }}</text>
              <text class="story-body">{{ item.story }}</text>
            </view>
            <button v-if="stories.length > storyPreview.length" class="text-link story-more" @tap="openStories">
              {{ tr(`查看全部 ${stories.length} 篇故事`, `Read all ${stories.length} stories`) }}<PresenceIcon name="arrow" :size="24" />
            </button>
          </template>
          <text v-else class="fine">{{ storiesError || tr('会员故事整理中。', 'Member stories are on their way.') }}</text>
          <view class="group-row divided" @tap="openFeedback">
            <view class="benefit-copy">
              <text class="benefit-title">{{ tr('写下你的建议', 'Share a suggestion') }}</text>
              <text class="benefit-desc">{{ tr('想上什么课、哪里不舒服，都可以说', 'Tell us what you want or what felt off') }}</text>
            </view>
            <PresenceIcon name="arrow" :size="24" color="#756a55" />
          </view>
        </view>

        <!-- 规则只留入口（卡内抽屉也有同样入口） -->
        <view class="section flat">
          <button class="text-link rules-link" @tap="openRules">
            {{ tr('会员权益与退款规则', 'Member benefits and refund rules') }}<PresenceIcon name="arrow" :size="24" />
          </button>
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
        <view class="confirm-row"><text>{{ tr('包含', 'Includes') }}</text><text>{{ tr('三店会员价 · 愈行之旅', 'Member prices · Journey game') }}</text></view>
        <view class="confirm-row"><text>{{ tr('卡类型', 'Card type') }}</text><text>{{ tr('服务权益卡（非储值，不可提现）', 'Service-benefit card (no stored balance)') }}</text></view>
        <view class="confirm-row"><text>{{ tr('收款方', 'Paid to') }}</text><text>{{ tr('在场（本小程序）', 'Presence (this mini program)') }}</text></view>
        <view class="confirm-row"><text>{{ tr('畅练卡', 'Presence Pass') }}</text><text>{{ localActive ? tr('保持有效，不受影响', 'Stays active, unaffected') : tr('不包含，需单独开通', 'Not included; buy separately') }}</text></view>
        <view v-if="isMock" class="mock-note">{{ tr('本地联调：不会发起真实扣款，开通只更新本页状态。', 'Local mock: no real payment. Joining only updates this page state.') }}</view>
        <view v-else class="mock-note">{{ tr('线上支付接入中，本页暂不会发起扣款；已购卡权益与愈行之旅不受影响。', 'Online payment is not live yet. This page will not charge you; your card benefits and the journey game are unaffected.') }}</view>
        <button class="btn primary full" :disabled="paying" @tap="confirmPurchase">{{ paying ? tr('处理中…', 'Processing…') : tr('确认开通', 'Confirm') }}</button>
        <button class="text-btn" @tap="closePurchase">{{ tr('再想想', 'Not now') }}</button>
      </view>
    </BottomSheet>

    <BottomSheet :show="giftOpen" :title="tr('兑换会员码', 'Redeem a member code')" :busy="claiming" @close="closeGift">
      <view class="confirm">
        <text class="sheet-desc">{{ tr('输入活动卡片或朋友分享的会员码。兑换后有效期自动顺延，已开通的从当前到期日起接续。', 'Enter a code from an event card or a friend. Your membership extends from the current end date.') }}</text>
        <input class="code-input" :value="giftCode" :maxlength="16" :placeholder="tr('例如 WELCOME30', 'e.g. WELCOME30')" placeholder-class="input-ph" confirm-type="done" @input="(e: any) => (giftCode = e.detail.value)" @confirm="confirmGift" />
        <text class="fine">{{ tr('每个会员码有名额与兑换截止日期，以兑换结果为准；同一账号每个码只能兑换一次。', 'Each code has a quota and a deadline. One redemption per account per code.') }}</text>
        <button class="btn primary full" :disabled="claiming" @tap="confirmGift">{{ claiming ? tr('兑换中…', 'Redeeming…') : tr('确认兑换', 'Redeem') }}</button>
        <button class="text-btn" @tap="closeGift">{{ tr('取消', 'Cancel') }}</button>
      </view>
    </BottomSheet>

    <BottomSheet :show="feedbackOpen" :title="tr('写下你的建议', 'Share your suggestion')" :busy="sending" @close="closeFeedback">
      <view class="confirm">
        <text class="sheet-desc">{{ tr('想要什么样的课程、茶或疗愈体验，哪里让你不舒服，都可以告诉我们。每条都会有人看。', 'Tell us what classes, tea or care you would like, or what felt off. Every note is read.') }}</text>
        <textarea class="feedback-input" :value="feedbackText" :maxlength="1000" :placeholder="tr('至少 5 个字', 'At least 5 characters')" placeholder-class="input-ph" @input="(e: any) => (feedbackText = e.detail.value)" />
        <text class="count">{{ feedbackLength }} / 1000</text>
        <view class="check" role="checkbox" :aria-checked="allowQuote" @tap="allowQuote = !allowQuote">
          <view class="check-box" :class="{ on: allowQuote }"><PresenceIcon v-if="allowQuote" name="check" :size="22" color="#f5f6ed" /></view>
          <text>{{ tr('同意匿名整理进会员故事（只展示姓氏）', 'Allow an anonymised quote in member stories (surname only)') }}</text>
        </view>
        <button class="btn primary full" :disabled="sending" @tap="sendFeedback">{{ sending ? tr('提交中…', 'Sending…') : tr('提交', 'Send') }}</button>
        <button class="text-btn" @tap="closeFeedback">{{ tr('取消', 'Cancel') }}</button>
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
import MemberCard from '@/components/MemberCard.vue'
import { readCapsuleLayout } from '@/utils/capsule'
import { tr, isEnglish } from '@/locale'
import { brandShareMessage, brandShareTimeline } from '@/utils/share'
import { useUserStore } from '@/stores/user'
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
  claimGiftCode,
  submitFeedback,
  loadStories,
  loadInvites,
  createInvite,
  inviteSharePath,
  isValidCode,
  normalizeCode,
  parseGiftScene,
  stashPendingGift,
  voucherStatusLabel,
  type BrandCardProduct,
  type BrandMemberData,
  type BrandInviteList,
  type BrandPickupVoucher,
  type BrandStory
} from '@/api/brandMember'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const userStore = useUserStore()

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
const selectedProduct = computed(
  () => products.value.find((item) => item.code === selectedCode.value) || products.value.find((item) => item.code === 'FY_ANNUAL') || products.value[0] || CARD_PRODUCTS[1]
)

const active = computed(() => {
  const state = data.value?.card?.state
  return state === 'ACTIVE' || state === 'EXPIRING' || state === 'PENDING'
})
// 骰子进度、续费提醒与年卡礼都由 CRM 计算；页面只展示，不在前端推算金额。
const progress = computed(() => data.value?.dice?.progress || null)
// 退款可能把骰子扣成负数；欠账先补回，进度文案由 CRM 一并计算。
const diceDebt = computed(() => {
  const balance = data.value?.dice?.balance || 0
  return balance < 0 ? Math.abs(balance) : 0
})
const vouchers = computed<BrandPickupVoucher[]>(() => (Array.isArray(data.value?.vouchers) ? data.value!.vouchers! : []))
// 公告、故事都只对有效会员返回；前端不做额外推断。
const notices = computed(() => (Array.isArray(data.value?.notices) ? data.value!.notices! : []))
const stories = ref<BrandStory[]>([])
const storiesError = ref('')
const storyPreview = computed(() => stories.value.slice(0, 2))
// 章节号跟着 v-if 走：公告为空时不留空号，避免 01 之后直接跳到 03。
const chap = computed(() => {
  let n = 1
  const next = () => String(++n).padStart(2, '0')
  const map: Record<'notices' | 'journey' | 'gifts' | 'members', string> = {} as any
  if (active.value && notices.value.length) map.notices = next()
  if (active.value) map.journey = next()
  if (vouchers.value.length || active.value) map.gifts = next()
  if (active.value) map.members = next()
  return map
})
const invites = ref<BrandInviteList | null>(null)
const inviteError = ref('')
const creatingInvite = ref(false)
const inviteQuota = computed(() => invites.value?.quota ?? data.value?.perks?.presence?.invitesPerMonth ?? 0)
const inviteRemaining = computed(() => Math.max(0, invites.value?.remaining ?? inviteQuota.value))
const openInvites = computed(() => (invites.value?.invites || []).filter((item) => !item.claimed && item.status !== 'EXPIRED' && item.status !== 'VOID'))
const claimedInvites = computed(() => (invites.value?.invites || []).filter((item) => item.claimed).length)
const giftOpen = ref(false)
const giftCode = ref('')
const claiming = ref(false)
const feedbackOpen = ref(false)
const feedbackText = ref('')
const allowQuote = ref(false)
const sending = ref(false)
const feedbackLength = computed(() => feedbackText.value.trim().length)
const localPass = computed(
  () => data.value?.businessCards?.find((card) => card.code === 'PRESENCE_PASS') || null
)
const localActive = computed(
  () => localPass.value?.state === 'ACTIVE' || localPass.value?.state === 'EXPIRING'
)
// 畅练卡抽屉默认收起，避免两张卡同时铺开太长。
const passOpen = ref(false)
const passName = computed(() => (isEnglish() ? 'Presence Pass' : localPass.value?.name || '在场畅练卡'))
const passValidLine = computed(() => {
  const pass = localPass.value
  if (!pass || !localActive.value) return tr('按在场会员页的卡种与规则', 'See the Presence membership page for plans')
  const until = pass.validUntil ? formatDate(pass.validUntil) : ''
  // 临期才补剩余天数，平时只报到到期日。
  const tail = pass.state === 'EXPIRING' && pass.remainingDays ? tr(` · 还剩 ${pass.remainingDays} 天`, ` · ${pass.remainingDays} days left`) : ''
  return tr(`有效期至 ${until}${tail}`, `Valid until ${until}${tail}`)
})
/** 畅练卡权益由在场系统给出（中文），英文界面下按已知文案翻译。 */
const PASS_BENEFIT_EN: Record<string, string> = {
  '有效期内报课 0 元': '¥0 classes while active',
  '同期附赠 Full愈 品牌会员': 'Includes Full Yu brand membership',
  '优先排位热门课程': 'Priority waitlist on popular classes',
  '提前 24 小时免费取消': 'Free cancellation up to 24 hours ahead'
}
const passBenefits = computed(() => {
  const rows = localPass.value?.benefits || []
  const list = rows.length ? rows : [tr('有效期内报课 0 元', '¥0 classes while active'), tr('同期附赠 Full愈 品牌会员', 'Includes Full Yu brand membership')]
  return isEnglish() ? list.map((item) => PASS_BENEFIT_EN[item] || item) : list
})
/** 愈行之旅是否解锁以 CRM 返回为准，不在前端按卡状态自行推断。 */
const gameReady = computed(() => Boolean(data.value?.game?.enabled))
/** 商品目录来自 CRM；缺 period 时用有效天数说明，避免空白。 */
function productPeriod(product: BrandCardProduct) {
  return product.period || `${product.validDays} 天`
}

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
      if (forced === 'NONE' || forced === 'ACTIVE' || forced === 'EXPIRING') {
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
  if (data.value && active.value) {
    void refreshStories()
    void refreshInvites()
  } else {
    stories.value = []
    invites.value = null
  }
}

async function refreshStories() {
  storiesError.value = ''
  try {
    const res = await loadStories()
    stories.value = Array.isArray(res?.stories) ? res.stories : []
  } catch {
    stories.value = []
    // 仅会员可见；读取失败只给一句温和提示，不影响身份页。
    storiesError.value = tr('会员故事暂时没读到，稍后再看看。', 'Stories are unavailable right now.')
  }
}

async function refreshInvites() {
  inviteError.value = ''
  try {
    invites.value = await loadInvites()
  } catch {
    invites.value = null
    inviteError.value = tr('邀请名额暂时没读到，稍后再试。', 'Invites are unavailable right now.')
  }
}

async function newInvite() {
  if (creatingInvite.value || inviteRemaining.value <= 0) return
  creatingInvite.value = true
  inviteError.value = ''
  try {
    await createInvite()
    await refreshInvites()
    uni.showToast({ title: tr('邀请已生成，点「发给好友」', 'Invite ready. Tap Share.'), icon: 'none' })
  } catch (err: any) {
    inviteError.value = err?.message || tr('生成失败，请稍后重试', 'Could not create an invite. Please retry.')
  } finally {
    creatingInvite.value = false
  }
}

function copyInvite(code: string) {
  uni.setClipboardData({ data: code })
}

function voucherNote(item: BrandPickupVoucher) {
  if (item.status === 'REDEEMED' && item.redeemedAt) {
    const when = formatDate(item.redeemedAt)
    return item.redeemedStore ? tr(`已于 ${when} 在 ${item.redeemedStore} 领取`, `Collected on ${when} at ${item.redeemedStore}`) : tr(`已于 ${when} 领取`, `Collected on ${when}`)
  }
  if (item.status === 'VOID') return tr('该提货码已作废', 'This code is void')
  return item.desc || tr('任一门店出示提货码，店员核销一次', 'Show this code at any store to collect once')
}

function openGift() {
  giftCode.value = ''
  giftOpen.value = true
}
function closeGift() {
  if (!claiming.value) giftOpen.value = false
}
async function confirmGift() {
  if (claiming.value) return
  const code = normalizeCode(giftCode.value)
  if (!isValidCode(code)) {
    uni.showToast({ title: tr('会员码为 4–16 位字母或数字', 'Codes are 4–16 letters or digits'), icon: 'none' })
    return
  }
  claiming.value = true
  try {
    const res = await claimGiftCode(code)
    giftOpen.value = false
    await load()
    uni.showToast({
      title: res?.replayed ? tr('这个会员码已兑换过', 'Already redeemed') : res?.days ? tr(`已兑换 ${res.days} 天`, `${res.days} days added`) : tr('兑换成功', 'Redeemed'),
      icon: 'none'
    })
  } catch (err: any) {
    // 名额已满、已截止、码无效等文案由 CRM 判定，原样展示。
    uni.showToast({ title: err?.message || tr('兑换失败，请稍后重试', 'Could not redeem. Please retry.'), icon: 'none' })
  } finally {
    claiming.value = false
  }
}

function openFeedback() {
  feedbackOpen.value = true
}
/** 扫后台生成的小程序码进来：登录后自动兑换，不必再手输会员码。 */
async function claimSceneGift(code: string) {
  if (!code || claiming.value) return
  claiming.value = true
  try {
    const res = await claimGiftCode(code)
    await load()
    uni.showToast({
      title: res?.replayed
        ? tr('这个会员码已兑换过', 'Already redeemed')
        : res?.days
          ? tr(`已领取 ${res.days} 天会员`, `${res.days} days added`)
          : tr('会员码已领取', 'Membership added'),
      icon: 'none'
    })
  } catch (err: any) {
    uni.showToast({ title: err?.message || tr('会员码领取失败，请稍后重试', 'Could not redeem. Please retry.'), icon: 'none' })
  } finally {
    claiming.value = false
  }
}
function closeFeedback() {
  if (!sending.value) feedbackOpen.value = false
}
async function sendFeedback() {
  if (sending.value) return
  const content = feedbackText.value.trim()
  if (content.length < 5) {
    uni.showToast({ title: tr('再多写几个字吧', 'Please write a little more'), icon: 'none' })
    return
  }
  sending.value = true
  try {
    await submitFeedback(content, allowQuote.value)
    feedbackOpen.value = false
    feedbackText.value = ''
    allowQuote.value = false
    uni.showToast({ title: tr('收到了，谢谢你', 'Received. Thank you'), icon: 'none' })
  } catch (err: any) {
    uni.showToast({ title: err?.message || tr('提交失败，请稍后重试', 'Could not send. Please retry.'), icon: 'none' })
  } finally {
    sending.value = false
  }
}

onLoad((options: any) => {
  // 本地联调：?card=NONE|EXPIRING&pass=NONE 快速核对未开通、临期续费等状态，真实环境忽略。
  if (isMock && ['NONE', 'ACTIVE', 'EXPIRING'].includes(options?.card)) {
    forcedCard.value = options.card
  }
  if (isMock && options?.pass === 'NONE') {
    forcedPass.value = 'NONE'
  }
  const sceneCode = parseGiftScene(options || {})
  if (sceneCode && !userStore.isLoggedIn) {
    // 未登录先记住口令，登录成功后由「我的」自动领取。
    stashPendingGift(sceneCode)
    uni.switchTab({ url: '/pages/profile/index' })
    return
  }
  void load().then(() => {
    if (sceneCode) void claimSceneGift(sceneCode)
  })
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
function openStories() {
  uni.navigateTo({ url: '/pages/brand-member/stories/index' })
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
onShareAppMessage((res: any) => {
  // 「发给好友」按钮带邀请码：好友打开落地页，登录后领取在场免费体验课。
  const code = res?.from === 'button' ? res?.target?.dataset?.code : ''
  if (code) {
    return brandShareMessage(
      tr(`${data.value?.member?.name || '朋友'}请你来在场上一节免费体验课`, 'A friend invites you to a free class at Presence'),
      inviteSharePath(code)
    )
  }
  return brandShareMessage(shareTitle())
})
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

.section { margin-top: 28rpx; padding: 32rpx 30rpx; border-radius: 30rpx; background: var(--c-card); border: 1rpx solid var(--line-soft); }
.section.flat { padding: 6rpx 30rpx; }
.gift-panel { background: #faf6ec; border-color: #ece3d2; }
.section-title { display: block; font-size: 34rpx; line-height: 1.4; }
.section-sub { display: block; margin-top: 4rpx; font-size: 21rpx; color: var(--c-muted); }
.earned { font-size: 20rpx; color: var(--c-muted); }
.chapter-head { display: flex; align-items: center; gap: 14rpx; margin-bottom: 20rpx; }
.chapter-index { flex: none; font-family: var(--serif); font-size: 20rpx; letter-spacing: 2rpx; color: var(--c-secondary); }
.chapter-copy { flex: 1; min-width: 0; }
.group-row { display: flex; align-items: center; gap: 20rpx; padding: 18rpx 0; }
.group-row.divided { border-top: 1rpx solid var(--line-soft); }
.text-link { display: inline-flex; align-items: center; gap: 2rpx; margin: 0; padding: 8rpx 0; background: transparent; color: var(--c-brown); font-size: 23rpx; line-height: 1.6; }

/* 畅练卡：在场本店的卡，浅绿区分，抽屉与品牌卡同一套开合手感 */
.pass { margin-top: 20rpx; border-radius: 28rpx; border: 1rpx solid #dbe3c8; background: #f2f5ea; overflow: hidden; }
.pass.is-off { background: var(--c-card); border-color: var(--line-soft); }
.pass-main { padding: 22rpx 24rpx 16rpx; }
.pass-top { display: flex; align-items: center; gap: 14rpx; }
.pass-mark { flex: none; width: 56rpx; height: 56rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #6d7f52; color: #f6f8ef; font-family: var(--serif); font-size: 24rpx; }
.pass.is-off .pass-mark { background: var(--c-cream); color: var(--c-muted); }
.pass-copy { flex: 1; min-width: 0; }
.pass-name { display: block; font-size: 28rpx; font-weight: 600; }
.pass-role { display: block; margin-top: 2rpx; font-size: 20rpx; color: var(--c-muted); }
.pass-state { flex: none; font-size: 19rpx; letter-spacing: 1rpx; color: var(--c-muted); border: 1rpx solid var(--line-soft); border-radius: 999rpx; padding: 4rpx 14rpx; }
.pass-state.on { color: #55663f; border-color: rgba(109, 127, 82, .45); }
.pass-valid { display: block; margin-top: 14rpx; font-size: 21rpx; line-height: 1.6; color: var(--c-muted); }
.pass-foot { display: flex; align-items: center; justify-content: space-between; padding: 12rpx 24rpx; border-top: 1rpx solid rgba(109, 127, 82, .18); font-size: 21rpx; color: #55663f; }
.pass.is-off .pass-foot { border-top-color: var(--line-soft); color: var(--c-brown); }
.pass-car { font-size: 22rpx; transition: transform .25s ease; }
.pass-car.is-up { transform: rotate(180deg); }
.pass-drawer { max-height: 0; overflow: hidden; transition: max-height .28s ease; }
.pass.is-open .pass-drawer { max-height: 520rpx; }
.pass-drawer-in { padding: 4rpx 24rpx 20rpx; }
.pass-ben { padding: 12rpx 0; border-bottom: 1rpx solid rgba(109, 127, 82, .14); }
.pass-ben:last-of-type { border-bottom: 0; }
.pass-ben-t { display: block; font-size: 22rpx; line-height: 1.6; }
.pass-note { display: block; margin-top: 10rpx; font-size: 20rpx; line-height: 1.65; color: var(--c-muted); }
.pass-link { width: 100%; margin-top: 16rpx; }
.rules-link { margin-top: 10rpx; }

.precedence { margin-top: 22rpx; padding-top: 22rpx; border-top: 1rpx solid var(--line-soft); }
.precedence-title { display: block; font-size: 22rpx; font-weight: 600; }
.precedence-flow { display: flex; align-items: center; gap: 8rpx; margin-top: 14rpx; flex-wrap: wrap; }
.precedence-step { font-size: 20rpx; padding: 6rpx 14rpx; border-radius: 999rpx; background: var(--c-card-2); color: var(--c-primary); }
.precedence-step.on { background: #6d7f52; color: #f6f8ef; }
.precedence-step.dim { background: var(--c-cream); color: var(--c-muted); }

.benefit-mark { flex: none; width: 60rpx; height: 60rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-serif); font-size: 25rpx; color: #fffaf2; background: #96581c; }
.benefit-mark.is-presence { background: #6d7f52; }
.benefit-mark.is-retreat { background: #a97963; }
.benefit-copy { flex: 1; min-width: 0; }
.benefit-title { display: block; font-size: 25rpx; }
.benefit-desc { display: block; margin-top: 2rpx; font-size: 21rpx; line-height: 1.6; color: var(--c-muted); }
.fine { display: block; margin-top: 18rpx; font-size: 20rpx; line-height: 1.7; color: var(--c-muted); }

.journey { background: #f2ede3; border-color: #e4dccd; }
.journey-sub { display: block; margin-top: 4rpx; font-size: 20rpx; color: var(--c-muted); }
.dice { display: flex; align-items: baseline; gap: 4rpx; font-size: 20rpx; color: var(--c-muted); }
.dice-num { font-size: 42rpx; color: var(--c-brown); }
.dice.debt .dice-num, .dice.debt text { color: #a04b32; }
.journey-debt { display: block; margin-top: 12rpx; font-size: 19rpx; letter-spacing: .05em; color: #a04b32; }
.progress { padding: 24rpx 24rpx 20rpx; border-radius: 22rpx; background: #fffdf8; border: 1rpx solid #e4dccd; }
.progress-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16rpx; }
.progress-title { font-size: 24rpx; letter-spacing: .05em; }
.progress-num { flex: none; font-size: 28rpx; color: var(--c-brown); }
.progress-track { height: 12rpx; margin-top: 16rpx; border-radius: 999rpx; background: #ece4d6; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 999rpx; background: var(--c-primary); transition: width .4s ease; }
.progress-note { display: block; margin-top: 12rpx; font-size: 19rpx; line-height: 1.6; letter-spacing: .05em; color: var(--c-muted); }
.progress-tip { display: flex; align-items: center; gap: 16rpx; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx dashed #e4dccd; }
.benefit-mark.small { width: 48rpx; height: 48rpx; font-size: 21rpx; }
.voucher, .invite-row { display: flex; align-items: center; gap: 20rpx; padding: 18rpx 0; border-bottom: 1rpx solid var(--line-soft); }
.voucher:last-of-type, .invite-row:last-of-type { border-bottom: 0; }
.voucher.used { opacity: .55; }
.voucher-code { flex: none; text-align: right; }
.voucher-num { display: block; font-family: var(--font-mono, monospace); font-size: 28rpx; letter-spacing: .12em; color: var(--c-brown); }
.voucher-state { display: block; margin-top: 2rpx; font-size: 19rpx; color: var(--c-muted); }
.notice-item { padding: 18rpx 0; border-bottom: 1rpx solid var(--line-soft); }
.notice-item:last-of-type { border-bottom: 0; }
.notice-head { display: flex; align-items: center; gap: 12rpx; }
.notice-title { font-size: 26rpx; font-family: var(--serif); letter-spacing: var(--tracking-title); }
.notice-pin { flex: none; padding: 2rpx 10rpx; font-size: 18rpx; letter-spacing: 2rpx; color: var(--c-brown); border: 1rpx solid var(--line-soft); border-radius: 999rpx; }
.notice-body { display: block; margin-top: 10rpx; font-size: 22rpx; line-height: 1.7; color: var(--c-ink); opacity: .82; white-space: pre-wrap; }
.notice-date { display: block; margin-top: 10rpx; font-size: 18rpx; color: var(--c-muted); }
.story-more { margin-top: 10rpx; }
.story { padding: 18rpx 0; border-bottom: 1rpx solid var(--line-soft); }
.story-title { display: block; font-size: 27rpx; }
.story-quote { display: block; margin-top: 8rpx; font-size: 23rpx; line-height: 1.7; color: var(--c-brown); }
.story-body { display: block; margin-top: 6rpx; font-size: 22rpx; line-height: 1.75; color: var(--c-muted); }
.sheet-desc { display: block; font-size: 23rpx; line-height: 1.7; color: var(--c-muted); }
.code-input { margin-top: 20rpx; height: 88rpx; padding: 0 24rpx; border-radius: 18rpx; border: 1rpx solid var(--line-soft); background: #fffdf8; font-size: 30rpx; letter-spacing: .12em; }
.feedback-input { width: auto; margin-top: 20rpx; height: 220rpx; padding: 20rpx 24rpx; border-radius: 18rpx; border: 1rpx solid var(--line-soft); background: #fffdf8; font-size: 25rpx; line-height: 1.7; }
.input-ph { color: #b5aa98; letter-spacing: .05em; }
.count { display: block; margin-top: 8rpx; text-align: right; font-size: 19rpx; color: var(--c-muted); }
.check { display: flex; align-items: center; gap: 14rpx; margin-top: 14rpx; font-size: 22rpx; color: var(--c-ink); }
.check-box { flex: none; width: 34rpx; height: 34rpx; display: flex; align-items: center; justify-content: center; border-radius: 8rpx; border: 1rpx solid #c9bba4; background: #fffdf8; }
.check-box.on { background: var(--c-primary); border-color: var(--c-primary); }
.journey-foot { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-top: 10rpx; }
.journey-next { font-size: 21rpx; color: var(--c-muted); }

.btn { min-height: 84rpx; padding: 0 32rpx; border-radius: 999rpx; border: 1rpx solid var(--line-soft); background: var(--c-card); color: var(--c-ink); font-size: 26rpx; display: flex; align-items: center; justify-content: center; line-height: 1.4; }
.btn.primary { background: var(--c-primary); border-color: var(--c-primary); color: var(--c-rice); }
.btn.compact { min-height: 64rpx; padding: 0 26rpx; font-size: 22rpx; }
.btn.full { width: 100%; margin-top: 20rpx; }
.btn[disabled] { opacity: .45; }


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
