<template>
	<view class="rules-page">
		<view class="rules-top">
			<text class="rules-eyebrow">FULL YU MEMBER</text>
			<button class="rules-lang" @click="toggleLocale">{{ lang === 'en' ? '中' : 'EN' }}</button>
		</view>
		<view class="rules-head">
			<text class="rules-title">{{ tt('会员权益与规则', 'Member Benefits & Rules') }}</text>
			<text class="rules-updated">{{ tt('更新日期：2026年11月8日', 'Updated: 8 November 2026') }}</text>
			<text class="rules-lead">{{ tt('本规则适用于 Full愈年卡与月卡。开通前请确认卡种、价格、有效期与适用门店；开通即表示你已阅读并同意本规则。', 'These rules apply to the Full Yu Annual and Monthly Passes. Before joining, confirm the plan, price, validity and participating stores. Joining means you have read and agree to these rules.') }}</text>
		</view>

		<view v-for="(section, index) in sections" :key="index" class="rules-section">
			<text class="rules-h">{{ section.h }}</text>
			<text v-for="(paragraph, pIndex) in section.p" :key="pIndex" class="rules-p">{{ paragraph }}</text>
		</view>

		<text class="rules-foot">{{ tt('本规则为小程序内的会员说明；正式经营主体信息以门店公示为准。', 'These rules describe membership within the Mini Program. Official operating-entity information is subject to store notices.') }}</text>
	</view>
</template>

<script setup>
	import { computed } from 'vue'
	import { useLocale } from '../../../utils/locale'

	const { lang, tt, toggleLocale, syncLocale } = useLocale()
	syncLocale()

	// 与《用户协议》配套的会员专项规则：卡的性质、有效期、权益范围、积分、
	// 退款、会员码与反馈、收款与开票、个人信息共享。三端同一口径，改这里时三端同步。
	const zhSections = [
		{
			h: '一、卡的性质',
			p: [
				'Full愈年卡（¥299 / 365 天）与月卡（¥45 / 30 天）是在有效期内享受轻疗、时叙、在场会员权益的服务权益卡，不是储值卡。卡内不含可消费本金，不产生余额，不可提现、转账、代付或找零。'
			]
		},
		{
			h: '二、有效期与续费',
			p: [
				'有效期自支付成功之日起算，以页面展示的到期日与剩余天数为准。',
				'续费不覆盖当前有效期，从当前有效期结束次日起接续；待生效的续费卡期可在生效前申请全额退款。',
				'有效期届满后权益自动停止；未使用的权益不折现、不结转。到期前 30 天页面会提示续费。'
			]
		},
		{
			h: '三、权益范围',
			p: [
				'权益按业务配置：轻疗、时叙、在场分别提供页面展示的会员价或优惠。具体适用门店、项目、商品与折扣，以开卡时锁定的配置、门店公示和结算页为准。',
				'会员价不与券包、积分、活动价叠加，同一笔消费按对你最有利的一种结算。',
				'轻疗预约折扣按开卡时配置与预约日期计算；时叙、在场的具体权益以对应门店与结算页为准。'
			]
		},
		{
			h: '四、积分',
			p: [
				'积分由 Full愈品牌会员中心统一记录，轻疗、时叙、在场共用一个积分账户。',
				'积分通过消费、活动与「愈行之旅」获得，不可购买、不可提现、不可转让，不构成预付款。',
				'积分按批次计算有效期，到期未使用自动失效；页面展示最近到期时间。',
				'轻疗结算时 1 积分可抵 ¥1，单笔可抵扣金额与可用范围以结算页为准；时叙、在场本期仅展示积分，暂不参与抵扣。',
				'订单退款时，已抵扣积分的退回以结算页与售后规则为准。',
				'「愈行之旅」骰子按会员在三店的实付金额累计获得，每满一定金额（以会员页显示为准）得 1 颗，零头累计到下一颗；骰子与途中礼物不可转让、不折现；订单全额退款的，该笔消费获得的骰子会相应扣回。'
			]
		},
		{
			h: '五、退款',
			p: [
				'开通后 7 日内可申请无理由退款，退还实付金额；期间已领取的年卡礼（实物礼）按其标注价值扣除。',
				'超过 7 日的，按实付金额扣除已享会员优惠与已领取年卡礼价值后计算；已享优惠包括会员价差额、积分抵扣、赠品与活动优惠。计算结果为 0 或以下的，不予退款。',
				'通过会员码兑换、或随其他卡附赠的会员资格未单独付款，不涉及退款；附赠资格随原卡失效。',
				'申请退款前，页面会先显示可退金额与扣除明细；特殊情况可联系门店伙伴，由工作人员核实后协商处理。',
				'退款原路退回，到账时间以支付渠道为准；已开具发票的，需按税务规定办理发票退回或红冲。'
			]
		},
		{
			h: '六、会员码、会员故事与意见反馈',
			p: [
				'会员码由 Full愈 通过活动或合作渠道发放，每个码有名额、兑换截止日期与对应天数，以兑换结果为准；同一账号每个码限兑一次，会员码不可转售。',
				'有效会员可在会员页提交意见反馈。你勾选同意后，我们可能在匿名化处理（只保留姓氏）后将内容整理进「会员故事」，仅向会员展示。'
			]
		},
		{
			h: '七、收款、发票与经营主体',
			p: [
				'会员卡由开通页面注明的业务主体销售并收款，发票由实际收款方开具。',
				'三店权益由各业务主体分别提供；会员身份、卡期与积分由 Full愈品牌会员中心统一记录，用于跨店识别与结算。',
				'门店调整、装修、暂停营业或迁址时，未使用权益按门店公示与本规则处理。'
			]
		},
		{
			h: '八、个人信息',
			p: [
				'为提供三店通用权益，你的手机号、会员编号、卡期与积分会在 Full愈品牌会员体系内（轻疗、时叙、在场）共享；我们不会出售你的个人信息。',
				'详细处理规则见《隐私政策》。你可以在「我的」查看、更正资料，或联系我们注销账号。'
			]
		},
		{
			h: '九、其他',
			p: [
				'本规则是《用户协议》的组成部分；与《用户协议》不一致时，会员权益部分以本规则为准。',
				'已购卡期按开卡时锁定的权益与规则执行；规则更新会在小程序内公布，重大变更显著提示。',
				'如对权益、退款或积分有疑问，请通过「我的」中的客服入口或门店伙伴联系我们。'
			]
		}
	]

	const enSections = [
		{
			h: '1. Nature of the card',
			p: [
				'The Full Yu Annual Pass (¥299 / 365 days) and Monthly Pass (¥45 / 30 days) are service-benefit cards for enjoying member benefits at Light Heal, Teahour and Presence during the validity period. They are not stored-value cards: they carry no spendable balance, cannot be withdrawn, transferred, used to pay for others, or exchanged for change.'
			]
		},
		{
			h: '2. Validity and renewal',
			p: [
				'Validity starts on the date payment succeeds and is measured by the expiry date and remaining days shown on the page.',
				'Renewal does not overlap the current term; it continues from the day after the current term ends. A renewal term that has not yet started may be fully refunded before it begins.',
				'Benefits stop automatically at expiry. Unused benefits are not converted to cash or carried over. The page reminds you to renew 30 days before expiry.'
			]
		},
		{
			h: '3. Scope of benefits',
			p: [
				'Benefits are configured per business: Light Heal, Teahour and Presence each provide the member price or discount shown on their pages. Eligible stores, treatments, products and discounts follow the configuration locked at purchase, store notices and the checkout page.',
				'Member prices do not stack with coupon packs, points or promotional prices; each transaction is settled using the single most favourable option for you.',
				'Light Heal booking discounts are calculated from the configuration at purchase and the booking date; Teahour and Presence benefits follow the respective stores and checkout pages.'
			]
		},
		{
			h: '4. Points',
			p: [
				'Points are recorded centrally by the Full Yu Brand Member Centre; Light Heal, Teahour and Presence share one points account.',
				'Points are earned through spending, events and the Journey. They cannot be purchased, withdrawn or transferred, and do not constitute prepayment.',
				'Points expire in batches; unused points lapse automatically. The page shows the nearest expiry date.',
				'At Light Heal checkout, 1 point offsets ¥1. The amount and scope of each redemption follow the checkout page; Teahour and Presence display points only this term and do not accept point redemption yet.',
				'When an order is refunded, points used are returned according to the checkout page and after-sales rules.',
				'Journey dice accrue from the actual amounts paid across the three spaces; each full threshold (shown on the member page) earns 1 die, with any remainder carried to the next die. Dice and gifts along the way cannot be transferred or converted to cash. If an order is fully refunded, dice earned from that purchase are deducted accordingly.'
			]
		},
		{
			h: '5. Refunds',
			p: [
				'Within 7 days of activation you may request a no-reason refund of the amount actually paid; an annual gift (physical gift) already collected during that period is deducted at its stated value.',
				'After 7 days, the refund is calculated by deducting member discounts already enjoyed and the value of annual gifts already collected from the amount paid. Discounts enjoyed include member-price differences, point deductions, free gifts and promotional offers. If the result is zero or below, no refund is due.',
				'Membership obtained by redeeming a member code, or included with another card, was not paid for separately and is not refundable; such membership ends with the original card.',
				'Before you apply, the page shows the refundable amount and deduction breakdown. For special cases, contact a store partner for verification and discussion.',
				'Refunds are returned via the original payment channel; timing depends on the payment provider. If an invoice has been issued, it must be returned or reversed per tax regulations.'
			]
		},
		{
			h: '6. Member codes, member stories and feedback',
			p: [
				'Member codes are issued by Full Yu through events or partner channels. Each code has a quota, redemption deadline and number of days, subject to the redemption result. Each account may redeem a code once; codes may not be resold.',
				'Active members may submit feedback on the member page. If you opt in, after anonymisation (surname only) we may include your feedback in Member Stories, visible to members only.'
			]
		},
		{
			h: '7. Payment, invoices and operating entities',
			p: [
				'Membership cards are sold and collected by the business entity named on the purchase page; invoices are issued by the actual payee.',
				'Benefits at the three spaces are provided by their respective business entities; membership status, term and points are recorded centrally by the Full Yu Brand Member Centre for cross-store identification and settlement.',
				'If a store adjusts, renovates, suspends operations or relocates, unused benefits are handled per store notices and these rules.'
			]
		},
		{
			h: '8. Personal information',
			p: [
				'To provide cross-store benefits, your phone number, member ID, term and points are shared within the Full Yu brand membership system (Light Heal, Teahour, Presence). We do not sell your personal information.',
				'See the Privacy Policy for details. You can view and correct your information under Me, or contact us to close your account.'
			]
		},
		{
			h: '9. Miscellaneous',
			p: [
				'These rules form part of the User Agreement. If they conflict, these rules prevail for member benefits.',
				'Purchased terms follow the benefits and rules locked at purchase. Updates are published in the Mini Program, with prominent notice for material changes.',
				'For questions about benefits, refunds or points, contact us via the customer-service entry under Me or a store partner.'
			]
		}
	]

	const sections = computed(() => (lang.value === 'en' ? enSections : zhSections))
</script>

<style lang="less" scoped>
	.rules-page {
		min-height: 100vh;
		background: #F6F4F2;
		color: #3B3128;
		padding: 24rpx 40rpx 96rpx;
		box-sizing: border-box;
	}

	.rules-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 8rpx;
	}

	.rules-lang {
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

	.rules-lang::after {
		border: none;
	}

	.rules-head {
		padding: 24rpx 0 8rpx;
	}

	.rules-eyebrow {
		display: block;
		font-size: 20rpx;
		letter-spacing: 4rpx;
		color: #8A6A40;
	}

	.rules-title {
		display: block;
		margin-top: 12rpx;
		font-family: SourceHanSerifSC, 'Songti SC', serif;
		font-size: 44rpx;
		line-height: 1.4;
		letter-spacing: 0.06em;
	}

	.rules-updated {
		display: block;
		margin-top: 12rpx;
		font-size: 22rpx;
		color: #8A6A40;
	}

	.rules-lead {
		display: block;
		margin-top: 20rpx;
		font-size: 26rpx;
		line-height: 1.9;
		color: #5A4B3C;
	}

	.rules-section {
		margin-top: 40rpx;
		padding-top: 32rpx;
		border-top: 1rpx solid #E3DBCC;
	}

	.rules-h {
		display: block;
		font-size: 30rpx;
		font-weight: 600;
		line-height: 1.6;
		letter-spacing: 0.05em;
		margin-bottom: 14rpx;
	}

	.rules-p {
		display: block;
		font-size: 26rpx;
		line-height: 1.95;
		color: #5A4B3C;
		margin-bottom: 10rpx;
		letter-spacing: 0.05em;
	}

	.rules-foot {
		display: block;
		margin-top: 48rpx;
		padding-top: 24rpx;
		border-top: 1rpx solid #E3DBCC;
		font-size: 22rpx;
		line-height: 1.8;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}
</style>
