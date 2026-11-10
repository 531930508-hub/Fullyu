<template>
	<view class="min-h-screen bg-[#F6F4F2] pb-[80rpx]">
		<TopTitleNotBack></TopTitleNotBack>
		<view :style="{marginTop: customBar + 'px'}" class="px-4 pt-4">
			<!-- 产品切换 -->
			<view v-if="productList.length" class="product-tabs">
				<view v-for="item in productList" :key="item.cardType"
					  :class="['product-tab', item.cardType === selectedType ? 'product-tab--active' : '']"
					  @click="selectProduct(item)">
					<view class="product-tab-name">
						{{item.cardName}}
						<text v-if="item.recommend" class="recommend-tag">推荐</text>
					</view>
					<view class="product-tab-meta">{{item.validDays}} 天 · ¥{{item.price}}</view>
				</view>
			</view>

			<!-- 主视觉 -->
			<view class="hero">
				<text class="hero-eyebrow">FULL YU ANNUAL · 三店通用</text>
				<view class="flex items-start justify-between">
					<view>
						<view class="text-[36rpx] font-semibold" style="font-family: SourceHanSerifSC;">
							{{selectedProduct.cardName || 'Full愈年卡'}}
						</view>
						<view class="mt-2 text-[24rpx] hero-sub">{{selectedProduct.validDays || 365}} 天 · 时叙、在场、轻疗三店通用</view>
					</view>
					<view class="price-tag">
						<text class="text-[44rpx] font-semibold">{{selectedProduct.price || 0}}</text>
						<text class="text-[22rpx]"> 元</text>
					</view>
				</view>
				<view class="rates mt-6">
					<view class="rate-item">
						<text class="rate-num">{{selectedProduct.advanceDiscountText || '7.55 折'}}</text>
						<text class="rate-label">轻疗 · 提前预约</text>
					</view>
					<view class="rate-divider"></view>
					<view class="rate-item">
						<text class="rate-num">{{selectedProduct.sameDayDiscountText || '8.5 折'}}</text>
						<text class="rate-label">轻疗 · 当日预约</text>
					</view>
				</view>
				<view class="mt-5 text-[22rpx] hero-sub">品牌通用会员 · 有效期内三店享会员价；权益卡不设储值，到期自动失效</view>
			</view>

			<!-- 回本测算 -->
			<view class="payback-card mt-4">
				<view class="payback-head">
					<text class="payback-title">几次回本</text>
					<text class="payback-tag">轻疗 {{payback.sampleMinutes || 60}} 分钟项目示例</text>
				</view>
				<view class="payback-grid">
					<view class="payback-cell">
						<view class="payback-value">¥{{payback.basePrice || 396}}</view>
						<view class="payback-label">原价</view>
					</view>
					<view class="payback-cell">
						<view class="payback-value">¥{{payback.memberPrice || 0}}</view>
						<view class="payback-label">会员价</view>
					</view>
					<view class="payback-cell">
						<view class="payback-value accent">省 ¥{{payback.save || 0}}</view>
						<view class="payback-label">单次</view>
					</view>
					<view class="payback-cell">
						<view class="payback-value accent">{{payback.visits || 0}} 次</view>
						<view class="payback-label">即回本</view>
					</view>
				</view>
				<view class="payback-text">{{payback.text}}</view>
			</view>

			<!-- 状态卡 -->
			<view class="state-card mt-4">
				<view v-if="state === 'none'" class="state-body">
					<view class="state-title">还未开通 Full愈年卡</view>
					<view class="state-desc">开通后有效期内享轻疗、时叙、在场三店会员价，积分同账户。</view>
				</view>

				<view v-else-if="state === 'active' || state === 'expiring'" class="state-body">
					<view class="flex items-center justify-between">
						<view class="state-title">{{info.current && info.current.cardName}} {{state === 'expiring' ? '即将到期' : '生效中'}}</view>
						<view class="status-pill">剩余 {{info.remainingDays}} 天</view>
					</view>
					<view class="state-desc mt-2">
						卡号尾号 {{info.current && info.current.cardNoTail}} · 有效期至 {{endDateText}} · 三店通用
					</view>
					<view v-if="state === 'expiring'" class="expire-tip">
						会员卡还有 {{info.remainingDays}} 天到期，续费后从当前有效期结束日开始计算。
					</view>
					<view v-if="info.pending" class="expire-tip">
						已续费，{{formatDate(info.pending.startTime)}} 起生效
					</view>
				</view>

				<view v-else-if="state === 'pending'" class="state-body">
					<view class="state-title">续费已排期</view>
					<view class="state-desc mt-2">{{formatDate(info.pending && info.pending.startTime)}} 起进入新的权益期，三店权益同步接续。</view>
				</view>

				<view v-else-if="state === 'expired'" class="state-body">
					<view class="state-title">Full愈年卡已到期</view>
					<view class="state-desc mt-2">续费后继续享轻疗、时叙、在场三店会员价。</view>
				</view>
			</view>

			<!-- 三店权益 -->
			<view class="section mt-4">
				<view class="section-title">三店会员权益</view>
				<view v-for="(item, index) in benefitList" :key="index" class="benefit-block">
					<view class="benefit-head">
						<text class="benefit-index">{{index + 1}}</text>
						<text class="benefit-name">{{item.title}}</text>
					</view>
					<view class="benefit-desc">{{item.desc}}</view>
				</view>
				<view class="benefit-note">会员价不与券包、积分、活动价叠加，同一笔消费按最优价结算。积分不可购买、提现或转让，按批次到期；轻疗结算时每 1 积分抵 ¥1，可抵金额以结算页为准；时叙、在场本期仅展示积分。</view>
			</view>

			<!-- 购买资料 -->
			<view class="section mt-4">
				<view class="section-title">开通资料 <text class="section-optional">选填</text></view>
				<view class="form-row">
					<text class="form-label">称呼</text>
					<input v-model="buyer.contactName" class="form-input" placeholder="怎么称呼您" maxlength="20"/>
				</view>
				<view class="form-row">
					<text class="form-label">性别</text>
					<view class="gender-group">
						<view :class="['gender-item', buyer.contactGender === 2 ? 'gender-item--active' : '']"
							  @click="buyer.contactGender = 2">女士</view>
						<view :class="['gender-item', buyer.contactGender === 1 ? 'gender-item--active' : '']"
							  @click="buyer.contactGender = 1">男士</view>
					</view>
				</view>
				<view class="form-row">
					<text class="form-label">微信号</text>
					<input v-model="buyer.contactWechat" class="form-input" placeholder="便于权益通知" maxlength="30"/>
				</view>
				<view class="form-row">
					<text class="form-label">生日</text>
					<picker mode="date" :value="buyer.contactBirthday" @change="onBirthday">
						<view class="form-picker">{{buyer.contactBirthday || '选择日期'}}</view>
					</picker>
				</view>
				<view class="form-row form-row--switch">
					<text class="form-label">会员社群</text>
					<switch :checked="buyer.joinGroup" color="#584219" style="transform: scale(0.8);"
							@change="onJoinGroup"/>
					<text class="form-switch-text">希望加入 Full愈会员社群</text>
				</view>
			</view>

			<!-- 权益期 -->
			<view v-if="periodList.length" class="section mt-4">
				<view class="section-title">我的权益期</view>
				<view v-for="(item, index) in periodList" :key="index" class="period-row">
					<view class="flex items-center justify-between">
						<view class="text-[26rpx] text-[#584219]">{{item.cardName || '会员卡'}} · 第 {{item.periodNo}} 期 · {{item.statusText}}</view>
						<view class="text-[24rpx] text-[#8A6A40]">{{item.amount}} 元</view>
					</view>
					<view class="text-[23rpx] text-[#8A6A40] mt-1">
						{{formatDate(item.startTime)}} 至 {{formatDate(item.endTime)}}
					</view>
				</view>
			</view>

			<!-- 购买条款 -->
			<view class="section mt-4">
				<view class="section-title" @click="showRules = !showRules">
					购买条款与免责说明
					<text class="rule-toggle">{{showRules ? '收起' : '展开'}}</text>
				</view>
				<view v-show="showRules" class="terms-text">
					<view class="mb-2">{{config.purchaseNotice || '会员卡为虚拟权益产品，开通即生效。'}}</view>
					<text>{{config.terms}}</text>
				</view>
				<view class="agree-row" @click="agreed = !agreed">
					<view :class="['agree-box', agreed ? 'agree-box--checked' : '']">{{agreed ? '✓' : ''}}</view>
					<text class="agree-text">我已阅读并同意会员卡购买条款。会员卡为服务权益卡，不含储值余额，不折现、不转让；退款按《会员权益与规则》处理。</text>
				</view>
				<view class="rules-link" @click="openRules">查看《会员权益与规则》</view>
			</view>

			<view class="mt-4">
				<button class="primary-btn" :disabled="submitting" @click="handlePurchase">
					{{submitting ? '处理中…' : actionText}}
				</button>
				<view class="brand-note">开通后可在「我的 → Full愈年卡」查看品牌身份与「愈行之旅」。</view>
			</view>

			<view v-if="config.testMode" class="test-tip">
				测试环境：开通后立即生效，不会产生真实扣款
			</view>
			<view v-else class="test-tip">支付通道接入中，当前可到门店开通</view>
		</view>
	</view>
</template>

<script setup>
	import { onLoad, onShow } from '@dcloudio/uni-app'
	import { ref, reactive, computed } from 'vue'
	import TopTitleNotBack from '../../../components/TopTitleNotBack.vue'
	import cookie from '../../../utils/cookieUtil'
	import memberCardApi from '../../../api/memberCard'

	const customBar = ref(0)
	const config = ref({})
	const info = ref({})
	const showRules = ref(false)
	const submitting = ref(false)
	const agreed = ref(false)
	const selectedType = ref('year')
	const typeTouched = ref(false)

	const buyer = reactive({
		contactName: '',
		contactGender: 2,
		contactWechat: '',
		contactBirthday: '',
		joinGroup: true
	})

	onLoad((options) => {
		uni.getSystemInfo({
			success: (e) => {
				// #ifdef MP-WEIXIN
				const custom = wx.getMenuButtonBoundingClientRect()
				customBar.value = custom.bottom + custom.top - e.statusBarHeight
				// #endif
			}
		})
		if (options && (options.type === 'month' || options.type === 'year')) {
			selectedType.value = options.type
			typeTouched.value = true
		}
		loadConfig()
		loadInfo()
	})

	onShow(() => {
		if (config.value.products && config.value.products.length) {
			loadInfo()
		}
	})

	const productList = computed(() => config.value.products || [])
	const selectedProduct = computed(() => {
		const list = productList.value
		return list.find(item => item.cardType === selectedType.value) || list[0] || {}
	})
	const payback = computed(() => selectedProduct.value.payback || {})
	const benefitList = computed(() => config.value.benefits || [])
	const state = computed(() => info.value.state || 'none')
	const periodList = computed(() => info.value.periods || [])

	const endDateText = computed(() => {
		const current = info.value.current
		return current && current.endTime ? formatDate(current.endTime) : ''
	})

	const actionText = computed(() => {
		const name = selectedProduct.value.cardName || 'Full愈年卡'
		switch (state.value) {
			case 'active':
			case 'expiring':
				return '续费 ' + name
			case 'expired':
				return '重新开通 ' + name
			case 'pending':
				return '再续一次 ' + name
			default:
				return '开通 ' + name + ' · ¥' + (selectedProduct.value.price || 0)
		}
	})

	function selectProduct(item) {
		selectedType.value = item.cardType
		typeTouched.value = true
	}

	function onBirthday(event) {
		buyer.contactBirthday = event.detail.value
	}

	function onJoinGroup(event) {
		buyer.joinGroup = event.detail.value
	}

	async function loadConfig() {
		try {
			const data = await memberCardApi.config()
			config.value = data || {}
			if (!typeTouched.value && data) {
				selectedType.value = data.recommendedType || 'year'
			}
		} catch (e) {
			config.value = {}
		}
	}

	async function loadInfo() {
		try {
			const data = await memberCardApi.info()
			info.value = data || {}
			if (data && data.current && !typeTouched.value) {
				selectedType.value = data.current.cardType || data.renewType || 'year'
			}
		} catch (e) {
			info.value = {}
		}
	}

	function openRules() {
		uni.navigateTo({
			url: '/pages/user/brand-member/rules'
		})
	}

	async function handlePurchase() {
		if (!cookie.getToken()) {
			uni.showToast({ title: '请先登录', icon: 'none' })
			setTimeout(() => {
				uni.navigateTo({ url: '/pages/login/login' })
			}, 500)
			return
		}
		if (!agreed.value) {
			uni.showToast({ title: '请先阅读并同意购买条款', icon: 'none' })
			return
		}
		if (submitting.value) {
			return
		}
		submitting.value = true
		try {
			const result = await memberCardApi.purchase({
				cardType: selectedType.value,
				agreeTerms: true,
				contactName: buyer.contactName,
				contactGender: buyer.contactGender,
				contactWechat: buyer.contactWechat,
				contactBirthday: buyer.contactBirthday,
				joinGroup: buyer.joinGroup ? 1 : 0
			})
			if (result && result.info) {
				info.value = result.info
			} else {
				await loadInfo()
			}
			uni.showToast({
				title: result && result.testMode ? '已开通（测试环境未扣款）' : '开通成功',
				icon: 'none'
			})
		} catch (e) {
			// 错误提示已由请求层统一处理
		} finally {
			submitting.value = false
		}
	}

	function formatDate(value) {
		if (!value) {
			return ''
		}
		return String(value).replace('T', ' ').substring(0, 10)
	}
</script>

<style lang="less" scoped>
	.product-tabs {
		display: flex;
		gap: 16rpx;
		margin-bottom: 20rpx;
	}

	.product-tab {
		flex: 1;
		padding: 20rpx 24rpx;
		background: #FFFFFF;
		border: 2rpx solid transparent;
		border-radius: 16rpx;
	}

	.product-tab--active {
		background: #FBF4E8;
		border-color: #C9A45C;
	}

	.product-tab-name {
		display: flex;
		align-items: center;
		font-size: 26rpx;
		font-weight: 600;
		color: #584219;
		letter-spacing: 0.06em;
	}

	.recommend-tag {
		margin-left: 10rpx;
		padding: 2rpx 12rpx;
		background: #C9A45C;
		color: #FFFFFF;
		font-size: 20rpx;
		font-weight: 400;
		border-radius: 999rpx;
		letter-spacing: 0.08em;
	}

	.product-tab-meta {
		margin-top: 8rpx;
		font-size: 22rpx;
		color: #8A6A40;
	}

	.hero {
		background: #584219;
		border-radius: 20rpx;
		padding: 40rpx 36rpx 36rpx;
		color: #F3E9D8;
	}

	.hero-eyebrow {
		display: block;
		margin-bottom: 18rpx;
		font-size: 19rpx;
		letter-spacing: 0.18em;
		color: rgba(228, 200, 146, 0.86);
	}

	.hero-sub {
		color: rgba(243, 233, 216, 0.72);
		letter-spacing: 0.05em;
	}

	.price-tag {
		display: flex;
		align-items: baseline;
		color: #E4C892;
	}

	.rates {
		display: flex;
		align-items: center;
	}

	.rate-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.rate-num {
		font-size: 52rpx;
		font-weight: 600;
		color: #E4C892;
		letter-spacing: 0.06em;
	}

	.rate-label {
		margin-top: 6rpx;
		font-size: 23rpx;
		color: rgba(243, 233, 216, 0.72);
		letter-spacing: 0.12em;
	}

	.rate-divider {
		width: 1px;
		height: 64rpx;
		background: rgba(243, 233, 216, 0.24);
	}

	.payback-card {
		background: #FFFFFF;
		border-radius: 16rpx;
		padding: 28rpx 32rpx;
	}

	.payback-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.payback-title {
		font-size: 28rpx;
		font-weight: 600;
		color: #584219;
		letter-spacing: 0.06em;
	}

	.payback-tag {
		font-size: 22rpx;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.payback-grid {
		display: flex;
		margin-top: 22rpx;
	}

	.payback-cell {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.payback-value {
		font-size: 32rpx;
		font-weight: 600;
		color: #584219;
	}

	.payback-value.accent {
		color: #A5742F;
	}

	.payback-label {
		margin-top: 6rpx;
		font-size: 22rpx;
		color: #A89880;
		letter-spacing: 0.08em;
	}

	.payback-text {
		margin-top: 20rpx;
		padding-top: 18rpx;
		border-top: 1px solid #F0EBE3;
		font-size: 23rpx;
		color: #8A6A40;
		line-height: 1.7;
		letter-spacing: 0.05em;
	}

	.state-card,
	.section {
		background: #FFFFFF;
		border-radius: 16rpx;
		padding: 32rpx 32rpx;
	}

	.state-title {
		font-size: 30rpx;
		font-weight: 600;
		color: #584219;
		letter-spacing: 0.06em;
	}

	.state-desc {
		margin-top: 8rpx;
		font-size: 24rpx;
		color: #8A6A40;
		line-height: 1.6;
		letter-spacing: 0.05em;
	}

	.status-pill {
		padding: 6rpx 18rpx;
		border-radius: 999rpx;
		background: #F6F1E8;
		color: #8A6A40;
		font-size: 22rpx;
		letter-spacing: 0.05em;
	}

	.expire-tip {
		margin-top: 16rpx;
		padding: 16rpx 20rpx;
		background: #FBF4E8;
		border-radius: 12rpx;
		font-size: 23rpx;
		color: #A5742F;
		line-height: 1.6;
	}

	.primary-btn {
		width: 100%;
		background: #584219;
		color: #F3E9D8;
		border-radius: 16rpx;
		font-size: 28rpx;
		letter-spacing: 0.08em;
		padding: 10rpx 0;
	}

	.primary-btn[disabled] {
		background: #A89880;
		color: #F3E9D8;
	}

	.brand-note {
		margin-top: 14rpx;
		font-size: 21rpx;
		line-height: 1.6;
		color: #A89880;
		text-align: center;
		letter-spacing: 0.04em;
	}

	.test-tip {
		margin-top: 16rpx;
		font-size: 22rpx;
		color: #A89880;
		text-align: center;
		letter-spacing: 0.05em;
	}

	.section-title {
		font-size: 28rpx;
		font-weight: 600;
		color: #584219;
		letter-spacing: 0.06em;
		margin-bottom: 16rpx;
	}

	.section-optional {
		margin-left: 8rpx;
		font-size: 22rpx;
		font-weight: 400;
		color: #A89880;
	}

	.benefit-block {
		padding: 16rpx 0;
		border-bottom: 1px solid #F0EBE3;
	}

	.benefit-block:last-of-type {
		border-bottom: none;
	}

	.benefit-head {
		display: flex;
		align-items: center;
	}

	.benefit-index {
		width: 34rpx;
		height: 34rpx;
		margin-right: 12rpx;
		border-radius: 50%;
		background: #FBF4E8;
		color: #A5742F;
		font-size: 20rpx;
		line-height: 34rpx;
		text-align: center;
	}

	.benefit-name {
		font-size: 26rpx;
		font-weight: 600;
		color: #584219;
		letter-spacing: 0.05em;
	}

	.benefit-desc {
		margin-top: 8rpx;
		padding-left: 46rpx;
		font-size: 23rpx;
		color: #8A6A40;
		line-height: 1.7;
		letter-spacing: 0.05em;
	}

	.benefit-note {
		margin-top: 16rpx;
		padding: 14rpx 18rpx;
		background: #F8F6F2;
		border-radius: 10rpx;
		font-size: 22rpx;
		color: #8A6A40;
		line-height: 1.6;
	}

	.form-row {
		display: flex;
		align-items: center;
		padding: 18rpx 0;
		border-bottom: 1px solid #F0EBE3;
	}

	.form-row:last-child {
		border-bottom: none;
	}

	.form-label {
		width: 140rpx;
		font-size: 25rpx;
		color: #584219;
		letter-spacing: 0.05em;
	}

	.form-input,
	.form-picker {
		flex: 1;
		font-size: 25rpx;
		color: #3B3128;
	}

	.form-picker {
		color: #3B3128;
	}

	.gender-group {
		display: flex;
		gap: 16rpx;
	}

	.gender-item {
		padding: 8rpx 28rpx;
		border: 1px solid #E4D9C9;
		border-radius: 999rpx;
		font-size: 24rpx;
		color: #8A6A40;
	}

	.gender-item--active {
		background: #FBF4E8;
		border-color: #C9A45C;
		color: #584219;
	}

	.form-row--switch {
		gap: 8rpx;
	}

	.form-switch-text {
		font-size: 23rpx;
		color: #8A6A40;
	}

	.period-row {
		padding: 16rpx 0;
		border-bottom: 1px solid #F0EBE3;
	}

	.period-row:last-child {
		border-bottom: none;
	}

	.rule-toggle {
		float: right;
		font-size: 23rpx;
		font-weight: 400;
		color: #8A6A40;
	}

	.terms-text {
		font-size: 23rpx;
		color: #8A6A40;
		line-height: 1.8;
		letter-spacing: 0.04em;
		white-space: pre-line;
	}

	.agree-row {
		display: flex;
		align-items: flex-start;
		margin-top: 20rpx;
		padding-top: 18rpx;
		border-top: 1px solid #F0EBE3;
	}

	.agree-box {
		width: 32rpx;
		height: 32rpx;
		margin-right: 12rpx;
		border: 1px solid #C9A45C;
		border-radius: 6rpx;
		font-size: 22rpx;
		line-height: 32rpx;
		text-align: center;
		color: #FFFFFF;
		flex-shrink: 0;
	}

	.agree-box--checked {
		background: #584219;
		border-color: #584219;
	}

	.agree-text {
		font-size: 22rpx;
		color: #8A6A40;
		line-height: 1.6;
		letter-spacing: 0.04em;
	}

	.rules-link {
		margin-top: 12rpx;
		font-size: 22rpx;
		line-height: 1.6;
		color: #A5742F;
		letter-spacing: 0.04em;
	}
</style>
