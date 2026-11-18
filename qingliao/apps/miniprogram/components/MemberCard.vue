<template>
	<!--
		会员卡：一张卡承载身份、本年已省、全平台权益、卡型与续费。
		与在场/时叙同一套卡面：卡脚是稳稳的一条，左侧看明细、右侧拉开抽屉，
		所有内容都在文档流里往下长，不翻面、不浮层。
	-->
	<view class="bmc" :class="{ 'is-open': opened, 'is-dim': !active }">
		<view class="bmc-main">
			<view class="bmc-row1">
				<text class="bmc-eyebrow">FULL YU MEMBER</text>
				<text class="bmc-scope">{{ tt('全平台通用', 'All locations') }}</text>
				<text class="bmc-state" :class="{ 'is-warn': expiring }" @click.stop="onState">{{ stateText }}</text>
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
			<view class="bmc-cell bmc-saved" @click="onSaved">
				<text class="bmc-lab">{{ active ? tt('本年已省', 'Saved this year') : tt('开卡', 'Join') }}</text>
				<text class="bmc-amt serif">{{ footAmount }}</text>
				<text v-if="!active && entry && entry.from" class="bmc-more">{{ tt('起', 'from') }}</text>
			</view>
			<view class="bmc-cell bmc-toggle" @click="onFoot">
				<text>{{ footText }}</text>
				<text class="bmc-car" :class="{ 'is-up': opened }">⌄</text>
			</view>
		</view>

		<!-- 展开区：往下长，把下面的内容推下去 -->
		<view class="bmc-drawer">
			<view class="bmc-drawer-in">
				<view v-if="benefitRows.length" class="bmc-benefits">
					<text class="bmc-dhead">{{ tt('全平台权益 · 全门店可用', 'Platform-wide benefits · all locations') }}</text>
					<view v-for="item in benefitRows" :key="item.business + item.title" class="bmc-ben" :class="{ 'is-scope': item.business === 'all' }">
						<text class="bmc-brand">{{ brandName(item.business) }}</text>
						<view class="bmc-ben-body">
							<text class="bmc-ben-t">{{ item.title }}</text>
							<text v-if="item.desc" class="bmc-ben-d">{{ item.desc }}</text>
						</view>
						<text v-if="item.business === 'retreat'" class="bmc-here">{{ tt('本店', 'Here') }}</text>
					</view>
				</view>

				<view v-if="!isMock && profileSaved" class="bmc-profile" @click="$emit('profile')">
					<text>{{ tt('会员档案', 'Member profile') }}：{{ profileSummary }}</text>
					<text class="bmc-profile-edit">{{ tt('修改', 'Edit') }}</text>
				</view>
				<text class="bmc-note">{{ note }}</text>
				<view class="bmc-link" @click="$emit('rules')">
					<text>{{ tt('会员权益与退款规则', 'Member benefits & refund rules') }}</text>
					<text class="bmc-link-tail">{{ tt('查看 ›', 'View ›') }}</text>
				</view>
				<view v-if="!active" class="bmc-link" @click="$emit('gift')">
					<text>{{ tt('有会员码？点此兑换', 'Have a member code? Redeem here') }}</text>
					<text class="bmc-link-tail">›</text>
				</view>
				<!-- 续费/开通统一收进抽屉：点开是选时长的确认弹窗，卡外不再重复放按钮 -->
				<button hover-class="none" class="bmc-renew" :disabled="submitting || brandLocked" @click.stop="$emit('purchase')">
					{{ renewLabel }}
				</button>
			</view>
		</view>
	</view>
</template>



<script setup>
	import {
		computed,
		ref
	} from 'vue'
	import {
		cardStateLabel,
		formatDate
	} from '../api/brandMember'
	import {
		entryPrice,
		formatYuan
	} from '../utils/memberCatalog'
	import { useLocale } from '../utils/locale'

	const props = defineProps({
		data: { type: Object, default: () => ({}) },
		active: { type: Boolean, default: false },
		pending: { type: Boolean, default: false },
		selectedCode: { type: String, default: '' },
		products: { type: Array, default: () => [] },
		benefits: { type: Array, default: () => [] },
		agreed: { type: Boolean, default: false },
		submitting: { type: Boolean, default: false },
		brandLocked: { type: Boolean, default: false },
		profileSaved: { type: Boolean, default: false },
		profileSummary: { type: String, default: '' },
		payLabel: { type: String, default: '' },
		renewalText: { type: String, default: '' },
		isMock: { type: Boolean, default: false }
	})
	const emit = defineEmits(['purchase', 'select', 'agree', 'rules', 'gift', 'profile', 'detail'])

	const { tt, locale } = useLocale()
	const opened = ref(false)

	const BRAND_LABEL = { all: '全品牌', retreat: '轻疗', teahour: '时叙', presence: '在场' }
	const BRAND_LABEL_EN = { all: 'All brands', retreat: 'Light Heal', teahour: 'Teahour', presence: 'Presence' }
	const STATE_EN = {
		ACTIVE: 'Active',
		EXPIRING: 'Expiring',
		PENDING: 'Starts soon',
		EXPIRED: 'Expired',
		NONE: 'Not joined',
		REFUND_LOCKED: 'Refund pending',
		REFUNDED: 'Refunded'
	}

	const card = computed(() => (props.data && props.data.card) || {})
	const expiring = computed(() => card.value.state === 'EXPIRING')
	const savedCents = computed(() => Number((props.data && props.data.savedCents) || 0))
	const stateText = computed(() => {
		if (!props.active) return tt('未开通', 'Not joined')
		return locale.value === 'en' ? (STATE_EN[card.value.state] || STATE_EN.NONE) : cardStateLabel(card.value.state)
	})
	const nameLine = computed(() => card.value.productName || tt('Full愈大会员', 'Full Yu Member'))
	const footText = computed(() =>
		props.active ? tt('权益与续费', 'Benefits & renewal') : tt('查看权益', 'See benefits')
	)
	/** 抽屉底部的统一入口：已开通叫续费，未开通叫开通，点开都是同一个选时长弹窗。 */
	const renewLabel = computed(() => {
		if (props.submitting) return tt('正在发起支付…', 'Starting payment…')
		if (props.brandLocked) return tt('购买已暂停', 'Purchases paused')
		return props.active ? tt('续费 Full愈大会员', 'Renew Full Yu Membership') : tt('开通 Full愈大会员', 'Join Full Yu Membership')
	})
	const whoLine = computed(() => {
		const member = (props.data && props.data.member) || {}
		if (!props.active) return tt('轻疗放松 · 时叙喝茶 · 在场上课', 'Light Heal · Teahour tea · Presence classes')
		return `${member.name || ''}${member.memberNo ? ' · ' + member.memberNo : ''}`
	})
	const validLine = computed(() => {
		if (!props.active) return tt('一卡通用 · 全门店可用', 'One card · all locations')
		if (props.pending) return tt('新权益期 ' + formatDate(card.value.validFrom) + ' 起生效', 'New term starts ' + formatDate(card.value.validFrom))
		const until = card.value.validUntil ? formatDate(card.value.validUntil) : ''
		const days = card.value.remainingDays
		const tail = expiring.value && days ? tt(` · 剩 ${days} 天`, ` · ${days} days left`) : ''
		return tt(`至 ${until} 到期${tail} · 全门店可用`, `Valid until ${until}${tail} · all locations`)
	})
	/**
	 * 卡脚金额：已开通看本年已省；未开通看 CRM 目录入口价（多档取最低一档），
	 * 目录没拿到就只显示占位符。「起」由 entry.from 决定，不在模板里写死。
	 */
	const entry = computed(() => {
		const rows = props.products.length ? props.products : ((props.data && props.data.products) || [])
		return entryPrice(rows)
	})
	const footAmount = computed(() => {
		if (props.active) return `¥${formatYuan(savedCents.value)}`
		return entry.value ? `¥${formatYuan(entry.value.amountCents)}` : '—'
	})
	const benefitRows = computed(() => {
		const rows = props.benefits.length ? props.benefits : ((props.data && props.data.benefits) || [])
		return rows
	})
	const note = computed(() => {
		if (props.brandLocked) return tt('购买已暂停，请联系工作人员解锁。', 'Purchases are paused. Please contact our team to unlock.')
		return tt('7 天内可自助退款，已领会员礼按价值扣除。', 'Self-service refund within 7 days; gifts already collected are deducted at face value.')
	})

	function brandName(business) {
		if (!BRAND_LABEL[business]) return tt('全平台', 'All brands')
		return locale.value === 'en' ? BRAND_LABEL_EN[business] : BRAND_LABEL[business]
	}

	function onSaved() {
		// 未开通没有历史节省可看，直接展开权益，别弹一个空明细。
		if (!props.active) {
			opened.value = true
			return
		}
		// 已开通：展开明细入口由父页接管（页面内已有购卡/退款记录）
		opened.value = true
	}

	function onFoot() {
		// 卡脚只负责展开：续费入口在展开区的卡型与按钮上，和在场、时叙保持一致。
		opened.value = !opened.value
	}

	function onState() {
		// 状态徽标不是开通入口：点它只展开权益抽屉，不冒泡到页面，也不触发开通/支付。
		opened.value = true
	}
</script>

<style lang="less" scoped>
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
		margin-top: 6px;
		font-size: 9px;
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
		transition: max-height 0.3s ease;
	}
	.bmc.is-open .bmc-drawer {
		/* 轻疗抽屉比时叙多「卡型 + 条款 + 档案」，给足高度避免裁切 */
		max-height: 900px;
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
	.bmc-dhead--plans {
		margin-top: 12px;
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
	/* 范围行（全品牌）比品牌名多一个字：加宽标签列并禁止折行，避免「全品/牌」断成两行 */
	.bmc-ben.is-scope .bmc-brand {
		width: 32px;
		white-space: nowrap;
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

	/* 卡型：与卡面同色系，选中的反白 */
	.bmc-plans {
		display: flex;
		gap: 8px;
	}
	.bmc-plan {
		flex: 1;
		margin: 0;
		padding: 9px 10px;
		text-align: left;
		border-radius: 10px;
		border: 1px solid rgba(247, 241, 231, 0.22);
		background: rgba(247, 241, 231, 0.06);
		color: #f7f1e7;
		line-height: 1.2;
	}
	.bmc-plan.is-on {
		background: #f7f1e7;
		border-color: #f7f1e7;
		color: #3a2a1e;
	}
	.bmc-plan-name {
		display: block;
		font-size: 9px;
		letter-spacing: 0.03em;
		opacity: 0.85;
	}
	.bmc-plan-price {
		display: block;
		margin-top: 3px;
		font-size: 15px;
	}
	.bmc-plan-period {
		display: block;
		margin-top: 1px;
		font-size: 8px;
		opacity: 0.55;
	}

	.bmc-agree {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 10px;
		font-size: 8.5px;
		line-height: 1.5;
		opacity: 0.7;
	}
	.bmc-check {
		flex: none;
		width: 13px;
		height: 13px;
		border-radius: 3px;
		border: 1px solid rgba(247, 241, 231, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 9px;
		line-height: 1;
	}
	.bmc-check.on {
		background: #e8c58d;
		border-color: #e8c58d;
		color: #3a2a1e;
	}
	.bmc-agree-link {
		color: #f4d9ae;
	}

	.bmc-join {
		width: 100%;
		margin-top: 10px;
		padding: 10px;
		border-radius: 10px;
		background: #f7f1e7;
		color: #3a2a1e;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.2;
	}
	.bmc-join[disabled] {
		opacity: 0.6;
	}
	.bmc-note {
		display: block;
		margin-top: 7px;
		font-size: 8.5px;
		line-height: 1.5;
		opacity: 0.42;
	}
	.bmc-profile {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 8px;
		padding: 7px 10px;
		border-radius: 8px;
		background: rgba(247, 241, 231, 0.07);
		font-size: 8.5px;
		letter-spacing: 0.02em;
		opacity: 0.85;
	}
	.bmc-profile-edit {
		color: #f4d9ae;
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
	.bmc-renew {
		width: 100%;
		margin-top: 12px;
		padding: 9px;
		border: 0;
		border-radius: 10px;
		background: #e8c58d;
		color: #3a2a1e;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.2;
	}
	.bmc-renew::after { border: 0; }
	.bmc-renew[disabled] {
		opacity: 0.55;
	}
</style>