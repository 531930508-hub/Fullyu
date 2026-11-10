<template>
	<view class="bm-page">
		<view class="bm-nav" :style="{ paddingTop: statusBar + 'px', height: customBar + 'px' }">
			<view class="bm-nav-row">
				<image class="bm-back" src="/static/icons/leftjiantou.png" mode="aspectFit" @click="goBack"></image>
				<text class="bm-nav-title">{{ tt('Full愈年卡', 'Full Yu Annual') }}</text>
				<button class="bm-lang" @click="toggleLocale">{{ lang === 'en' ? '中' : 'EN' }}</button>
			</view>
		</view>

		<view class="bm-body" :style="{ paddingTop: customBar + 'px' }">
			<!-- 合成数据提示放在正文顶部：原来贴在导航右侧会被微信胶囊遮住。 -->
			<view v-if="isMock" class="bm-dev-row"><text class="bm-dev">{{ tt('本地联调 · 合成数据', 'Local mock · synthetic data') }}</text></view>
			<view v-if="loading" class="bm-state">
				<view class="bm-spinner"></view>
				<text>{{ tt('正在读取会员身份', 'Loading your membership') }}</text>
			</view>

			<view v-else-if="error" class="bm-state">
				<text class="bm-state-title">{{ tt('会员信息暂时连不上', 'Membership is unavailable') }}</text>
				<text class="bm-state-desc">{{ error }}</text>
				<button class="bm-btn primary" @click="load">{{ tt('重新加载', 'Reload') }}</button>
			</view>

			<template v-else-if="data">
				<!-- 风控锁定：连续两次 7 天内退款后暂停购买，需工作人员解锁 -->
				<view v-if="brandLocked" class="bm-lock">
					<text class="bm-lock-title">{{ tt('品牌会员购买已暂停', 'Brand membership purchases are paused') }}</text>
					<text class="bm-lock-desc">{{ lockReason || tt('连续两次 7 天内无理由退款，需联系工作人员解锁后再购买；已购卡权益与退款不受影响。', 'Two refunds within 7 days triggered a temporary hold. Contact our team to unlock; existing benefits and refunds are unaffected.') }}</text>
				</view>

				<!-- 已开通：品牌身份卡（三店权益与续费收进下方抽屉） -->
				<view v-if="active" class="bm-identity">
					<view class="bm-identity-top">
						<view class="bm-identity-title">
							<text class="bm-eyebrow">FULL YU ANNUAL MEMBER</text>
							<text class="bm-identity-name serif">{{ card.productName || tt('Full愈年卡', 'Full Yu Annual') }}</text>
						</view>
						<view class="bm-state-pill">{{ stateLabel }}</view>
					</view>
					<text class="bm-identity-sub">{{ member.name }} · {{ member.memberNo }}</text>
					<text v-if="pending" class="bm-identity-valid">{{ tt('新权益期 ' + formatDate(card.validFrom) + ' 起生效', 'New term starts ' + formatDate(card.validFrom)) }}</text>
					<text v-else class="bm-identity-valid">{{ tt('有效期至 ' + formatDate(card.validUntil) + ' · 还有 ' + card.remainingDays + ' 天', 'Valid until ' + formatDate(card.validUntil) + ' · ' + card.remainingDays + ' days left') }}</text>
					<view class="bm-identity-foot">
						<text>{{ card.soldByName || tt('轻疗', 'Light Heal') }}{{ tt(' 开通 · 三店通用', ' · valid at all three spaces') }}</text>
						<text class="bm-here">{{ tt('本店：轻疗', 'Here: Light Heal') }}</text>
					</view>
					<view class="bm-identity-trigger" @click="drawerOpen = !drawerOpen">
						<text>{{ tt(renewalText || '查看年卡权益', renewalTextEn || 'See pass benefits') }}</text>
						<text class="bm-identity-chevron" :class="{ open: drawerOpen }">⌄</text>
					</view>
				</view>

				<!-- 未开通：加入卡 -->
				<view v-else class="bm-join">
					<text class="bm-eyebrow ink">FULL YU ANNUAL MEMBER</text>
					<text class="bm-join-title serif">{{ tt('一张卡，三店通用', 'One card. Three spaces.') }}</text>
					<text class="bm-join-desc">{{ tt('轻疗放松、时叙喝茶、在场上课，一张卡走三店。', 'Treatments at Light Heal, tea at Teahour, classes at Presence — one annual card.') }}</text>
					<view class="bm-join-price">
						<text class="bm-price serif">¥{{ formatYuan(annual.priceCents) }}</text>
						<text class="bm-price-unit">{{ tt('/ 年', '/ year') }}</text>
						<text class="bm-price-alt">{{ tt('月卡 ¥' + formatYuan(month.priceCents), 'Monthly ¥' + formatYuan(month.priceCents)) }}</text>
					</view>
					<button class="bm-btn primary full" @click="handlePrimary">{{ isMock ? tt('开通 Full愈年卡', 'Join Full Yu Annual') : tt('选择卡型并开通', 'Choose a plan and join') }}</button>
					<text class="bm-join-rule">{{ tt('服务权益卡 · 非储值', 'Service benefits card · not a stored-value card') }}</text>
					<button class="bm-rules-link bm-gift-link" @click="openGift">{{ tt('有会员码？点此兑换', 'Have a member code? Redeem it') }}</button>
				</view>

				<!-- 年卡详情抽屉：三店权益、卡型与开通/续费都收在这里，避免一页多段重复 -->
				<view v-if="drawerOpen" class="bm-drawer">
					<view class="bm-drawer-head">
						<text class="bm-drawer-title serif">{{ active ? tt('年卡权益与续费', 'Pass benefits & renewal') : tt('三店权益与开通', 'Benefits & joining') }}</text>
						<text class="bm-drawer-close" @click="drawerOpen = false">×</text>
					</view>
					<text v-if="savedCents" class="bm-drawer-sub">{{ tt('本年已省', 'Saved this year') }} ¥{{ formatYuan(savedCents) }}</text>
					<view class="bm-drawer-sec">
						<text class="bm-drawer-cap">{{ tt('三店权益', 'Benefits across three spaces') }}</text>
						<view v-for="item in benefits" :key="item.business" class="bm-benefit">
							<view class="bm-benefit-mark" :class="'is-' + item.business">{{ businessShort(item.business) }}</view>
							<view class="bm-benefit-copy">
								<text class="bm-benefit-title">{{ item.title }}</text>
								<text class="bm-benefit-desc">{{ item.desc }}</text>
							</view>
							<text v-if="item.business === 'retreat'" class="bm-benefit-here">{{ tt('本店', 'Here') }}</text>
						</view>
					</view>
					<view class="bm-drawer-sec">
						<text class="bm-drawer-cap">{{ active ? tt('续费与卡型', 'Renewal & plans') : tt('选择卡型', 'Choose a plan') }}</text>
						<view class="bm-products">
							<button v-for="product in products" :key="product.code" class="bm-product"
								:class="{ selected: selectedCode === product.code }"
								@click="selectedCode = product.code">
								<text class="bm-product-name">{{ product.name }}</text>
								<text class="bm-product-price serif">¥{{ formatYuan(product.priceCents) }}</text>
								<text class="bm-product-period">{{ productPeriod(product) }}</text>
							</button>
						</view>
						<view v-if="!isMock" class="bm-agree" @click="agreed = !agreed">
							<view class="bm-check" :class="{ on: agreed }">{{ agreed ? '✓' : '' }}</view>
							<text>{{ tt('已阅读并同意', 'I have read and agree to') }}</text>
							<text class="bm-agree-link" @click.stop="openRules">{{ tt('《会员权益与退款规则》', 'the Member Benefits & Refund Rules') }}</text>
						</view>
						<button class="bm-btn primary full" :disabled="submitting || brandLocked" @click="goPurchase">
							{{ payButtonLabel }}
						</button>
						<view v-if="!isMock && profileSaved" class="bm-profile-line" @click="openProfile('edit')">
							<text>{{ tt('会员档案', 'Member profile') }}：{{ profileSummary }}</text>
							<text class="bm-profile-edit">{{ tt('修改', 'Edit') }}</text>
						</view>
						<text v-if="brandLocked" class="bm-panel-note">{{ tt('购买已暂停，请联系工作人员解锁。', 'Purchases are paused. Please contact our team to unlock.') }}</text>
						<text v-else class="bm-panel-note">{{ tt('7 天内可自助退款，已领年卡礼按价值扣除。', 'Self-service refund within 7 days; gifts already collected are deducted at face value.') }}</text>
					</view>
				</view>

				<!-- 01 会员公告：只对有效会员展示 -->
				<view v-if="active && notices.length" class="bm-section">
					<view class="bm-panel-head">
						<text class="bm-panel-index">01</text>
						<view class="bm-panel-copy">
							<text class="bm-panel-title serif">{{ tt('会员公告', 'Member notices') }}</text>
						</view>
						<text class="bm-earned">{{ tt('仅会员', 'Members only') }}</text>
					</view>
					<view v-for="item in notices" :key="item.id" class="bm-notice">
						<view class="bm-notice-head">
							<text class="bm-notice-title">{{ item.title }}</text>
							<text v-if="item.pinned" class="bm-notice-pin">{{ tt('置顶', 'Pinned') }}</text>
						</view>
						<text class="bm-notice-body">{{ item.body }}</text>
						<text v-if="item.publishedAt" class="bm-notice-date">{{ formatDate(item.publishedAt) }}</text>
					</view>
				</view>

				<!-- 02 愈行之旅：玩法由进度条与按钮引导，只保留必要的一句说明 -->
				<view v-if="active" class="bm-section bm-panel--journey">
					<view class="bm-panel-head">
						<text class="bm-panel-index">02</text>
						<view class="bm-panel-copy">
							<text class="bm-panel-title serif">{{ tt('愈行之旅', 'Journey') }}</text>
							<text class="bm-panel-sub">{{ tt('消费得骰子', 'Dice from spending') }}</text>
						</view>
						<view class="bm-dice" :class="{ debt: diceDebt > 0 }">
							<text class="bm-dice-num">{{ dice.balance }}</text>
							<text class="bm-dice-label">{{ diceDebt > 0 ? tt('待补', 'short') : tt('颗', 'dice') }}</text>
						</view>
					</view>
					<view v-if="progress" class="bm-progress">
						<view class="bm-progress-head">
							<text class="bm-progress-title">{{ progress.headline }}</text>
							<text class="bm-progress-num">{{ progress.percent }}%</text>
						</view>
						<view class="bm-progress-track" role="progressbar" :aria-valuenow="progress.percent"
							aria-valuemin="0" aria-valuemax="100">
							<view class="bm-progress-fill" :style="{ width: progress.percent + '%' }"></view>
						</view>
						<text v-if="diceDebt > 0" class="bm-journey-debt">{{ tt('先补回 ' + diceDebt + ' 颗，再得新骰子', 'First settle ' + diceDebt + ' dice to earn new ones') }}</text>
						<text v-else class="bm-progress-note">{{ tt('每满 ¥' + formatYuan(progress.perDieCents) + ' 得 1 颗', 'One die per ¥' + formatYuan(progress.perDieCents)) }}</text>
						<view v-if="progress.tip" class="bm-progress-tip">
							<view class="bm-benefit-mark" :class="'is-' + (progress.tip.external || 'retreat')">
								{{ businessShort(progress.tip.external) }}
							</view>
							<view class="bm-benefit-copy">
								<text class="bm-benefit-title">{{ progress.tip.title }}</text>
								<text class="bm-benefit-desc">{{ progress.tip.text }}</text>
							</view>
						</view>
					</view>
					<view class="bm-journey-foot">
						<text class="bm-journey-next">{{ journeyNext }}</text>
						<button class="bm-btn compact" :disabled="!gameEnabled" @click="openGame">
							{{ gameEnabled ? tt('去掷骰子', 'Roll the dice') : tt('未解锁', 'Locked') }}
						</button>
					</view>
				</view>

				<!-- 03 礼物与兑换：年卡礼提货码与会员码收在同一组 -->
				<view v-if="vouchers.length || active" class="bm-section bm-panel--gift">
					<view class="bm-panel-head">
						<text class="bm-panel-index">03</text>
						<view class="bm-panel-copy">
							<text class="bm-panel-title serif">{{ tt('礼物与兑换', 'Gifts & codes') }}</text>
						</view>
						<text class="bm-earned">{{ vouchers.length ? tt('任一门店可领', 'Collect at any store') : tt('会员码', 'Member codes') }}</text>
					</view>
					<view v-for="item in vouchers" :key="item.code" class="bm-voucher"
						:class="{ used: item.status !== 'ISSUED' }">
						<view class="bm-benefit-copy">
							<text class="bm-benefit-title">{{ item.title }}</text>
							<text class="bm-benefit-desc">{{ voucherNote(item) }}</text>
						</view>
						<view class="bm-voucher-code">
							<text class="bm-voucher-num">{{ item.code }}</text>
							<text class="bm-voucher-state">{{ voucherStatusLabel(item.status) }}</text>
						</view>
					</view>
					<view v-if="active" class="bm-row" :class="{ 'bm-row--divided': vouchers.length }">
						<view class="bm-benefit-copy">
							<text class="bm-benefit-title">{{ tt('兑换会员码', 'Redeem a member code') }}</text>
							<text class="bm-benefit-desc">{{ tt('兑换后有效期自动顺延', 'Extends your membership') }}</text>
						</view>
						<button class="bm-btn compact" @click="openGift">{{ tt('兑换', 'Redeem') }}</button>
					</view>
				</view>

				<!-- 04 会员专属：故事与建议放在同一组 -->
				<view v-if="active" class="bm-section">
					<view class="bm-panel-head">
						<text class="bm-panel-index">04</text>
						<view class="bm-panel-copy">
							<text class="bm-panel-title serif">{{ tt('会员专属', 'For members') }}</text>
						</view>
						<text class="bm-earned">{{ tt('仅会员', 'Members only') }}</text>
					</view>
					<view v-if="storyPreview.length">
						<view v-for="item in storyPreview" :key="item.id" class="bm-story">
							<text class="bm-story-title serif">{{ item.title }}</text>
							<text v-if="item.quote" class="bm-story-quote">“{{ item.quote }}”<text v-if="item.quoteBy"> —— {{ item.quoteBy }}</text></text>
							<text class="bm-story-body">{{ item.story }}</text>
						</view>
						<button v-if="stories.length > storyPreview.length" class="bm-panel-cta" @click="openStories">
							{{ tt('查看全部 ' + stories.length + ' 篇故事', 'View all ' + stories.length + ' stories') }}
						</button>
					</view>
					<text v-else class="bm-fine">{{ storiesError || tt('会员故事整理中。', 'Member stories are being prepared.') }}</text>
					<view class="bm-row bm-row--divided" @click="openFeedback">
						<view class="bm-benefit-copy">
							<text class="bm-benefit-title">{{ tt('写下你的建议', 'Share your feedback') }}</text>
							<text class="bm-benefit-desc">{{ tt('想做什么项目、哪里不舒服，都可以说', 'Tell us what you would like or where it hurts') }}</text>
						</view>
						<text class="bm-row-tail">›</text>
					</view>
				</view>

				<!-- 购卡记录已移到订单页，与卡券订单合并 -->
				<view v-if="!isMock" class="bm-section bm-panel--flat bm-row" @click="goRecords">
					<text class="bm-row-title">{{ tt('购卡与退款记录', 'Purchase & refund records') }}</text>
					<text class="bm-row-tail">›</text>
				</view>

				<!-- 规则只留入口，需要时再看 -->
				<view class="bm-section bm-panel--flat bm-row" @click="openRules">
					<text class="bm-row-title">{{ tt('会员权益与退款规则', 'Member benefits & refund rules') }}</text>
					<text class="bm-row-tail">{{ tt('查看', 'View') }} ›</text>
				</view>

				<view class="bm-foot">
					<text>{{ tt('放松有道　自在生活', 'Relax with intention. Live at ease.') }}</text>
					<text class="bm-foot-sub">{{ tt('Full愈 · 轻疗', 'Full Yu · Light Heal') }}</text>
				</view>
			</template>
		</view>

		<!-- 开通前补充会员档案：称呼、性别用于门店称呼与权益记录，生日用于生日礼遇 -->
		<view v-if="profileVisible" class="bm-mask" @click="closeProfile">
			<view class="bm-sheet" @click.stop>
				<text class="bm-sheet-title serif">{{ profileIntent === 'edit' ? tt('会员档案', 'Member profile') : tt('完善会员档案', 'Complete your profile') }}</text>
				<text class="bm-sheet-sub">
					{{ profileIntent === 'edit' ? tt('修改后会同步到会员权益记录与门店称呼。', 'Changes update your benefit records and how our team greets you.') : selectedProduct.name + tt(' · 用于会员权益记录与门店称呼，不会对外展示。', ' · used for benefit records and greetings, never shown publicly.') }}
				</text>
				<view class="bm-form">
					<view class="bm-form-row">
						<text class="bm-form-label">{{ tt('称呼', 'Name') }} <text class="bm-required">*</text></text>
						<input class="bm-form-input" v-model="profileForm.contactName" maxlength="20"
							:placeholder="tt('怎么称呼您', 'What should we call you?')" placeholder-class="bm-refund-placeholder" />
					</view>
					<view class="bm-form-row">
						<text class="bm-form-label">{{ tt('性别', 'Gender') }} <text class="bm-required">*</text></text>
						<view class="bm-gender">
							<view class="bm-gender-opt" :class="{ on: profileForm.contactGender === '1' }"
								@click="profileForm.contactGender = '1'">{{ tt('男', 'Male') }}</view>
							<view class="bm-gender-opt" :class="{ on: profileForm.contactGender === '2' }"
								@click="profileForm.contactGender = '2'">{{ tt('女', 'Female') }}</view>
						</view>
					</view>
					<view class="bm-form-row">
						<text class="bm-form-label">{{ tt('生日', 'Birthday') }} <text class="bm-required">*</text></text>
						<picker mode="date" :value="profileForm.contactBirthday || todayText" start="1920-01-01"
							:end="todayText" @change="onBirthdayChange">
							<view class="bm-form-picker" :class="{ empty: !profileForm.contactBirthday }">
								{{ profileForm.contactBirthday || tt('请选择生日，用于生日礼遇', 'Select your birthday for birthday perks') }}
							</view>
						</picker>
					</view>
				</view>
				<text class="bm-form-note">{{ tt('称呼、性别与生日会写入会员档案，生日只用于生日礼遇，可随时修改。', 'Name, gender and birthday are saved to your member profile. Birthday is only used for birthday perks and can be changed anytime.') }}</text>
				<view class="bm-sheet-actions">
					<button class="bm-btn" @click="closeProfile">{{ tt('取消', 'Cancel') }}</button>
					<button class="bm-btn primary" :disabled="submitting" @click="confirmProfile">
						{{ profilePayLabel }}
					</button>
				</view>
			</view>
		</view>

		<!-- 会员码兑换 -->
		<view v-if="giftOpen" class="bm-mask" @click="closeGift">
			<view class="bm-sheet" @click.stop>
				<text class="bm-sheet-title serif">{{ tt('兑换会员码', 'Redeem a member code') }}</text>
				<text class="bm-sheet-sub">{{ tt('输入活动卡片或朋友分享的会员码。兑换后会员有效期自动顺延，已开通的从当前到期日起接续。', 'Enter the code from an event card or a friend. Your membership extends automatically, continuing from the current expiry date.') }}</text>
				<input class="bm-gift-input" :value="giftCode" maxlength="16" :placeholder="tt('例如 WELCOME30', 'e.g. WELCOME30')"
					placeholder-class="bm-refund-placeholder" confirm-type="done"
					@input="(e) => (giftCode = e.detail.value)" @confirm="confirmGift" />
				<text class="bm-form-note">{{ tt('每个会员码有名额与兑换截止日期，以兑换结果为准；同一账号每个码只能兑换一次。', 'Each code has limited redemptions and a deadline. Each account can redeem a code once.') }}</text>
				<view class="bm-sheet-actions">
					<button class="bm-btn" @click="closeGift">{{ tt('取消', 'Cancel') }}</button>
					<button class="bm-btn primary" :disabled="claiming" @click="confirmGift">
						{{ claiming ? tt('兑换中…', 'Redeeming…') : tt('确认兑换', 'Redeem') }}
					</button>
				</view>
			</view>
		</view>

		<!-- 意见反馈 -->
		<view v-if="feedbackOpen" class="bm-mask" @click="closeFeedback">
			<view class="bm-sheet" @click.stop>
				<text class="bm-sheet-title serif">{{ tt('写下你的建议', 'Share your feedback') }}</text>
				<text class="bm-sheet-sub">{{ tt('想要什么样的疗愈项目、茶或课程，哪里让你不舒服，都可以告诉我们。每条都会有人看。', 'Tell us what treatments, tea or classes you would like, or what is bothering you. Every note is read by our team.') }}</text>
				<textarea class="bm-feedback-input" :value="feedbackText" maxlength="1000" :placeholder="tt('至少 5 个字', 'At least 5 characters')"
					placeholder-class="bm-refund-placeholder" @input="(e) => (feedbackText = e.detail.value)" />
				<text class="bm-feedback-count">{{ feedbackLength }} / 1000</text>
				<view class="bm-agree" @click="allowQuote = !allowQuote">
					<view class="bm-check" :class="{ on: allowQuote }">{{ allowQuote ? '✓' : '' }}</view>
					<text>{{ tt('同意匿名整理进会员故事（只展示姓氏）', 'Allow anonymous use in Member Stories (surname only)') }}</text>
				</view>
				<view class="bm-sheet-actions">
					<button class="bm-btn" @click="closeFeedback">取消</button>
					<button class="bm-btn primary" :disabled="sending" @click="sendFeedback">
						{{ sending ? tt('提交中…', 'Sending…') : tt('提交', 'Submit') }}
					</button>
				</view>
			</view>
		</view>
	</view>
</template>

<script setup>
	import {
		computed,
		nextTick,
		reactive,
		ref
	} from 'vue'
	import {
		onLoad,
		onShow,
		onUnload,
		onShareAppMessage,
		onShareTimeline
	} from '@dcloudio/uni-app'
	import {
		BRAND_BENEFITS,
		CARD_PRODUCTS,
		cardStateLabel,
		claimGiftCode,
		formatDate,
		formatYuan,
		isMock,
		isTestPayMode,
		loadBrandMember,
		loadBrandOrderStatus,
		loadBrandOrders,
		loadStories,
		mockPayBrandCard,
		parseGiftScene,
		purchaseBrandCard,
		requestGameTicket,
		setMockCardState,
		stashPendingGift,
		submitFeedback,
		voucherStatusLabel
	} from '../../../api/brandMember'
	import cookie from '../../../utils/cookieUtil'
	import { useLocale } from '../../../utils/locale'

	const { lang, tt, toggleLocale, syncLocale } = useLocale()
	import { normalizeDiceProgress } from '../../../utils/brandMemberPayload'
	import payApi from '../../../api/pay'

	const DEFAULT_BENEFITS = BRAND_BENEFITS

	const statusBar = ref(0)
	const customBar = ref(0)
	const loading = ref(true)
	const error = ref('')
	const data = ref(null)
	const selectedCode = ref('FY_ANNUAL')
	const forcedCard = ref('')

	// 购卡 / 退款状态：金额与资格一律以服务端返回为准，页面只做展示与二次确认。
	const agreed = ref(false)
	const submitting = ref(false)
	const brandLocked = ref(false)
	const lockReason = ref('')
	// 开通前会员档案：称呼/性别/生日必填；本地记住，续费时直接带出。
	const PROFILE_KEY = 'fy.brand.profile'
	const profileVisible = ref(false)
	// purchase = 开通/续费前补档案；edit = 只修改档案，不发起支付
	const profileIntent = ref('purchase')
	const profileForm = reactive({
		contactName: '',
		contactGender: '',
		contactBirthday: ''
	})
	const todayText = (() => {
		const d = new Date()
		const pad = (n) => String(n).padStart(2, '0')
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
	})()
	let polling = false
	let disposed = false

	const products = computed(() => {
		const rows = data.value && data.value.products
		return Array.isArray(rows) && rows.length ? rows : CARD_PRODUCTS
	})
	const annual = computed(() => products.value.find((item) => item.code === 'FY_ANNUAL') || CARD_PRODUCTS[1])
	const month = computed(() => products.value.find((item) => item.code === 'FY_MONTH') || CARD_PRODUCTS[0])
	const selectedProduct = computed(() => products.value.find((item) => item.code === selectedCode.value) || annual.value)
	const card = computed(() => ((data.value && data.value.card) || {
		state: 'NONE'
	}))
	// 下面这些字段一律经计算属性兜底：CRM 版本缺字段时页面降级展示，而不是整页白屏。
	const member = computed(() => ((data.value && data.value.member) || {
		name: tt('Full愈会员', 'Full Yu Member'),
		memberNo: ''
	}))
	const dice = computed(() => ((data.value && data.value.dice) || {
		balance: 0
	}))
	const diceDebt = computed(() => {
		const balance = Number(dice.value.balance) || 0
		return balance < 0 ? Math.abs(balance) : 0
	})
	const prizes = computed(() => ((data.value && data.value.prizes) || {
		pending: 0
	}))
	const savedCents = computed(() => Number((data.value && data.value.savedCents) || 0))
	const benefits = computed(() => {
		const rows = data.value && data.value.benefits
		return Array.isArray(rows) && rows.length ? rows : DEFAULT_BENEFITS
	})
	const active = computed(() => ['ACTIVE', 'EXPIRING', 'PENDING'].indexOf(card.value.state) >= 0)
	const pending = computed(() => card.value.state === 'PENDING')
	// 会员页按「身份 → 公告 → 权益/游戏 → 礼物/故事 → 开通/规则」分层。
	const notices = computed(() => {
		const rows = data.value && data.value.notices
		return Array.isArray(rows) ? rows.filter((item) => item && item.title) : []
	})
	const drawerOpen = ref(false)
	const stateLabel = computed(() => {
		const labels = {
			ACTIVE: tt('有效', 'Active'),
			EXPIRING: tt('即将到期', 'Expiring'),
			PENDING: tt('待生效', 'Pending')
		}
		return labels[card.value.state] || cardStateLabel(card.value.state)
	})
	const gameEnabled = computed(() => !!(data.value && data.value.game && data.value.game.enabled))
	const openingGame = ref(false)
	/** 商品目录来自 CRM；缺 period 时用有效天数说明，避免空白。 */
	function productPeriod(product) {
		return (product && product.period) || tt(`${(product && product.validDays) || 0} 天`, `${(product && product.validDays) || 0} days`)
	}
	const actionLabel = computed(() => {
		if (pending.value) return tt('再续一次', 'Add another term')
		return active.value ? tt('续费', 'Renew') : tt('开通', 'Join')
	})
	const payButtonLabel = computed(() => {
		if (submitting.value) return tt('正在发起支付…', 'Starting payment…')
		if (brandLocked.value) return tt('购买已暂停', 'Purchases paused')
		return `${actionLabel.value} ${selectedProduct.value.name} · ¥${formatYuan(selectedProduct.value.priceCents)}`
	})
	const profileSaved = computed(() => !!(profileForm.contactName && profileForm.contactGender))
	const profileSummary = computed(() => {
		const gender = profileForm.contactGender === '1' ? '男' : profileForm.contactGender === '2' ? '女' : ''
		const parts = [profileForm.contactName, gender, profileForm.contactBirthday].filter(Boolean)
		return parts.join(' · ')
	})
	/** 档案来自服务端已有的称呼时，按钮直接显示“去支付”，避免用户重复填写。 */
	const profilePayLabel = computed(() => {
		if (submitting.value) return tt('正在发起支付…', 'Starting payment…')
		if (profileIntent.value === 'edit') return tt('保存', 'Save')
		return tt(`去支付 ¥${formatYuan(selectedProduct.value.priceCents)}`, `Pay ¥${formatYuan(selectedProduct.value.priceCents)}`)
	})
	const journeyNext = computed(() => {
		if (prizes.value.pending) return tt(`待领礼物 ${prizes.value.pending} 份`, `${prizes.value.pending} gifts to collect`)
		if (!gameEnabled.value && pending.value) return tt('新权益期开始后继续', 'Continues when the new term starts')
		return ''
	})
	// 骰子进度、续费提醒与年卡礼都由 CRM 计算；页面只展示，不在前端推算金额。
	const progress = computed(() => normalizeDiceProgress(dice.value && dice.value.progress))
	const vouchers = computed(() => {
		const rows = data.value && data.value.vouchers
		return Array.isArray(rows) ? rows.filter((item) => item && item.code) : []
	})
	const renewalText = computed(() => {
		const value = data.value
		if (!value || !value.card) return ''
		if (value.renewal && value.renewal.show && value.renewal.text) return value.renewal.text
		if (value.card.state === 'EXPIRING') {
			return tt(`还有 ${value.card.remainingDays} 天到期，续上就不断档。`, `Expires in ${value.card.remainingDays} days — renew to stay covered.`)
		}
		return ''
	})
	const renewalTextEn = computed(() => {
		const value = data.value
		if (!value || !value.card || !renewalText.value) return ''
		if (value.card.state === 'EXPIRING') return `Expires in ${value.card.remainingDays} days — renew to stay covered.`
		return 'Renew now to keep your benefits going.'
	})

	const stories = ref([])
	const storiesError = ref('')
	/** 会员页只放两篇预览，完整故事进单独页面，避免首页越滚越长。 */
	const storyPreview = computed(() => stories.value.slice(0, 2))
	const giftOpen = ref(false)
	const giftCode = ref('')
	const claiming = ref(false)
	const feedbackOpen = ref(false)
	const feedbackText = ref('')
	const allowQuote = ref(false)
	const sending = ref(false)
	const feedbackLength = computed(() => String(feedbackText.value || '').trim().length)

	/** fetch 拦截器以字符串 reject 业务错误；名额已满、已截止等文案由 CRM 判定，原样展示。 */
	function errorText(e, fallback) {
		if (typeof e === 'string' && e) return e
		return (e && e.message) || fallback
	}

	async function refreshStories() {
		storiesError.value = ''
		try {
			const res = await loadStories()
			stories.value = res && Array.isArray(res.stories) ? res.stories : []
		} catch (e) {
			stories.value = []
			storiesError.value = tt('会员故事暂时没读到，稍后再看看。', 'Member stories are unavailable right now. Please try again later.')
		}
	}

	function voucherNote(item) {
		if (item.status === 'REDEEMED' && item.redeemedAt) {
			const when = formatDate(item.redeemedAt)
			return item.redeemedStore
				? tt(`已于 ${when} 在 ${item.redeemedStore} 领取`, `Collected at ${item.redeemedStore} on ${when}`)
				: tt(`已于 ${when} 领取`, `Collected on ${when}`)
		}
		if (item.status === 'VOID') return tt('该提货码已作废', 'This code has been voided')
		if (item.status === 'EXPIRED') return tt('该提货码已过期', 'This code has expired')
		return item.desc || tt('任一门店出示提货码，店员核销一次', 'Show this code at any store for one redemption')
	}

	function openGift() {
		giftCode.value = ''
		giftOpen.value = true
	}

	function closeGift() {
		if (claiming.value) return
		giftOpen.value = false
	}

	async function confirmGift() {
		if (claiming.value) return
		const code = String(giftCode.value || '').replace(/\s+/g, '').toUpperCase()
		if (!/^[A-Z0-9]{4,16}$/.test(code)) {
			uni.showToast({
				title: tt('会员码为 4–16 位字母或数字', 'Member codes are 4–16 letters or digits'),
				icon: 'none'
			})
			return
		}
		claiming.value = true
		try {
			const res = await claimGiftCode(code)
			giftOpen.value = false
			await load()
			const days = res && res.days
			uni.showToast({
				title: res && res.replayed ? tt('这个会员码已兑换过', 'This code has already been redeemed') : days ? tt(`已兑换 ${days} 天`, `${days} days added`) : tt('兑换成功', 'Redeemed'),
				icon: 'none'
			})
		} catch (e) {
			uni.showToast({
				title: errorText(e, tt('兑换失败，请稍后重试', 'Redemption failed. Please try again later.')),
				icon: 'none'
			})
		} finally {
			claiming.value = false
		}
	}

	function openFeedback() {
		feedbackOpen.value = true
	}

	/** 扫后台生成的小程序码进来：登录后自动兑换，不必再手输会员码。 */
	async function claimSceneGift(code) {
		if (!code || claiming.value) return
		claiming.value = true
		try {
			const res = await claimGiftCode(code)
			await load()
			const days = res && res.days
			uni.showToast({
				title: res && res.replayed ? tt('这个会员码已兑换过', 'This code has already been redeemed') : days ? tt(`已领取 ${days} 天会员`, `${days} days added to your membership`) : tt('会员码已领取', 'Code redeemed'),
				icon: 'none'
			})
		} catch (e) {
			uni.showToast({
				title: errorText(e, tt('会员码领取失败，请稍后重试', 'Could not redeem the code. Please try again later.')),
				icon: 'none'
			})
		} finally {
			claiming.value = false
		}
	}

	function closeFeedback() {
		if (sending.value) return
		feedbackOpen.value = false
	}

	async function sendFeedback() {
		if (sending.value) return
		const content = String(feedbackText.value || '').trim()
		if (content.length < 5) {
			uni.showToast({
				title: tt('再多写几个字吧（至少 5 个字）', 'Please write a little more (at least 5 characters)'),
				icon: 'none'
			})
			return
		}
		sending.value = true
		try {
			await submitFeedback(content, allowQuote.value)
			feedbackOpen.value = false
			feedbackText.value = ''
			allowQuote.value = false
			uni.showToast({
				title: tt('收到了，谢谢你', 'Received. Thank you.'),
				icon: 'none'
			})
		} catch (e) {
			uni.showToast({
				title: errorText(e, tt('提交失败，请稍后重试', 'Submission failed. Please try again later.')),
				icon: 'none'
			})
		} finally {
			sending.value = false
		}
	}

	function businessShort(business) {
		if (lang.value === 'en') return { retreat: 'LH', teahour: 'TH', presence: 'PR' }[business] || 'FY'
		return {
			retreat: '轻',
			teahour: '时',
			presence: '在'
		} [business] || '愈'
	}

	function goBack() {
		const pages = getCurrentPages()
		if (pages && pages.length > 1) {
			uni.navigateBack()
			return
		}
		uni.switchTab({
			url: '/pages/user/index'
		})
	}

	function openRules() {
		uni.navigateTo({
			url: '/pages/user/brand-member/rules'
		})
	}

	function openStories() {
		uni.navigateTo({
			url: '/pages/user/brand-member/stories'
		})
	}

	function openPurchaseLegacy() {
		nextTick(() => {
			uni.pageScrollTo({
				selector: '#bm-purchase',
				duration: 300,
				fail: () => uni.pageScrollTo({
					scrollTop: 1200,
					duration: 300
				})
			})
		})
	}

	/**
	 * 顶部主按钮：mock 演示直接进旧页；正式环境滚到卡型与条款区，
	 * 避免用户在未勾选退款条款时被直接拉起支付。
	 */
	function handlePrimary() {
		if (isMock) {
			goPurchase()
			return
		}
		drawerOpen.value = true
	}

	/**
	 * 正式环境走服务端下单 + 微信支付；mock 仍进旧会员卡演示页。
	 * 旧页只写轻疗本地卡、不写 CRM 品牌卡，正式环境绝不能走那条链路。
	 */
	function goPurchase() {
		if (submitting.value) return
		if (isMock) {
			const type = selectedProduct.value.code === 'FY_MONTH' ? 'month' : 'year'
			uni.navigateTo({
				url: `/pages/user/member-card/member-card?type=${type}`
			})
			return
		}
		if (brandLocked.value) {
			uni.showToast({
				title: tt('品牌会员购买已暂停，请联系工作人员解锁', 'Purchases are paused. Please contact our team to unlock.'),
				icon: 'none'
			})
			return
		}
		if (!agreed.value) {
			uni.showToast({
				title: tt('请先阅读并勾选同意会员权益与退款规则', 'Please read and agree to the member benefits and refund rules first'),
				icon: 'none'
			})
			return
		}
		// #ifndef MP-WEIXIN
		uni.showModal({
			title: tt('请在小程序内开通', 'Join inside the Mini Program'),
			content: tt('在线开通需要微信支付，请在微信小程序中操作。', 'Joining online requires WeChat Pay. Please continue in the WeChat Mini Program.'),
			showCancel: false
		})
		return
		// #endif
		openProfile()
	}

	/** 读取本地会员档案；损坏或字段异常时按空档案处理，不阻断开通。 */
	function readProfile() {
		try {
			const raw = uni.getStorageSync(PROFILE_KEY)
			if (!raw) return
			const saved = typeof raw === 'string' ? JSON.parse(raw) : raw
			if (!saved || typeof saved !== 'object') return
			profileForm.contactName = saved.contactName ? String(saved.contactName) : ''
			profileForm.contactGender = saved.contactGender === '1' || saved.contactGender === '2'
				? String(saved.contactGender) : ''
			profileForm.contactBirthday = saved.contactBirthday ? String(saved.contactBirthday) : ''
		} catch (e) {
			// 忽略损坏的本地档案
		}
	}

	function saveProfile() {
		try {
			uni.setStorageSync(PROFILE_KEY, JSON.stringify({
				contactName: profileForm.contactName,
				contactGender: profileForm.contactGender,
				contactBirthday: profileForm.contactBirthday
			}))
		} catch (e) {
			// 本地存储失败不影响本次开通；服务端已保存档案
		}
	}

	function openProfile(intent = 'purchase') {
		if (submitting.value) return
		profileIntent.value = intent === 'edit' ? 'edit' : 'purchase'
		readProfile()
		profileVisible.value = true
	}

	function closeProfile() {
		if (submitting.value) return
		profileVisible.value = false
	}

	function onBirthdayChange(event) {
		profileForm.contactBirthday = (event && event.detail && event.detail.value) || ''
	}

	function profilePayload() {
		return {
			contactName: String(profileForm.contactName || '').trim(),
			contactGender: profileForm.contactGender,
			contactBirthday: profileForm.contactBirthday || ''
		}
	}

	function confirmProfile() {
		if (submitting.value) return
		const profile = profilePayload()
		if (!profile.contactName) {
			uni.showToast({
				title: tt('请填写称呼', 'Please enter your name'),
				icon: 'none'
			})
			return
		}
		if (profile.contactGender !== '1' && profile.contactGender !== '2') {
			uni.showToast({
				title: tt('请选择性别', 'Please select your gender'),
				icon: 'none'
			})
			return
		}
		if (!profile.contactBirthday) {
			uni.showToast({
				title: tt('请选择生日', 'Please select your birthday'),
				icon: 'none'
			})
			return
		}
		if (profile.contactBirthday > todayText) {
			uni.showToast({
				title: tt('生日不能晚于今天', 'Birthday cannot be later than today'),
				icon: 'none'
			})
			return
		}
		profileForm.contactName = profile.contactName
		saveProfile()
		profileVisible.value = false
		if (profileIntent.value === 'edit') {
			uni.showToast({
				title: tt('会员档案已保存', 'Profile saved'),
				icon: 'none'
			})
			return
		}
		void submitPurchase(profile)
	}

	function loginOpenId() {
		return new Promise((resolve, reject) => {
			uni.login({
				provider: 'weixin',
				success: (res) => {
					if (!res || !res.code) {
						reject(new Error('微信登录失败，请重试'))
						return
					}
					payApi.getOpenId({
						wxCode: res.code
					}).then((data) => {
						const openId = data && data.openId
						if (!openId) {
							reject(new Error('微信支付身份获取失败，请重试'))
							return
						}
						resolve(openId)
					}).catch(() => reject(new Error('微信支付身份获取失败，请重试')))
				},
				fail: () => reject(new Error('微信登录失败，请重试'))
			})
		})
	}

	async function submitPurchase(profile = profilePayload()) {
		if (submitting.value) return
		submitting.value = true
		uni.showLoading({
			title: tt('正在创建支付单', 'Creating your order'),
			mask: true
		})
		try {
			const productCode = selectedProduct.value.code
			const testMode = await isTestPayMode()
			if (testMode) {
				// 测试环境：只创建支付单并在服务端模拟支付，绝不唤起真实扣款。
				const created = await purchaseBrandCard({
					productCode,
					agreeTerms: true,
					...profile
				})
				if (!created || !created.orderSn) {
					throw new Error(tt('支付单创建失败，请稍后重试', 'Could not create the order. Please try again later.'))
				}
				uni.showLoading({
					title: tt('模拟支付中', 'Simulating payment'),
					mask: true
				})
				const status = await mockPayBrandCard(created.orderSn)
				uni.hideLoading()
				if (!status || status.state !== 1) {
					throw new Error((status && status.payError) || tt('模拟支付未完成，请稍后在购卡记录查看', 'Simulated payment incomplete. Please check your purchase records later.'))
				}
				uni.showToast({
					title: tt('模拟支付成功，会员卡已开通', 'Simulated payment succeeded. Your pass is active.'),
					icon: 'none'
				})
				await afterPurchase()
				return
			}
			const openId = await loginOpenId()
			const created = await purchaseBrandCard({
				productCode,
				agreeTerms: true,
				openId,
				...profile
			})
			if (!created || !created.payParams) {
				throw new Error(tt('支付参数缺失，请稍后重试', 'Payment details are missing. Please try again later.'))
			}
			uni.hideLoading()
			uni.requestPayment({
				provider: 'wxpay',
				...created.payParams,
				success: () => {
					void pollOrder(created.orderSn)
				},
				fail: (err) => {
					const cancelled = !!(err && err.errMsg && err.errMsg.indexOf('cancel') >= 0)
					uni.showToast({
						title: cancelled ? tt('已取消支付', 'Payment cancelled') : tt('支付未完成，请重试', 'Payment not completed. Please try again.'),
						icon: 'none'
					})
					void fetchBrandLock()
				}
			})
		} catch (e) {
			uni.hideLoading()
			uni.showToast({
				title: payErrorText(e),
				icon: 'none'
			})
			void fetchBrandLock()
		} finally {
			submitting.value = false
		}
	}

	function payErrorText(e) {
		if (typeof e === 'string' && e) return e
		return (e && e.message) || tt('支付发起失败，请稍后重试', 'Could not start payment. Please try again later.')
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/**
	 * 支付回调由汇付异步通知服务端；这里轮询订单状态，确认 CRM 开卡完成后再刷新页面。
	 */
	async function pollOrder(orderSn) {
		if (polling || !orderSn) return
		polling = true
		uni.showLoading({
			title: tt('正在确认开卡', 'Confirming your membership'),
			mask: true
		})
		let settled = false
		try {
			for (let i = 0; i < 15 && !disposed; i++) {
				await sleep(2000)
				let status = null
				try {
					status = await loadBrandOrderStatus(orderSn)
				} catch (e) {
					continue
				}
				if (status && status.state === 1) {
					settled = true
					uni.hideLoading()
					uni.showToast({
						title: tt('支付成功，会员卡已开通', 'Payment succeeded. Your pass is active.'),
						icon: 'none'
					})
					await afterPurchase()
					return
				}
				if (status && status.state === 4 && status.payError) {
					settled = true
					uni.hideLoading()
					uni.showModal({
						title: tt('已收到付款', 'Payment received'),
						content: tt(`开卡暂时没有完成：${status.payError}。系统已记录，工作人员会尽快处理。`, `Your pass is not active yet: ${status.payError}. Our team has been notified and will follow up shortly.`),
						showCancel: false
					})
					void fetchBrandLock()
					return
				}
			}
		} finally {
			uni.hideLoading()
			polling = false
			if (!settled && !disposed) {
				uni.showModal({
					title: tt('支付结果确认中', 'Confirming payment'),
					content: tt('如已扣款，会员卡会在几分钟内自动开通，可在「订单 · 卡券与会员」查看。', 'If payment was taken, your pass will activate within minutes. Check Orders · Passes & Membership.'),
					showCancel: false
				})
				void fetchBrandLock()
			}
		}
	}

	async function afterPurchase() {
		await load()
		await fetchBrandLock()
	}

	/** 购卡记录与退款已移到订单页；这里只保留购买锁定状态，防止被锁客户继续下单。 */
	async function fetchBrandLock() {
		if (isMock) return
		try {
			const res = await loadBrandOrders()
			brandLocked.value = !!(res && res.locked)
			lockReason.value = (res && res.lockReason) || ''
		} catch (e) {
			// 锁定状态读取失败不阻断浏览；下单时服务端仍会拦截。
		}
	}

	function goRecords() {
		// 订单页是 tabBar 页，用独立标记跳到「卡券与会员」，不影响详情页返回时的 orderShowIndex。
		getApp().globalData.orderTabJump = 3
		uni.switchTab({
			url: '/pages/user/order/order'
		})
	}

	async function openGame() {
		if (!gameEnabled.value || openingGame.value) return
		openingGame.value = true
		try {
			// 每次点击都换新票据：身份页停留超过 5 分钟后旧票据会失效。
			const ticket = await requestGameTicket()
			if (!ticket || !ticket.url) {
				uni.showToast({
					title: tt('游戏服务尚未配置', 'Game service is not configured'),
					icon: 'none'
				})
				return
			}
			uni.navigateTo({
				url: `/pages/user/brand-member/game?url=${encodeURIComponent(ticket.url)}`
			})
		} catch (e) {
			// fetch 拦截器以字符串 reject；只有会员资格类提示可直接展示，其余统一为可重试文案
			const msg = typeof e === 'string' ? e : ''
			uni.showToast({
				title: msg && msg.indexOf('品牌卡') >= 0 ? msg : tt('游戏暂时进不去，请稍后重试', 'The game is unavailable right now. Please try again later.'),
				icon: 'none'
			})
		} finally {
			openingGame.value = false
		}
	}

	async function load() {
		loading.value = true
		error.value = ''
		try {
			const system = uni.getSystemInfoSync()
			statusBar.value = (system && system.statusBarHeight) || 20
			// #ifdef MP-WEIXIN
			const menu = wx.getMenuButtonBoundingClientRect()
			customBar.value = menu.bottom + menu.top - system.statusBarHeight
			// #endif
			// #ifndef MP-WEIXIN
			customBar.value = statusBar.value + 44
			// #endif
			const forced = forcedCard.value
			forcedCard.value = ''
			if (isMock && (forced === 'NONE' || forced === 'ACTIVE')) {
				data.value = setMockCardState(forced)
			} else {
				data.value = await loadBrandMember()
			}
			if (active.value && card.value.productCode) {
				selectedCode.value = card.value.productCode
			}
			if (!isMock) {
				await fetchBrandLock()
			}
		} catch (e) {
			error.value = tt('请稍后重试，会员状态不会被误判为未开通。', 'Please try again later. Your membership status will not be mistaken for inactive.')
		} finally {
			loading.value = false
		}
		// 会员故事只对有效会员展示；读取失败不影响身份页。
		if (data.value && active.value) void refreshStories()
	}

	onLoad((options) => {
		if (isMock && options && (options.card === 'NONE' || options.card === 'ACTIVE')) {
			forcedCard.value = options.card
		}
		const sceneCode = parseGiftScene(options || {})
		if (sceneCode && !cookie.getToken()) {
			// 未登录先记住口令，登录页完成后自动领取并回到会员页。
			stashPendingGift(sceneCode)
			uni.navigateTo({ url: '/pages/login/login' })
			return
		}
		void load().then(() => {
			if (sceneCode) void claimSceneGift(sceneCode)
		})
	})

	onShow(() => {
		syncLocale()
		if (data.value) void load()
	})

	onUnload(() => {
		disposed = true
	})

	onShareAppMessage(() => ({
		title: tt('Full愈年卡 · 时叙、在场、轻疗三店通用', 'Full Yu Annual · one card for three spaces'),
		path: '/pages/user/brand-member/brand-member'
	}))

	onShareTimeline(() => ({
		title: tt('Full愈年卡 · 三店通用', 'Full Yu Annual · one card for three spaces')
	}))
</script>

<style lang="less" scoped>
	.bm-page {
		min-height: 100vh;
		background: #F6F4F2;
		color: #3B3128;
	}

	.bm-nav {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1000;
		background: #F6F4F2;
	}

	.bm-nav-row {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 88rpx;
	}

	.bm-back {
		position: absolute;
		left: 12rpx;
		width: 64rpx;
		height: 64rpx;
	}

	.bm-nav-title {
		font-family: SourceHanSerifSC, 'Songti SC', serif;
		font-size: 32rpx;
		letter-spacing: 0.08em;
		color: #584219;
	}

	.bm-lang {
		position: absolute;
		right: 0;
		min-width: 64rpx;
		height: 48rpx;
		line-height: 48rpx;
		padding: 0 16rpx;
		border: none;
		border-radius: 999rpx;
		background: #EDE4D2;
		color: #584219;
		font-size: 22rpx;
	}

	.bm-lang::after {
		border: none;
	}

	.bm-identity-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 24rpx;
		padding-top: 20rpx;
		border-top: 1rpx solid rgba(245, 236, 219, 0.25);
		font-size: 24rpx;
		color: #F5ECDB;
	}

	.bm-identity-chevron {
		transition: transform 0.2s;
		color: #E8C98F;
	}

	.bm-identity-chevron.open {
		transform: rotate(180deg);
	}

	.bm-drawer {
		margin-top: 16rpx;
		padding: 30rpx 28rpx 32rpx;
		border-radius: 24rpx;
		background: #FFFDF8;
		border: 1rpx solid #E8DCC8;
		box-shadow: 0 16rpx 36rpx -24rpx rgba(88, 66, 25, 0.4);
	}

	.bm-drawer-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.bm-drawer-title {
		font-size: 32rpx;
		color: #3B3128;
	}

	.bm-drawer-close {
		padding: 0 8rpx;
		font-size: 34rpx;
		color: #8A6A40;
	}

	.bm-drawer-sub {
		display: block;
		margin-top: 8rpx;
		font-size: 22rpx;
		color: #8A6A40;
	}

	.bm-drawer-sec {
		margin-top: 26rpx;
		padding-top: 24rpx;
		border-top: 1rpx solid #EFE6D6;
	}

	.bm-drawer-sec:first-of-type {
		border-top: none;
	}

	.bm-drawer-cap {
		display: block;
		margin-bottom: 14rpx;
		font-size: 22rpx;
		letter-spacing: 2rpx;
		color: #8A6A40;
	}

	.bm-drawer .bm-product {
		border-color: #E3DBCC;
	}

	.bm-drawer .bm-panel-note {
		color: #8A6A40;
	}

	.bm-dev-row {
		display: flex;
		justify-content: flex-end;
		padding-top: 16rpx;
	}

	.bm-dev {
		font-size: 20rpx;
		letter-spacing: 0.08em;
		color: #8A6A40;
		border: 1rpx solid #DDD0BB;
		border-radius: 999rpx;
		padding: 4rpx 14rpx;
	}

	.bm-body {
		padding: 0 24rpx 80rpx;
	}

	.bm-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20rpx;
		padding: 220rpx 40rpx;
		color: #8A6A40;
		font-size: 26rpx;
		letter-spacing: 0.05em;
		text-align: center;
	}

	.bm-spinner {
		width: 44rpx;
		height: 44rpx;
		border: 4rpx solid #E4D9C9;
		border-top-color: #8A6A40;
		border-radius: 50%;
		animation: bm-spin 0.8s linear infinite;
	}

	@keyframes bm-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.bm-state-title {
		font-family: SourceHanSerifSC, 'Songti SC', serif;
		font-size: 34rpx;
		color: #584219;
		letter-spacing: 0.06em;
	}

	.bm-state-desc {
		line-height: 1.7;
	}

	.bm-identity {
		position: relative;
		overflow: hidden;
		margin-top: 24rpx;
		padding: 38rpx 34rpx 30rpx;
		border-radius: 24rpx;
		background: linear-gradient(140deg, #4A3515 0%, #584219 55%, #77582D 100%);
		color: #F5ECDB;
		box-shadow: 0 18rpx 40rpx -20rpx rgba(88, 66, 25, 0.55);
	}

	.bm-identity::after {
		content: '';
		position: absolute;
		right: -60rpx;
		bottom: -80rpx;
		width: 260rpx;
		height: 260rpx;
		border-radius: 50%;
		border: 1px solid rgba(245, 236, 219, 0.18);
		pointer-events: none;
	}

	.bm-identity-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20rpx;
	}

	.bm-identity-title {
		flex: 1;
		min-width: 0;
	}

	.bm-eyebrow {
		display: block;
		font-size: 20rpx;
		letter-spacing: 0.18em;
		opacity: 0.72;
	}

	.bm-eyebrow.ink {
		color: #8A6A40;
		opacity: 1;
	}

	.bm-identity-name {
		display: block;
		margin-top: 14rpx;
		font-size: 52rpx;
		letter-spacing: 0.06em;
		line-height: 1.2;
	}

	.bm-state-pill {
		flex: none;
		font-size: 21rpx;
		letter-spacing: 0.08em;
		padding: 6rpx 18rpx;
		border-radius: 999rpx;
		border: 1rpx solid rgba(245, 236, 219, 0.36);
		color: #F0D9A8;
	}

	.bm-identity-sub {
		display: block;
		margin-top: 34rpx;
		font-size: 24rpx;
		letter-spacing: 0.05em;
		opacity: 0.84;
	}

	.bm-identity-valid {
		display: block;
		margin-top: 10rpx;
		font-size: 25rpx;
		letter-spacing: 0.04em;
	}

	.bm-identity-foot {
		display: flex;
		justify-content: space-between;
		gap: 16rpx;
		margin-top: 34rpx;
		padding-top: 22rpx;
		border-top: 1rpx solid rgba(245, 236, 219, 0.18);
		font-size: 20rpx;
		line-height: 1.6;
		opacity: 0.82;
	}

	.bm-here {
		flex: none;
		color: #E4C892;
	}

	.bm-renew-tip {
		margin-top: 18rpx;
		padding: 16rpx 20rpx;
		border-radius: 12rpx;
		background: rgba(245, 236, 219, 0.12);
		font-size: 22rpx;
		line-height: 1.6;
		letter-spacing: 0.04em;
	}

	.bm-renew-row {
		display: flex;
		align-items: center;
		gap: 18rpx;
	}

	.bm-renew-text {
		flex: 1;
		min-width: 0;
		letter-spacing: 0.05em;
	}

	.bm-renew-btn {
		flex: none;
		min-height: 56rpx;
		margin: 0;
		padding: 0 22rpx;
		line-height: 56rpx;
		border-radius: 999rpx;
		background: #E4C892;
		color: #584219;
		font-size: 22rpx;
		letter-spacing: 0.08em;
	}

	.bm-renew-btn::after {
		border: none;
	}

	.bm-join {
		margin-top: 24rpx;
		padding: 38rpx 34rpx 32rpx;
		border-radius: 24rpx;
		background: #FFFFFF;
		border: 2rpx solid #EADFCB;
		box-shadow: 0 12rpx 30rpx -24rpx rgba(88, 66, 25, 0.4);
	}

	.bm-join::before {
		content: '';
		display: block;
		width: 56rpx;
		height: 4rpx;
		margin-bottom: 22rpx;
		background: #C9A45C;
	}

	.bm-join-title {
		display: block;
		margin-top: 14rpx;
		font-size: 46rpx;
		letter-spacing: 0.06em;
		line-height: 1.3;
		color: #584219;
	}

	.bm-join-desc {
		display: block;
		margin-top: 16rpx;
		font-size: 24rpx;
		line-height: 1.8;
		letter-spacing: 0.05em;
		color: #8A6A40;
	}

	.bm-join-price {
		display: flex;
		align-items: baseline;
		margin: 30rpx 0 22rpx;
	}

	.bm-price {
		font-size: 58rpx;
		letter-spacing: 0.04em;
		color: #584219;
	}

	.bm-price-unit {
		margin-left: 6rpx;
		font-size: 24rpx;
		color: #A89880;
	}

	.bm-price-alt {
		margin-left: auto;
		font-size: 22rpx;
		color: #8A6A40;
		letter-spacing: 0.04em;
	}

	.bm-join-rule {
		display: block;
		margin-top: 8rpx;
		text-align: center;
		font-size: 22rpx;
		color: #A5742F;
		letter-spacing: 0.05em;
	}

	.bm-rules-link {
		margin-top: 14rpx;
		padding: 0;
		background: transparent;
		text-align: left;
		font-size: 22rpx;
		line-height: 1.6;
		color: #A5742F;
		letter-spacing: 0.04em;
	}

	.bm-rules-link::after {
		border: none;
	}

	.bm-section {
		margin-top: 20rpx;
		padding: 30rpx;
		background: #FFFFFF;
		border-radius: 20rpx;
		border: 1rpx solid #EFE9E1;
	}

	/* 分组标题：编号 + 大标题 + 尾部状态，让每个模块一眼分开 */
	.bm-panel-head {
		display: flex;
		align-items: flex-start;
		gap: 16rpx;
		margin-bottom: 18rpx;
	}

	.bm-toggle:active {
		opacity: 0.7;
	}

	.bm-panel-index {
		flex: none;
		min-width: 56rpx;
		padding-top: 4rpx;
		font-family: Menlo, 'SF Mono', monospace;
		font-size: 20rpx;
		letter-spacing: 0.12em;
		color: #A5742F;
	}

	.bm-panel-copy {
		flex: 1;
		min-width: 0;
	}

	.bm-panel-title {
		display: block;
		font-size: 32rpx;
		letter-spacing: 0.06em;
		color: #584219;
	}

	.bm-panel-sub {
		display: block;
		margin-top: 4rpx;
		font-size: 21rpx;
		letter-spacing: 0.04em;
		color: #A89880;
	}

	.bm-panel-tail {
		flex: none;
		padding-top: 8rpx;
		font-size: 21rpx;
		color: #A5742F;
		letter-spacing: 0.06em;
	}

	.bm-panel-cta {
		width: 100%;
		margin-top: 12rpx;
		padding: 0;
		background: transparent;
		text-align: left;
		font-size: 23rpx;
		line-height: 1.6;
		color: #A5742F;
		letter-spacing: 0.04em;
	}

	.bm-panel-cta::after {
		border: none;
	}

	.bm-panel-note {
		display: block;
		margin-top: 14rpx;
		font-size: 21rpx;
		line-height: 1.6;
		letter-spacing: 0.04em;
		color: #A89880;
	}

	.bm-panel--journey {
		background: #F8F3EA;
		border-color: #EFE6D6;
	}

	.bm-panel--gift {
		background: #FFFCF5;
		border-color: #EFE6D6;
	}

	.bm-section.bm-panel--flat {
		padding: 0 30rpx;
	}

	.bm-section.bm-panel--flat.bm-row {
		padding: 26rpx 30rpx;
	}

	/* 组内入口行 */
	.bm-row {
		display: flex;
		align-items: center;
		gap: 20rpx;
		padding: 22rpx 0;
	}

	.bm-row--divided {
		margin-top: 6rpx;
		border-top: 1rpx solid #F0EBE3;
	}

	.bm-row:active {
		opacity: 0.7;
	}

	.bm-row-title {
		flex: 1;
		min-width: 0;
		font-size: 26rpx;
		letter-spacing: 0.05em;
		color: #3B3128;
	}

	.bm-row-tail {
		flex: none;
		font-size: 23rpx;
		color: #A5742F;
		letter-spacing: 0.04em;
	}

	.bm-earned {
		flex: none;
		font-size: 21rpx;
		color: #A89880;
		letter-spacing: 0.04em;
	}

	.bm-benefit {
		display: flex;
		align-items: center;
		gap: 20rpx;
		padding: 20rpx 0;
		border-bottom: 1rpx solid #F0EBE3;
	}

	.bm-benefit:last-of-type {
		border-bottom: none;
	}

	.bm-benefit-mark {
		flex: none;
		width: 64rpx;
		height: 64rpx;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: SourceHanSerifSC, 'Songti SC', serif;
		font-size: 27rpx;
		color: #FFF9EF;
		background: #8A6A40;
	}

	.bm-benefit-mark.is-retreat {
		background: #A5742F;
	}

	.bm-benefit-mark.is-teahour {
		background: #6B4A35;
	}

	.bm-benefit-mark.is-presence {
		background: #7D8B6A;
	}

	.bm-benefit-copy {
		flex: 1;
		min-width: 0;
	}

	.bm-benefit-title {
		display: block;
		font-size: 26rpx;
		color: #3B3128;
		letter-spacing: 0.04em;
	}

	.bm-benefit-desc {
		display: block;
		margin-top: 4rpx;
		font-size: 21rpx;
		line-height: 1.7;
		color: #8A6A40;
		letter-spacing: 0.04em;
	}

	.bm-benefit-here {
		flex: none;
		font-size: 19rpx;
		letter-spacing: 0.08em;
		color: #A5742F;
		border: 1rpx solid #E4C892;
		border-radius: 999rpx;
		padding: 4rpx 12rpx;
	}

	.bm-fine {
		display: block;
		margin-top: 18rpx;
		font-size: 21rpx;
		line-height: 1.7;
		color: #A89880;
		letter-spacing: 0.04em;
	}

	.bm-dice {
		display: flex;
		align-items: baseline;
		gap: 6rpx;
		flex: none;
		font-size: 21rpx;
		color: #8A6A40;
	}

	.bm-dice-num {
		font-family: SourceHanSerifSC, 'Songti SC', serif;
		font-size: 42rpx;
		color: #A5742F;
	}

	.bm-dice-label {
		font-size: 21rpx;
		letter-spacing: 0.04em;
	}

	.bm-dice.debt .bm-dice-num,
	.bm-dice.debt .bm-dice-label {
		color: #B4613C;
	}

	/* 骰子进度：金额与百分比由 CRM 计算，这里只负责展示 */
	.bm-progress {
		padding: 22rpx 24rpx;
		border-radius: 16rpx;
		background: #FFFDF8;
		border: 1rpx solid #EFE6D6;
	}

	.bm-progress-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16rpx;
	}

	.bm-progress-title {
		flex: 1;
		min-width: 0;
		font-size: 25rpx;
		line-height: 1.6;
		color: #584219;
		letter-spacing: 0.05em;
	}

	.bm-progress-num {
		flex: none;
		font-family: SourceHanSerifSC, 'Songti SC', serif;
		font-size: 26rpx;
		color: #A5742F;
		letter-spacing: 0.05em;
	}

	.bm-progress-track {
		height: 14rpx;
		margin-top: 14rpx;
		border-radius: 999rpx;
		background: #EFE6D6;
		overflow: hidden;
	}

	.bm-progress-fill {
		height: 100%;
		min-width: 14rpx;
		border-radius: 999rpx;
		background: linear-gradient(90deg, #C9A45C, #A5742F);
	}

	.bm-progress-note {
		display: block;
		margin-top: 12rpx;
		font-size: 21rpx;
		line-height: 1.7;
		color: #A89880;
		letter-spacing: 0.05em;
	}

	.bm-journey-debt {
		display: block;
		margin-top: 12rpx;
		font-size: 21rpx;
		line-height: 1.7;
		color: #B4613C;
		letter-spacing: 0.05em;
	}

	.bm-progress-tip {
		display: flex;
		align-items: center;
		gap: 18rpx;
		margin-top: 18rpx;
		padding-top: 18rpx;
		border-top: 1rpx dashed #E4D9C9;
	}

	/* 年卡礼提货码 */
	.bm-voucher {
		display: flex;
		align-items: center;
		gap: 20rpx;
		padding: 20rpx 0;
		border-bottom: 1rpx solid #F0EBE3;
	}

	.bm-voucher:last-of-type {
		border-bottom: none;
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
		font-family: Menlo, 'SF Mono', monospace;
		font-size: 30rpx;
		color: #584219;
		letter-spacing: 0.18em;
	}

	.bm-voucher-state {
		display: block;
		margin-top: 4rpx;
		font-size: 20rpx;
		color: #A5742F;
		letter-spacing: 0.12em;
	}

	.bm-gift-link {
		display: block;
		width: 100%;
		margin-top: 18rpx;
		text-align: center;
	}

	.bm-gift-input {
		width: 100%;
		height: 92rpx;
		box-sizing: border-box;
		margin-top: 22rpx;
		padding: 0 24rpx;
		border-radius: 14rpx;
		border: 1rpx solid #EADFCB;
		background: #FFFFFF;
		font-family: Menlo, 'SF Mono', monospace;
		font-size: 30rpx;
		color: #3B3128;
		letter-spacing: 0.18em;
	}

	/* 会员故事 */
	.bm-story {
		padding: 22rpx 0;
		border-bottom: 1rpx solid #F0EBE3;
	}

	.bm-story:first-child {
		padding-top: 0;
	}

	.bm-story-title {
		display: block;
		font-size: 28rpx;
		line-height: 1.5;
		color: #584219;
		letter-spacing: 0.06em;
	}

	.bm-story-quote {
		display: block;
		margin-top: 12rpx;
		padding-left: 18rpx;
		border-left: 4rpx solid #E4C892;
		font-size: 24rpx;
		line-height: 1.8;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.bm-story-body {
		display: block;
		margin-top: 12rpx;
		font-size: 23rpx;
		line-height: 1.85;
		color: #3B3128;
		letter-spacing: 0.05em;
	}

	/* 会员公告 */
	.bm-notice {
		padding: 20rpx 0;
		border-bottom: 1rpx solid #F0EBE3;
	}

	.bm-notice:last-child {
		padding-bottom: 0;
		border-bottom: none;
	}

	.bm-notice-head {
		display: flex;
		align-items: center;
		gap: 12rpx;
	}

	.bm-notice-title {
		font-size: 26rpx;
		line-height: 1.5;
		color: #3B3128;
		letter-spacing: 0.05em;
	}

	.bm-notice-pin {
		flex: none;
		padding: 2rpx 10rpx;
		border-radius: 999rpx;
		border: 1rpx solid #E4C892;
		font-size: 18rpx;
		color: #A5742F;
		letter-spacing: 0.06em;
	}

	.bm-notice-body {
		display: block;
		margin-top: 8rpx;
		font-size: 22rpx;
		line-height: 1.8;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.bm-notice-date {
		display: block;
		margin-top: 8rpx;
		font-size: 19rpx;
		color: #B7A88F;
		letter-spacing: 0.04em;
	}

	/* 意见反馈 */
	.bm-feedback-input {
		width: 100%;
		height: 260rpx;
		box-sizing: border-box;
		margin-top: 22rpx;
		padding: 20rpx 22rpx;
		border-radius: 14rpx;
		border: 1rpx solid #EADFCB;
		background: #FFFFFF;
		font-size: 25rpx;
		line-height: 1.7;
		color: #3B3128;
		letter-spacing: 0.05em;
	}

	.bm-feedback-count {
		display: block;
		margin-top: 8rpx;
		text-align: right;
		font-size: 20rpx;
		color: #A89880;
		letter-spacing: 0.05em;
	}

	.bm-journey-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20rpx;
		margin-top: 14rpx;
	}

	.bm-journey-next {
		font-size: 22rpx;
		color: #8A6A40;
		letter-spacing: 0.04em;
	}

	.bm-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 88rpx;
		padding: 0 32rpx;
		border-radius: 16rpx;
		background: #FFFFFF;
		border: 2rpx solid #E4D9C9;
		color: #584219;
		font-size: 27rpx;
		letter-spacing: 0.06em;
	}

	.bm-btn.primary {
		background: #584219;
		border-color: #584219;
		color: #F6F0E4;
	}

	.bm-btn.full {
		width: 100%;
		margin-top: 20rpx;
	}

	.bm-btn.compact {
		min-height: 64rpx;
		padding: 0 26rpx;
		font-size: 23rpx;
	}

	.bm-btn[disabled] {
		opacity: 0.45;
	}

	.bm-products {
		display: flex;
		gap: 16rpx;
	}

	.bm-product {
		flex: 1;
		padding: 22rpx 24rpx;
		text-align: left;
		border-radius: 14rpx;
		border: 2rpx solid #EDE5D8;
		background: #FFFDF8;
	}

	.bm-product.selected {
		border-color: #C9A45C;
		background: #FBF4E8;
	}

	.bm-product-name {
		display: block;
		font-size: 24rpx;
		color: #584219;
		letter-spacing: 0.04em;
	}

	.bm-product-price {
		display: block;
		margin-top: 8rpx;
		font-size: 38rpx;
		color: #584219;
	}

	.bm-product-period {
		display: block;
		font-size: 20rpx;
		color: #A89880;
	}

	.bm-foot {
		margin-top: 44rpx;
		text-align: center;
		font-size: 20rpx;
		letter-spacing: 0.16em;
		color: #A89880;
	}

	.bm-foot-sub {
		display: block;
		margin-top: 8rpx;
		letter-spacing: 0.08em;
		opacity: 0.8;
	}

	/* 风控锁定提示 */
	.bm-lock {
		margin-top: 20rpx;
		padding: 22rpx 26rpx;
		border-radius: 16rpx;
		background: #FBF0EA;
		border: 1rpx solid #E8C9B8;
	}

	.bm-lock-title {
		display: block;
		font-size: 24rpx;
		letter-spacing: 0.05em;
		color: #A34F2E;
	}

	.bm-lock-desc {
		display: block;
		margin-top: 6rpx;
		font-size: 21rpx;
		line-height: 1.7;
		letter-spacing: 0.03em;
		color: #9A6A4E;
	}

	/* 条款勾选 */
	.bm-agree {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10rpx;
		margin-top: 20rpx;
		font-size: 21rpx;
		letter-spacing: 0.03em;
		color: #8A6A40;
	}

	.bm-check {
		flex: none;
		width: 30rpx;
		height: 30rpx;
		border-radius: 8rpx;
		border: 2rpx solid #C9A45C;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20rpx;
		line-height: 1;
		color: #FFF9EF;
	}

	.bm-check.on {
		background: #584219;
		border-color: #584219;
	}

	.bm-agree-link {
		color: #A5742F;
	}

	/* 会员档案 */
	.bm-profile-line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 16rpx;
		padding: 18rpx 22rpx;
		border-radius: 16rpx;
		background: rgba(255, 255, 255, 0.66);
		font-size: 22rpx;
		letter-spacing: 0.04em;
		color: #6A5334;
	}

	.bm-profile-edit {
		color: #A5742F;
	}

	.bm-form {
		margin-top: 18rpx;
	}

	.bm-form-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24rpx;
		padding: 22rpx 0;
		border-bottom: 1rpx solid #EFE9E1;
	}

	.bm-form-row:last-child {
		border-bottom: none;
	}

	.bm-form-label {
		flex: none;
		font-size: 26rpx;
		letter-spacing: 0.04em;
		color: #3B3128;
	}

	.bm-required {
		color: #B4613C;
	}

	.bm-form-input {
		flex: 1;
		text-align: right;
		font-size: 26rpx;
		color: #3B3128;
	}

	.bm-gender {
		display: flex;
		gap: 14rpx;
	}

	.bm-gender-opt {
		min-width: 108rpx;
		padding: 12rpx 0;
		border: 1rpx solid #DDD3C6;
		border-radius: 999rpx;
		text-align: center;
		font-size: 24rpx;
		color: #6A5334;
		background: #FFFFFF;
	}

	.bm-gender-opt.on {
		border-color: #584219;
		background: #584219;
		color: #F6F4F2;
	}

	.bm-form-picker {
		min-width: 260rpx;
		text-align: right;
		font-size: 26rpx;
		color: #3B3128;
	}

	.bm-form-picker.empty {
		color: #B7A88F;
	}

	.bm-form-note {
		display: block;
		margin-top: 18rpx;
		font-size: 20rpx;
		line-height: 1.6;
		letter-spacing: 0.03em;
		color: #A89880;
	}

	/* 档案浮层 */
	.bm-mask {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 2000;
		display: flex;
		align-items: flex-end;
		background: rgba(43, 33, 22, 0.45);
	}

	.bm-sheet {
		width: 100%;
		box-sizing: border-box;
		padding: 36rpx 32rpx;
		padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
		border-radius: 28rpx 28rpx 0 0;
		background: #FFFDF8;
	}

	.bm-sheet-title {
		display: block;
		text-align: center;
		font-size: 34rpx;
		letter-spacing: 0.06em;
		color: #584219;
	}

	.bm-sheet-sub {
		display: block;
		margin-top: 6rpx;
		text-align: center;
		font-size: 21rpx;
		letter-spacing: 0.03em;
		color: #A89880;
	}

	.bm-refund-box {
		margin-top: 24rpx;
		padding: 24rpx;
		border-radius: 16rpx;
		background: #F8F3EA;
	}

	.bm-refund-row {
		display: flex;
		justify-content: space-between;
		gap: 20rpx;
		padding: 6rpx 0;
		font-size: 23rpx;
		color: #8A6A40;
	}

	.bm-refund-total {
		font-family: SourceHanSerifSC, 'Songti SC', serif;
		font-size: 32rpx;
		color: #584219;
	}

	.bm-refund-policy {
		display: block;
		margin-top: 14rpx;
		font-size: 21rpx;
		line-height: 1.7;
		color: #8A6A40;
	}

	.bm-refund-deadline {
		display: block;
		margin-top: 4rpx;
		font-size: 20rpx;
		color: #A89880;
	}

	.bm-refund-input {
		width: 100%;
		height: 88rpx;
		box-sizing: border-box;
		margin-top: 20rpx;
		padding: 0 20rpx;
		border-radius: 14rpx;
		border: 1rpx solid #EADFCB;
		background: #FFFFFF;
		font-size: 23rpx;
		color: #3B3128;
	}

	.bm-refund-placeholder {
		color: #B8AA95;
	}

	.bm-refund-warn {
		margin-top: 16rpx;
		padding: 16rpx 20rpx;
		border-radius: 12rpx;
		background: #FBF0EA;
		font-size: 21rpx;
		line-height: 1.7;
		color: #A34F2E;
	}

	.bm-refund-warn .bm-agree {
		margin-top: 10rpx;
		color: #A34F2E;
	}

	.bm-sheet-actions {
		display: flex;
		gap: 16rpx;
		margin-top: 26rpx;
	}

	.bm-sheet-actions .bm-btn {
		flex: 1;
		margin-top: 0;
	}
</style>
