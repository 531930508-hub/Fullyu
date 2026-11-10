<template>
	<!-- 支付弹框 -->
	<view class="modal-overlay" v-if="visible">
		<view class="payment-modal" @click.stop>
			<view class="modal-header">
				<text class="modal-title text-[#584219]">选择支付方式</text>
				<view class="close-icon" @click="handleCancel"></view>
			</view>

			<view class="modal-content" style="color: #584219;">

				<!-- 系统自动从年卡/折扣/积分/Full愈券中取最优，不再展示四种方案 -->
				<view v-if="priceOptions.length" class="auto-discount-tip">
					<text class="auto-discount-title">已为你自动选择最优惠方案</text>
					<text class="auto-discount-sub">{{autoDiscountSummary}}</text>
				</view>

				<!-- 积分单独提示：默认在积分最划算时使用，可随时不使用 -->
				<view v-if="pointsNoticeVisible" class="points-notice">
					<view class="points-notice-main">
						<text class="points-notice-title">{{pointsDismissed ? '本单未使用积分' : '本单使用积分抵扣'}}</text>
						<text class="points-notice-sub">{{pointsNoticeText}}</text>
					</view>
					<text class="points-notice-action" @click.stop="togglePoints">
						{{pointsDismissed ? '使用积分' : '不使用积分'}}
					</text>
				</view>

				<!-- 卡券支付 -->
				<view @click="payMothed('card')" class=" px-2 border-t border-b border-gray-300"
					:class="(payMothedValue=='card')?'paymothedbg':''"
					style="padding-top: 32rpx;padding-bottom: 32rpx;">
					<view class="flex justify-center items-center ">
						<view class="w-3/4 text-[28rpx] flex items-center ">
							<text>Full愈券账户：</text>
							<text class="text-[24rpx]">{{checkoutData.canUseCouponCount*30}} 分钟 Full愈时刻</text>
						</view>
						<view class="w-1/4 flex justify-end items-end">
							<image :src="(payMothedValue=='card')?'/static/icons/select.png':'/static/icons/circle.png'"
								mode="widthFix" class="w-[30rpx] h-[20rpx]"></image>
						</view>
					</view>
					<view class="text-[20rpx] pt-1 text-[#8A6A40]">
						<text v-if="couponEnough">本次预约消耗 {{(checkoutData.costCouponCount*30)}} 分钟Full愈时刻</text>
						<text v-else>券还差 {{couponShortCount}} 张，本单已按微信支付最低价结算</text>
					</view>
				</view>

				<!-- 微信支付 20265-->
				<view @click="payMothed('weixin')" class="px-2  mb-3"
					:class="(payMothedValue=='weixin')?'paymothedbg':''"
					style="padding-top: 32rpx;padding-bottom: 35rpx;">
					<view class="flex justify-center items-center ">
						<view class="w-3/4 text-[28rpx] flex items-center items-center ">
							<image src="/static/icons/wechat-pay.png" mode="widthFix" class="w-[30rpx] h-[20rpx]">
							</image>
							<text>&nbsp;&nbsp;微信支付</text>
						</view>
						<view class="w-1/4 flex justify-end items-end">
							<image
								:src="(payMothedValue=='weixin')?'/static/icons/select.png':'/static/icons/circle.png'"
								mode="widthFix" class="w-[30rpx] h-[20rpx]"></image>
						</view>
					</view>
					<view v-if="!isCustomerNew" class="text-[20rpx] pt-1 text-[#8A6A40]">
						<text v-if="productRealPrice!=productPrice"
							style="text-decoration-line: line-through;">{{productRealPrice}}元</text>&nbsp;&nbsp;支付<text
							class="text-[red]">{{productPrice}}元</text>
					</view>
					<view v-else class="text-[20rpx] pt-1 text-[#8A6A40]">
						新客享受<text class="text-[red]">{{newCustomerZheKou}}折</text>优惠，优惠价格<text class="text-[red]">{{productPrice}}元 </text>
					</view>
				</view>

				<!-- 购卡 -->
				<view v-if="cardDisplayStatus && productData.productList.length" class="pb-2">
					<text>购卡优惠</text>
					<!-- <text>&nbsp;&nbsp;(Super Benefits)</text> -->
				</view>
				<scroll-view v-if="cardDisplayStatus && productData.productList.length" scroll-x="true" class="scroll-view mb-1">
					<view @click="selectCard(productOne[0].id)" v-if="productOne.length>0"
						class="scroll-view-item rounded-lg bgColor4 "
						:class="(selectPayCard==productOne[0].id)?'active4':''" style="overflow: hidden; ">
						<view class="px-3 pt-4 pb-2 ">
							<view class="flex   w-full  text-[30rpx]   font-semibold"
								style="font-family: SourceHanSerifSC;">
								<view class="pt-1" style="">{{productOne[0].title}} </view>
								<image style="margin-left: -30rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class=" mt-1">
								<text class=" text-[24rpx] font-semibold">{{productOne[0].amount}}元/</text>
								<text class=" text-[22rpx] font-semibold">180mins&nbsp;&nbsp;</text>
								<text class=" text-[22rpx] "
									style="text-decoration-line: line-through;">原{{productOne[0].originalAmount}}元</text>
							</view>
							<view class="flex justify-center items-center mt-1">
								<view class="w-full text-[20rpx]" style="white-space: pre-wrap;">
									{{productOne[0].explainArray[1]}}
								</view>
							</view>
						</view>
						<view class="w-full  flex items-center px-3 py-1 bgcolordown4 text-[20rpx]">
							{{productOne[0].comment}}
						</view>
					</view>

					<view @click="selectCard(productTwo[0].id)" v-if="productTwo.length>0"
						class="scroll-view-item rounded-lg bgColor2 "
						:class="(selectPayCard==productTwo[0].id)?'active2':''" style="overflow: hidden; ">
						<view class="px-3 pt-4 pb-2 ">
							<view class="flex   w-full  text-[30rpx]   font-semibold"
								style="font-family: SourceHanSerifSC;">
								<view class="pt-1" style="">{{productTwo[0].title}} </view>
								<image style="margin-left: -30rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class=" mt-1">
								<text class=" text-[24rpx] font-semibold">{{productTwo[0].amount}}元/</text>
								<text class=" text-[22rpx] font-semibold">360mins&nbsp;&nbsp;</text>
								<text class=" text-[22rpx] "
									style="text-decoration-line: line-through;">原{{productTwo[0].originalAmount}}元</text>
							</view>
							<view class="flex justify-center items-center mt-1">
								<view class="w-full text-[20rpx]" style="white-space: pre-wrap;">
									{{productTwo[0].explainArray[1]}}
								</view>
							</view>
						</view>
						<view class="w-full  flex items-center px-3 py-1 bgcolordown2 text-[20rpx]">
							{{productTwo[0].comment}}
						</view>
					</view>
					<view @click="selectCard(productThree[0].id)" v-if="productThree.length>0"
						class="scroll-view-item rounded-lg bgColor1 "
						:class="(selectPayCard==productThree[0].id)?'active1':''" style="overflow: hidden; ">
						<view class="px-3 pt-4 pb-2 ">
							<view class="flex   w-full  text-[30rpx] text-[#584219]  font-semibold"
								style="font-family: SourceHanSerifSC;">
								<view class="pt-1" style="">{{productThree[0].title}} </view>
								<image style="margin-left: -30rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class=" mt-1">
								<text class=" text-[24rpx] font-semibold">{{productThree[0].amount}}元/</text>
								<text class=" text-[22rpx] font-semibold">720mins&nbsp;&nbsp;</text>
								<text class=" text-[22rpx] "
									style="text-decoration-line: line-through;">原{{productThree[0].originalAmount}}元</text>
							</view>
							<view class="flex justify-center items-center mt-1">
								<view class="w-full text-[20rpx]" style="white-space: pre-wrap;">
									{{productThree[0].explainArray[1]}}
								</view>
							</view>
						</view>
						<view class="w-full  flex items-center px-3 py-1 bgcolordown1 text-[20rpx]">
							{{productThree[0].comment}}
						</view>
					</view>
					<view @click="selectCard(productFour[0].id)" v-if="productFour.length>0"
						class="scroll-view-item rounded-lg bgColor3 "
						:class="(selectPayCard==productFour[0].id)?'active3':''" style="overflow: hidden; ">
						<view class="px-3 pt-4 pb-2 ">
							<view class="flex   w-full  text-[30rpx] text-[#584219]  font-semibold"
								style="font-family: SourceHanSerifSC;">
								<view class="pt-1" style="">{{productFour[0].title}} </view>
								<image style="margin-left: -30rpx;" src="/static/icons/crown.png" mode="widthFix"
									class="w-[50rpx] h-[50rpx]"></image>
							</view>
							<view class=" mt-1">
								<text class="text-[24rpx] font-semibold">{{productFour[0].amount}}元/</text>
								<text class=" text-[22rpx] font-semibold">1800mins&nbsp;&nbsp;</text>
								<text class=" text-[22rpx] "
									style="text-decoration-line: line-through;">原{{productFour[0].originalAmount}}元</text>
							</view>
							<view class="flex justify-center items-center mt-1">
								<view class="w-full text-[20rpx]" style="white-space: pre-wrap;">
									{{productFour[0].explainArray[1]}}
								</view>
							</view>
						</view>
						<view class="w-full  flex items-center px-3 py-1 bgcolordown3 text-[20rpx]">
							{{productFour[0].comment}}
						</view>
					</view>

				</scroll-view>
				<view v-if="cardDisplayStatus && productData.productList.length" class="mb-3">
					您的券即将耗尽，购买fu翁卡券包享全网最优惠计划
				</view>
			</view>

			<view class="modal-footer shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] h-[150rpx]">
				<view class="w-1/2  text-[#584219] ">
					<view>
						<text class="text-[32rpx]">需支付：</text>
						<text class="text-[32rpx]">{{realPayMoney}}元</text>
					</view>
					<view v-if="payMothedValue!='card'&&useIntegrationState">
						<text class="text-[26rpx] font-[26rpx]">已用({{integration||0}}积分抵扣￥{{formatMoney(integration)}})</text>
					</view>
				</view>
				<view class="w-1/2">
					<button class="btn btn-modify flex justify-center items-center " style="font-size: 32rpx;"
						@click="handleConfirm">
						确认支付
						<view class="countdown-timer">
							{{ formattedCountdown }}
						</view>
					</button>
				</view>

			</view>
		</view>
	</view>
</template>

<script setup>
	import {
		ref,
		reactive,
		getCurrentInstance,
		watch,
		onUnmounted,
		computed
	} from 'vue';
	import orderApi from "../api/order";
	import payUtils from "../utils/payUtils";
	import moment from "moment";
	import constant from '../consts/constant'
	import cookie from "../utils/cookieUtil"
	import productApi from "../api/product"

	const {
		proxy
	} = getCurrentInstance()
	const vm = proxy

	// Props
	const props = defineProps({
		visible: {
			type: Boolean,
			default: false
		},
		countdown: {
			type: Number,
			default: 0
		}
	});
	//是否使用积分
	const isUseIntegration = ref(true);
	//现有积分数
	const integration = ref(0)
	//最终支付的金额
	const realPayMoney = ref(0)

	const selectPayCard = ref(0)
	const payMothedValue = ref('')
	const selectCardObject = ref([]) //选择的卡片
	//优惠方案（后端比价结果）
	const priceOptions = ref([])
	//当前选中的优惠来源
	const selectedSource = ref(null)
	//用户是否在本单主动放弃了积分抵扣
	const pointsDismissed = ref(false)

	const formatMoney = (value) => {
		const num = Number(value || 0)
		return isNaN(num) ? '0.00' : num.toFixed(2)
	}
	const sourceOption = (source) => {
		return priceOptions.value.filter(t => t.source == source)[0]
	}
	const couponOption = computed(() => sourceOption(5))
	const couponEnough = computed(() => {
		const canUse = Number(checkoutData.value.canUseCouponCount || 0)
		const cost = Number(checkoutData.value.costCouponCount || 0)
		return cost <= 0 || canUse >= cost
	})
	const couponShortCount = computed(() => {
		const canUse = Number(checkoutData.value.canUseCouponCount || 0)
		const cost = Number(checkoutData.value.costCouponCount || 0)
		return Math.max(0, cost - canUse)
	})
	const pointsOption = computed(() => sourceOption(4))
	const pointsNoticeVisible = computed(() => {
		const option = pointsOption.value
		if (!option || Number(option.pointsCost || 0) <= 0) return false
		if (selectedSource.value == 5) return false
		return selectedSource.value == 4 || pointsDismissed.value
	})
	const autoDiscountSummary = computed(() => {
		const source = selectedSource.value
		const option = sourceOption(source)
		if (source == 5) return '本单使用 Full愈券，现金支付 0 元'
		if (source == 4 && option) {
			return `使用 ${option.pointsCost || 0} 积分抵 ¥${formatMoney(option.benefitAmount)}，微信支付 ¥${formatMoney(option.payAmount)}`
		}
		if (option && Number(option.benefitAmount || 0) > 0) {
			return `${option.label}，已省 ¥${formatMoney(option.benefitAmount)}`
		}
		return '本单按原价支付'
	})
	const pointsNoticeText = computed(() => {
		const option = pointsOption.value
		if (!option) return ''
		if (selectedSource.value == 4) {
			return `使用 ${option.pointsCost || 0} 积分抵 ¥${formatMoney(option.benefitAmount)}，微信再付 ¥${formatMoney(realPayMoney.value)}`
		}
		const current = sourceOption(selectedSource.value)
		const currentText = current && Number(current.benefitAmount || 0) > 0
			? `${current.label}，已省 ¥${formatMoney(current.benefitAmount)}`
			: '按原价支付'
		return `已不使用积分，当前${currentText}`
	})
	//不使用积分时，从年卡/通用折扣中取最低
	const bestCashSource = () => {
		let target = null
		priceOptions.value.forEach(t => {
			if (t.source == 4 || t.source == 5 || t.available === false) return
			if (target == null || Number(t.payAmount) < Number(sourceOption(target).payAmount)) {
				target = t.source
			}
		})
		return target
	}
	const togglePoints = async () => {
		if (selectedSource.value == 4) {
			pointsDismissed.value = true
			await choosePriceSource(bestCashSource() || 0)
		} else {
			await choosePriceSource(4)
		}
	}
	//把选中的优惠方案映射为支付方式与展示金额
	const applyPriceSelection = (source) => {
		selectedSource.value = source
		const option = sourceOption(source)
		const order = checkoutData.value.order || {}
		const base = checkoutData.value.baseAmount != null ? checkoutData.value.baseAmount : order.totalAmount
		productRealPrice.value = base
		if (source == 5) {
			payMothedValue.value = 'card'
			selectPayCard.value = 0
			realPayMoney.value = 0
			//微信行展示“若改用微信”的实际最低现金价，避免显示 0 元误导
			const cashSource = bestCashSource()
			productPrice.value = formatMoney(cashSource != null ? sourceOption(cashSource).payAmount : base)
			integration.value = 0
			useIntegrationState.value = false
			return
		}
		payMothedValue.value = 'weixin'
		selectPayCard.value = 0
		if (source == 0) {
			//主动不使用优惠（如不使用积分）：按原价支付
			pointsDismissed.value = true
			const pay = Number(base || 0)
			realPayMoney.value = pay.toFixed(2)
			productPrice.value = pay.toFixed(2)
			integration.value = 0
			useIntegrationState.value = false
			return
		}
		const pay = option ? Number(option.payAmount || 0) : Number(order.payAmount || 0)
		realPayMoney.value = pay.toFixed(2)
		productPrice.value = pay.toFixed(2)
		if (source == 4) {
			pointsDismissed.value = false
			useIntegrationState.value = true
			integration.value = option && option.pointsCost != null ? option.pointsCost : (alljifen.value || 0)
		} else {
			useIntegrationState.value = false
			integration.value = 0
		}
	}
	//切换优惠方案：写入后端并同步订单金额
	const choosePriceSource = async (source) => {
		const option = source === 0 ? null : sourceOption(source)
		if (source !== 0 && !option) {
			return
		}
		if (option && option.available === false) {
			uni.showToast({
				title: option.unavailableReason || '该优惠暂不可用',
				icon: 'none'
			})
			if (source == 5) {
				cardDisplayStatus.value = true
			}
			return
		}
		if (selectedSource.value == source && payMothedValue.value) {
			applyPriceSelection(source)
			return
		}
		const orderId = checkoutData.value.order && checkoutData.value.order.id
		if (!orderId) {
			applyPriceSelection(source)
			return
		}
		uni.showLoading({
			title: '处理中',
			mask: true,
		})
		try {
			const data = await orderApi.selectPrice(orderId, source)
			if (data) {
				if (data.order) {
					checkoutData.value = data
				}
				if (data.priceOptions) {
					priceOptions.value = data.priceOptions
				}
			}
			applyPriceSelection(source)
			if (source == 5) {
				cardDisplayStatus.value = false
			}
		} catch (e) {
			// fetch 已提示错误
		} finally {
			uni.hideLoading()
		}
	}

	const selectCard = (id) => {

		let singleProduct = productData.productList.filter(t => {
			return t.id == id
		});
		useIntegrationState.value=true
		if (singleProduct.length > 0) {
			selectCardObject.value = singleProduct[0]
			let cardcount = singleProduct[0].content[0].size
			if (cardcount >= checkoutData.value.costCouponCount) {
				selectPayCard.value = id
				payMothedValue.value = 'notpay'

				//重新获取积分
				cookie.updIntegration()
				let jifen = cookie.getIntegration() || 0
				alljifen.value = jifen

				let price = singleProduct[0].amount
				if (price >= alljifen.value) {
					realPayMoney.value = (price - alljifen.value).toFixed(2)
					integration.value = alljifen.value
				} else {
					realPayMoney.value = 0
					integration.value = Math.ceil(price)
				}
				productPrice.value = checkoutData.value.order.payAmount

			} else {
				uni.showToast({
					title: '您选的Fu翁卡不足以支付此订单，请选择更大的Fu翁卡',
					icon: 'none'
				})
			}
		}
	}
	const payMothed = (text) => {
		if (text == 'card') {
			//新比价：Full愈券对应优惠方案5，可用才可切换
			if (priceOptions.value.length) {
				const couponOption = sourceOption(5)
				if (!couponOption) {
					uni.showToast({
						title: '本单不支持Full愈券支付',
						icon: 'none'
					})
					return
				}
				if (couponOption.available === false) {
					cardDisplayStatus.value = true
					uni.showToast({
						title: couponOption.unavailableReason || '券已用完，可选择微信支付或购买卡券',
						icon: 'none'
					})
					return
				}
				choosePriceSource(5)
				return
			}
			if (checkoutData.value.canUseCouponCount >= checkoutData.value.costCouponCount) {
				payMothedValue.value = text
				selectPayCard.value = 0
				realPayMoney.value = 0
				useIntegrationState.value=false
			} else {
				uni.showToast({
					title: '券已用完，可选择微信支付或购买卡券',
					icon: 'none'
				})
			}
		} else {
			//新比价：微信支付保持当前现金方案；若当前是券，则切到最便宜的现金方案
			if (priceOptions.value.length) {
				let target = selectedSource.value
				if (target == null || target == 5) {
					target = null
					priceOptions.value.forEach(t => {
						if (t.source == 5 || t.available === false) {
							return
						}
						if (target == null || Number(t.payAmount) < Number(sourceOption(target).payAmount)) {
							target = t.source
						}
					})
				}
				cardDisplayStatus.value = false
				selectPayCard.value = 0
				if (target == null) {
					//没有任何优惠方案，按原价支付
					payMothedValue.value = text
					selectedSource.value = null
					productRealPrice.value = checkoutData.value.order.totalAmount
					productPrice.value = checkoutData.value.order.totalAmount
					realPayMoney.value = checkoutData.value.order.totalAmount
					useIntegrationState.value = false
					integration.value = 0
				} else if (target == selectedSource.value) {
					payMothedValue.value = text
					applyPriceSelection(target)
				} else {
					choosePriceSource(target)
				}
				return
			}
			realPayMoney.value = checkoutData.value.order.payAmount
			payMothedValue.value = text
			selectPayCard.value = 0

			//重新获取积分
			cookie.updIntegration()
			let jifen = cookie.getIntegration() || 0
			if(!useIntegrationStateReal.value){
				jifen=0
				useIntegrationState.value=false
			}else{
				useIntegrationState.value=true
			}
			
			alljifen.value = jifen

			//产品的最初价格
			productRealPrice.value = checkoutData.value.order.totalAmount
			//产品的优惠价格
			//let price = Math.ceil(checkoutData.value.order.payAmount)
			let price = checkoutData.value.order.payAmount
			if (checkoutData.value.order.discountType == 1) { //新客折扣走这个
				productPrice.value = price
				realPayMoney.value = price
			} else {
				if (price >= jifen) {
					productPrice.value = (price - jifen).toFixed(2)
					integration.value = jifen
				} else {
					productPrice.value = 0
					integration.value = Math.ceil(price)
				}
				if (payMothedValue.value == "card") {
					realPayMoney.value = 0
				} else {
					realPayMoney.value = productPrice.value
				}
			}
		}

	}


	// Emits
	const emit = defineEmits(['update:visible', 'confirm', 'cancel']);

	const countdown = ref(0);
	let timer = null;

	const formattedCountdown = computed(() => {
		const seconds = Math.max(0, Math.floor(Number(countdown.value) || 0));
		let hours = Math.floor(seconds / 3600);
		let min = Math.floor((seconds % 3600) / 60);
		let second = seconds % 60;

		hours = hours < 10 ? '0' + hours : hours;
		min = min < 10 ? '0' + min : min;
		second = second < 10 ? '0' + second : second;

		return '倒计时：' + hours + ':' + min + ':' + second;
	});

	const startCountdown = () => {
		if (props.countdown) {
			countdown.value = Math.max(0, Math.floor(Number(props.countdown) || 0));
		} else {
			countdown.value = constant.payCutDownSeconds;
		}
		if (timer) clearInterval(timer);
		timer = setInterval(() => {
			if (countdown.value > 0) {
				countdown.value--;
			} else {
				stopCountdown();
				handleCancel();
			}
		}, 1000);
	};

	const stopCountdown = () => {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	};

	watch(() => props.visible, (newVal) => {
		if (newVal) {
			startCountdown();
		} else {
			stopCountdown();
		}
	});

	onUnmounted(() => {
		stopCountdown();
	});


	// 选中的支付方式
	const selectedPayment = ref('fuyu');

	const checkoutData = ref({
		canUseCouponCount: 0,
		costCouponCount: 0,
		order: {},
	})

	// 处理取消
	const handleCancel = () => {
		emit('update:visible', false);
		emit('cancel');
	};

	// 处理确认
	const handleConfirm = async () => {
		console.log("------------------")
		let order = checkoutData.value.order
		if (!order || !order.id) {
			uni.showToast({
				duration: 3000,
				icon: 'none',
				title: '订单信息缺失, 请重新操作'
			})
			return
		}
		if (payMothedValue.value == 'card') {
			//卡券支付,检查券包数量是否可以支付此订单
			uni.showLoading({
				title: '处理中',
				mask: true,
			})
			await orderApi.payCheckout(order.id, 2);
			await orderApi.OrderSplit(order.id);
			uni.hideLoading()
			emit('confirm', order.id);
			emit('update:visible', false);

		}
		if (payMothedValue.value == 'weixin') {
			//微信支付
			uni.showLoading({
				title: '处理中',
				mask: true,
			})
			// 付费
			let cbFunc = {
				success: () => {
					/* uni.showToast({
						title: '支付成功！',
						icon: 'none',
						duration: 2000,
					}); */
					emit('confirm', order.id);
					emit('update:visible', false);
				},
				complete: () => {
					uni.hideLoading()
				},
				fail: () => {
					console.log("-----------失败-----------")
					emit('confirm', 'notpay');
					emit('update:visible', false);
				}
			}
			//await orderApi.payCheckout(order.id, 1)
			//积分是否完全能支付订单
			if (realPayMoney.value == 0) {
				await orderApi.jifenPayOrder(order.id)
				await orderApi.OrderSplit(order.id);
				uni.hideLoading()
				emit('confirm', order.id);
				emit('update:visible', false);
			} else {
				//积分抵扣一部分，剩余的微信支付
				await orderApi.jifenPayOrder(order.id)
				await payUtils.genPayInfo(order.id, cbFunc)
			}
		}

		if (payMothedValue.value == 'notpay') {
			console.log("------------------")
			//组合包支付
			//先生成组合包订单
			uni.showLoading({
				title: '处理中',
				mask: true,
			})
			let form = {
				totalAmount: realPayMoney.value,
				payType: 1,
				type: 1,
				quantity: 1,
				productId: selectCardObject.value.id,
				isGift: false,
				isUseIntegration: true,
				cardimage: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/defaultcard.png'
			}
			let orderIdCard = await orderApi.createOrder(form)
			if (realPayMoney.value == 0) {
				autoOrderFinsh()
			} else {
				//生成支付
				let cbFunc = {
					success: () => {
						//支付成功后为订单自动抵扣卡券

						/* uni.showToast({
							title: '支付成功！',
							icon: 'none',
							duration: 2000,
						}); */
						autoOrderFinsh()
					},
					complete: () => {
						//重新获取积分和券数
						cookie.updCouponCount()
						uni.hideLoading()
					},
					fail: () => {
						emit('confirm', 'notpay');
						emit('update:visible', false);
					}
				}
				await payUtils.genPayInfo(orderIdCard, cbFunc)
			}
		}
	};
	const autoOrderFinsh = async () => {
		await orderApi.payCheckout(payOrderId.value, 2)
		await orderApi.OrderSplit(payOrderId.value);
		emit('confirm', payOrderId.value);
		emit('update:visible', false);
	}
	const cardDisplayStatus = ref(false)
	const activityCode = ref(null)
	//券包
	const productData = reactive({
		productList: [],
		productTotal: 0
	})
	const productOne = ref([])
	const productTwo = ref([])
	const productThree = ref([])
	const productFour = ref([])
	const isCustomerNew = ref(false)
	const payOrderId = ref(0) //支付订单id
	//请求参数
	const params = reactive({
		page: 1,
		size: 20
	})
	//产品的优惠后的价格
	const productPrice = ref(0)
	//产品的最初价格
	const productRealPrice = ref(0)
	//这个会员有多少积分
	const alljifen = ref(0)
	const useIntegrationStateReal=ref(true)
	const useIntegrationState=ref(true)
	const newCustomerZheKou=ref(0)
	const fetchData = async (orderId) => {
		payOrderId.value = orderId
		//获取卡券列表（失败也不阻断结算，结算信息与购卡模块相互独立）
		let productList = []
		try {
			productList = await productApi.list({
				...params,
				type: 1,
				state: 1,
				order: 'sequence',
				activityCode: activityCode.value
			}) || []
		} catch (e) {
			productList = []
		}
		productData.productList = productList
		productOne.value = productList.filter(t => t.id == 3)
		productTwo.value = productList.filter(t => t.id == 12)
		productThree.value = productList.filter(t => t.id == 10)
		productFour.value = productList.filter(t => t.id == 11)

		try {
			uni.showLoading({
				title: '处理中',
				mask: true,
			})
			let data = await orderApi.getCheckoutData(orderId) || {
				canUseCouponCount: 0,
				costCouponCount: 0,
				useIntegrationState: 0,
				order: {},
			}
			checkoutData.value = data
			const order = data.order || {}

			if (Array.isArray(data.priceOptions)) {
				//新比价：后端已按最低价自动选定，客户端只做展示与积分取舍
				priceOptions.value = data.priceOptions
				const couponOpt = priceOptions.value.filter(t => t.source == 5)[0]
				let waitOrderId = null
				if (countdown.value > 0) {
					waitOrderId = vm.$Cache.get('waitOrderId')
					vm.$Cache.remove('waitOrderId')
				}
				const backendSelected = data.selectedPriceSource != null ? data.selectedPriceSource : null
				pointsDismissed.value = backendSelected === 0
				selectedSource.value = backendSelected
				if (waitOrderId && couponOpt && couponOpt.available !== false) {
					//刚从购券页返回，优先用券完成本单
					await choosePriceSource(5)
				} else {
					applyPriceSelection(selectedSource.value)
				}
				selectPayCard.value = 0
				cardDisplayStatus.value = !!(couponOpt && couponOpt.available === false)
				await cookie.updIntegration()
				alljifen.value = cookie.getIntegration() || 0
				if (selectedSource.value == 4) {
					const option = sourceOption(4)
					integration.value = option && option.pointsCost != null ? option.pointsCost :
						Math.min(alljifen.value, Math.ceil(Number(data.baseAmount || order.totalAmount || 0)))
				}
				isCustomerNew.value = order.discountType == 1
				try {
					newCustomerZheKou.value = order.shopId ? await orderApi.newCustomerZheKou(order.shopId) : 0
				} catch (e) {
					newCustomerZheKou.value = 0
				}
				return
			}

			//兼容旧接口（没有 priceOptions 字段）
			priceOptions.value = []
			selectedSource.value = null
			if (!data.canUseCouponCount || data.canUseCouponCount < data.costCouponCount) {
				vm.$Cache.remove('waitOrderId')
				payMothedValue.value = "weixin"
				selectPayCard.value = 0
				cardDisplayStatus.value = true
			} else if (countdown.value > 0) {
				const waitOrderId = vm.$Cache.get('waitOrderId')
				vm.$Cache.remove('waitOrderId')
				payMothedValue.value = "card"
				useIntegrationState.value = false
				selectPayCard.value = 0
				cardDisplayStatus.value = false //只要默认可以用卡支付，就不显示卡片模块
			}
			//重新获取积分
			await cookie.updIntegration()
			let jifen = cookie.getIntegration() || 0

			//判断订单是否使用积分支付，根据折扣和积分获取最低值0标识不使用积分，1标识使用积分
			if (data.useIntegrationState == 0) {
				useIntegrationState.value = false
				useIntegrationStateReal.value = false
				jifen = 0
			} else {
				useIntegrationStateReal.value = true
				useIntegrationState.value = true
			}

			alljifen.value = jifen
			if (jifen == 0) {
				isUseIntegration.value = false
			}
			//获取是不是新客户判断
			if (order.discountType == 1) {
				isCustomerNew.value = true
			}
			//产品的最初价格
			productRealPrice.value = order.totalAmount
			//产品的优惠价格
			let price = order.payAmount
			if (order.discountType == 1) { //新客折扣走这个
				productPrice.value = price
				realPayMoney.value = price
			} else {
				if (price >= jifen) {
					productPrice.value = (price - jifen).toFixed(2)
					integration.value = jifen
				} else {
					productPrice.value = 0
					integration.value = Math.ceil(price)
				}
				if (payMothedValue.value == "card") {
					realPayMoney.value = 0
				} else {
					realPayMoney.value = productPrice.value
				}
			}
			//获取新客折扣
			try {
				newCustomerZheKou.value = order.shopId ? await orderApi.newCustomerZheKou(order.shopId) : 0
			} catch (e) {
				newCustomerZheKou.value = 0
			}
		} finally {
			uni.hideLoading()
		}
	}
	defineExpose({
		fetchData
	});
</script>

<style lang="less" scoped>
	.paymothedbg {
		background-color: #EEECE8;
	}

	.auto-discount-tip {
		display: flex;
		flex-direction: column;
		padding: 18rpx 20rpx;
		margin: 12rpx 0 18rpx;
		border-radius: 14rpx;
		background-color: #F6F4F2;
		border: 2rpx solid #EADFCF;
	}

	.auto-discount-title {
		font-size: 24rpx;
		font-weight: 600;
		color: #584219;
		letter-spacing: 0.05em;
	}

	.auto-discount-sub {
		margin-top: 6rpx;
		font-size: 21rpx;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.points-notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18rpx 20rpx;
		margin-bottom: 16rpx;
		border-radius: 14rpx;
		background-color: #FFF7EC;
		border: 2rpx solid #F0D9BA;
	}

	.points-notice-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.points-notice-title {
		font-size: 24rpx;
		font-weight: 600;
		color: #584219;
		letter-spacing: 0.05em;
	}

	.points-notice-sub {
		margin-top: 6rpx;
		font-size: 20rpx;
		line-height: 1.5;
		color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.points-notice-action {
		flex-shrink: 0;
		margin-left: 16rpx;
		padding: 10rpx 18rpx;
		border-radius: 999rpx;
		border: 1rpx solid #C5B69D;
		font-size: 22rpx;
		color: #584219;
	}

	.price-option {
		padding: 18rpx 20rpx;
		border: 2rpx solid #EADFCF;
		border-radius: 14rpx;
		margin-bottom: 12rpx;
		background-color: #FFFDF9;
		transition: border-color 0.2s ease, background-color 0.2s ease;
	}

	.price-option-active {
		border-color: #584219;
		background-color: #F6F4F2;
	}

	.price-option-disabled {
		opacity: 0.55;
	}

	.lowest-tag {
		margin-left: 10rpx;
		padding: 2rpx 10rpx;
		border-radius: 8rpx;
		font-size: 18rpx;
		line-height: 26rpx;
		color: #FFFFFF;
		background-color: #8A6A40;
		letter-spacing: 0.05em;
	}

	.scroll-view {
		white-space: nowrap;
		/* 确保子元素不换行 */
	}

	.scroll-view-item {
		display: inline-block;
		/* 让子元素并排显示 */
		width: 60%;
		/* 根据需要设置宽度 */
		margin-right: 10px;
		/* 设置间距 */
	}

	.luxin {
		border-radius: 18rpx;
		background: linear-gradient(305deg, rgba(115, 126, 144, 0.16) -14.09%, rgba(208, 214, 227, 0.16) 58.6%), #FFF;
		//background:linear-gradient(98deg, #FCF9F6 9.12%, #FFF 26.67%, #F6EFE9 48.71%, #FFF 65.81%, #F6EFE9 77.96%, #FCF9F6 88.3%, #FFF 100%)
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		z-index: 5000;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	.payment-modal {
		width: 100%;
		max-height: 80vh;
		background-color: white;
		border-radius: 32rpx 32rpx 0 0;
		padding: 0;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			transform: translateY(100%);
		}

		to {
			transform: translateY(0);
		}
	}

	.modal-header {
		padding: 30rpx 45rpx;
		display: flex;
		justify-content: space-between;
		align-items: center;

		.modal-title {
			font-size: 30rpx;
			font-weight: 500;
		}

		.close-icon {
			width: 40rpx;
			height: 40rpx;
			background: url('~@/static/icons/x.png') no-repeat 0 0;
			background-size: cover;
		}
	}

	.modal-content {
		padding: 0rpx 48rpx;
	}



	.modal-footer {
		display: flex;
		padding: 32rpx 48rpx;
		gap: 24rpx;

		.btn-modify,
		.btn-cancel {
			flex: 1;
			padding-top: 24upx;
			padding-bottom: 24upx;
			font-size: 32rpx;
			font-weight: 500;
		}

		.btn-modify {
			position: relative;
			overflow: visible;
		}
	}

	.countdown-timer {
		position: absolute;
		top: -20rpx;
		right: -20rpx;
		background-color: #fde2e2;
		color: #f56c6c;
		padding: 4rpx 12rpx;
		border-radius: 20rpx;
		font-size: 20rpx;
		line-height: 1.2;
		white-space: nowrap;
	}

	/* 购卡样式 */
	&.active1 {
		position: relative;

		&::after {
			content: '';
			width: 70rpx;
			height: 60rpx;
			background: url('~@/static/icons/bgColor1.png') no-repeat center;
			background-size: 70rpx 60rpx, cover;
			// border-top-left-radius: 4rpx;
			// border-bottom-right-radius: 8upx;
			position: absolute;
			top: 0;
			left: 0;
			color: #fff;
		}

		text {
			color: #8A6A40;
		}
	}

	.bgColor1 {
		color: #8A6A40;
		border-radius: 8px;
		border: 3rpx solid #D0D6E3;
		//background: linear-gradient(98deg, #FCF9F6 9.12%, #FFF 26.67%, #F6EFE9 48.71%, #FFF 65.81%, #F6EFE9 77.96%, #FCF9F6 88.3%, #FFF 100%);
		background: linear-gradient(110deg, rgba(176, 183, 198, 0.16) 26.94%, rgba(115, 126, 144, 0.16) 38.35%, rgba(208, 214, 227, 0.16) 53.77%, rgba(115, 126, 144, 0.16) 70.88%), #FFF;
	}

	.bgcolordown1 {
		color: #FFFFFF;
		background: linear-gradient(305deg, #737E90 -14.09%, #D0D6E3 58.6%), #FFF;
	}

	&.active2 {
		position: relative;

		&::after {
			content: '';
			width: 70rpx;
			height: 60rpx;
			background: url('~@/static/icons/bgColor2.png') no-repeat center;
			background-size: 70rpx 60rpx, cover;
			// border-top-left-radius: 4rpx;
			// border-bottom-right-radius: 8upx;
			position: absolute;
			top: 0;
			left: 0;
			color: #fff;
		}

		text {
			color: #8A6A40;
		}
	}

	.bgColor2 {
		color: #8A6A40;
		border-radius: 8px;
		border: 3rpx solid #BEA467;
		background: linear-gradient(290deg, rgba(161, 131, 65, 0.16) 28.32%, rgba(247, 228, 181, 0.16) 41.77%, rgba(194, 168, 110, 0.16) 51.41%, rgba(238, 219, 166, 0.16) 58.04%, rgba(161, 131, 65, 0.16) 68.68%), #FFF;
	}

	.bgcolordown2 {
		color: #FFFFFF;
		background: linear-gradient(308deg, #A18341 44.66%, #EEDBA6 105.62%), #FFF;
	}

	&.active3 {
		position: relative;

		&::after {
			content: '';
			width: 70rpx;
			height: 60rpx;
			background: url('~@/static/icons/bgColor3.png') no-repeat center;
			background-size: 70rpx 60rpx, cover;
			// border-top-left-radius: 4rpx;
			// border-bottom-right-radius: 8upx;
			position: absolute;
			top: 0;
			left: 0;
			color: #fff;
		}

		text {
			color: #8A6A40;
		}
	}

	.bgColor3 {
		color: #8A6A40;
		border-radius: 8px;
		border: 3rpx solid #CDB4D1;
		background: linear-gradient(0deg, rgba(208, 188, 255, 0.16) 0%, rgba(208, 188, 255, 0.16) 100%), #FFF;
	}

	.bgcolordown3 {
		color: #FFFFFF;
		background: var(--ffffff-2-paints, linear-gradient(308deg, #96839C 44.66%, #DDC3E0 105.62%), #FFF);
	}

	&.active4 {
		position: relative;

		&::after {
			content: '';
			width: 70rpx;
			height: 60rpx;
			background: url('~@/static/icons/bgcolor4.png') no-repeat center;
			background-size: 70rpx 60rpx, cover;
			// border-top-left-radius: 4rpx;
			// border-bottom-right-radius: 8upx;
			position: absolute;
			top: 0;
			left: 0;
			color: #fff;
		}

		text {
			color: #8A6A40;
		}
	}

	.bgColor4 {
		color: #8A6A40;
		border-radius: 8px;
		border: 3rpx solid #82494A;
		background: linear-gradient(278deg, rgba(88, 25, 26, 0.20) 4.44%, rgba(235, 180, 181, 0.20) 100%), #FFF;
	}

	.bgcolordown4 {
		color: #FFFFFF;
		background: linear-gradient(278deg, #82494A -0.72%, #EBB4B5 100%), #FFF;
	}
</style>