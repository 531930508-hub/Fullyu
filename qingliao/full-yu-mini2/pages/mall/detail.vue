<template>
	<view class="min-h-screen  bg-[#F6F4F2] text-[#584219]">
		<TopTitle></TopTitle>
		<view :style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99'}">

			<view v-if="productOne.length>0" class="px-5 text-[26rpx]"
				:style="{minHeight:'1300rpx',marginTop:customBar+'px'}">
				<view class="pt-4 pb-3 font-medium text-[30rpx]" style="border-bottom: 1px solid #E6E2DC;">
					<view class="text-[#584219] font-bold">购买{{productTitle}} </view>
				</view>
				<view class="flex justify-content items-center w-full pt-4 pb-3">
					<image mode="widthFix" style="width: 100%;" :src="cardSelectUrl">
					</image>
				</view>
				<view class="flex justify-content items-center">
					<view class="w-1/3 text-[30rpx] font-bold " style="font-family: SourceHanSerifSC;">
						{{productTitle}}
					</view>
					<view class="w-2/3 flex justify-end items-center">
						<text class="text-[26rpx]">原价{{productOne[0].originalAmount}}元&nbsp;</text>
						<text class=" text-[30rpx] font-semibold">{{productOne[0].amount}}元</text>
					</view>
				</view>
				<view class="flex items-center mt-2 pb-4" style="border-bottom: 1px solid #E6E2DC;">
					<view class="w-2/3">该卡可以定制卡面</view>
					<view class="w-1/3 flex justify-end ">
						<button @click="openPopup" class="w-2/3  right-0 text-[26rpx] text-[#584219]"
							style="border: 1px solid #584219;margin: 0;">去定制</button>
					</view>
				</view>
				<view v-if="couponList.length>1&&couponList[1].comment!=''" class="text-[26rpx] text-[#584219] pt-3 font-semibold">
					购卡优惠：{{couponList[1].comment}}</view>
				<view class="text-[26rpx] text-[#584219] pt-3 font-semibold">购买该卡后可以送给朋友</view>
				<view class="text-[#8A6A40]">
					<!-- <view class="text-[26rpx]  py-2">文字介绍</view> -->
					<view v-for="item in productOne[0].explainArray" :key="index" class="pl-2 ">
						<text class="mr-1" style="font-weight: bolder;font-size: 30rpx;">·</text>
						<text>{{item}}</text>
					</view>

					<view class="pt-2">
						<text>{{productOne[0].comment}}</text>
					</view>
				</view>
			</view>
			<view v-if="productOne.length>0"
				class="shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-[env(safe-area-inset-bottom)] px-5"
				style="height: 280rpx;position: fixed; bottom: 0;left: 0;width: 100%;background-color: #FFFFFF;">
				<view class="flex items-center  pt-4 pb-2 text-[24rpx] text-[#584219] ">
					<view class=" w-1/2 text-[30rpx] font-bold">{{productTitle||''}} </view>
					<view class="w-1/2 flex justify-end" v-if="false">
						<view class="w-1/5 flex flex justify-center">
							<image src="/static/icons/minus-circle-contained.png" mode="widthFix"
								class="w-[40rpx] h-[40rpx]" @click="minusCountEvent"></image>
						</view>
						<view class="w-1/5">
							<text class="border rounded-md  flex justify-center">1</text>
						</view>
						<view class="w-1/5 flex flex justify-center">
							<image src="/static/icons/add-square-04.png" mode="widthFix" class="w-[40rpx] h-[40rpx]"
								@click="addCountEvent"></image>
						</view>
					</view>
				</view>
				<view class="flex  items-center pb-3">
					<radio :checked="selectChecked" @click="agreeEvent"
						style="transform: scale(0.6);margin-left: -15rpx;"></radio>
					<text class="text-[#584219] text-[26rpx]" @click="agreeEvent">阅读并同意</text><text
						@click="open_images">《Full愈单用途商业预付卡规则》</text>
				</view>
				<view class="flex justify-center items-center" style="gap: 30rpx;">
					<view class="w-1/2  text-[#584219] font-bold">
						<view>
							<text class="text-[26rpx] ">还需支付：</text>
							<text class="text-[32rpx] ">{{productPrice}}元</text>
						</view>
						<view>
							<text class="text-[26rpx] font-[26rpx]">可用（{{integration||0}}积分抵扣￥{{integration||0}}）</text>
						</view>
					</view>
					<button class="btn btn-modify" style="font-size: 26rpx;" @click="handleConfirm"
						:disabled="isButtonDisabled">
						{{btnName}}
					</button>
				</view>
			</view>
		</view>
		<uni-popup ref="listCard" type="bottom">
			<view style="width:100%;background: #fff;border-radius: 20rpx" class="pt-3 px-5">
				<view class="pb-3" style="border-bottom: 1px solid #EEEEEE;">选择卡面</view>
				<view class="flex justify-center items-center h-[120rpx] text-[#353535] font-medium pt-1">左右滑动选择卡券图案
				</view>

				<view class="card-swiper-container">
					<swiper class="card-swiper" :current="currentIndex" :indicator-dots="false" :autoplay="false"
						:interval="3000" :duration="300" :circular="false" :previous-margin="swiperMargin + 'px'"
						:next-margin="swiperMargin + 'px'" @change="onSwiperChange" 
						@animationfinish="onAnimationFinish">
						<swiper-item v-for="(item, index) in displayList" :key="index" class="swiper-item">
							<view class="swiper-item-content" :class="{ 'active': isActiveCard(index) }">
								<image :src="item.url" mode="scaleToFill" class="card-image"></image>
								<view class="card-text">{{ item.text }}</view>
								<view v-if="isActiveCard(index)" class="active-check-icon"></view>
							</view>
						</swiper-item>
					</swiper>
				</view>
				<view class="btn-con  gap-3 pb-8">
					<button @click="onCoverCancel" class="w-1/2 h-[80rpx] flex justify-center items-center "
						style="border: 1px solid #584219;">取消</button>
					<button @click="onCoverSel"
						class="w-1/2 h-[80rpx] flex justify-center items-center bg-[#584219] text-white">确定</button>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script setup>
	import {
		onLoad,
		onShareAppMessage,
		onShareTimeline,
		onShow,
		onPageScroll
	} from "@dcloudio/uni-app"
	import {
		ref,
		reactive,
		computed,
		nextTick,
		onBeforeUnmount,
		onMounted,
		getCurrentInstance
	} from 'vue'
	import TopTitle from '../../components/TopTitle.vue';
	import uniPopup from "../../uni_modules/uni-popup/components/uni-popup/uni-popup.vue";
	import miniImageApi from "../../api/miniImage"
	import productApi from "../../api/product"
	import cookie, { getProjectList } from "../../utils/cookieUtil"
	import payUtils from "../../utils/payUtils";
	import orderApi from "../../api/order";

	// 数量
	const quantity = ref(1);
	//是否使用积分
	const isUseIntegration = ref(true);
	// 购券用途
	const selectedPurpose = ref('self');

	const emit = defineEmits(['change']);
	const listCard = ref(null)
	const currentIndex = ref(0)
	const swiperMargin = ref(40)
	const customBar = ref(0)
	const statusBar = ref(0)
	const isButtonDisabled = ref(false) //按钮状态
	const btnName = ref('确认支付')
	//请求参数
	const params = reactive({
		page: 1,
		size: 20
	})
	const displayList = ref([])
	const paramsId = ref(0)
	const cardSelectUrl = ref('')
	const productOne = ref([])
	const couponList = ref([])
	const productPrice = ref(0)
	const integration = ref(0)
	const selectChecked = ref(false)
	const productTitle = ref('')
	const orderIdStr = ref(0)

	//点击同意规则
	const agreeEvent = (e) => {
		selectChecked.value = true
	}
	onShow( () => {
		console.log("++++++++++++++++++++++++")
		console.log("------------------")
		cookie.updIntegration()
		/* paramsId.value=2
		this.getProductInfo()
		console.log(paramsId.value)
		console.log(couponList.value) */
		getProductInfo(paramsId.value)
	})
	onLoad((options) => {
		uni.getSystemInfo({
			success: (e) => {
				// #ifdef MP-WEIXIN
				const custom = wx.getMenuButtonBoundingClientRect() // 获取小程序胶囊按钮位置信息
				customBar.value = custom.bottom + custom.top - e.statusBarHeight
				statusBar.value = e.statusBarHeight + 10
				// #endif
			}
		})
		initSwiper()
		const {
			productid
		} = options
		paramsId.value = productid
		getCardCoverList()
		getProductInfo(paramsId.value)
	});
	//确认支付
	const handleConfirm = async () => {
		isButtonDisabled.value = false
		//先校验登录
		if (!cookie.getToken()) {
			uni.showToast({
				title: '暂未登录',
				icon: 'none'
			});
			setTimeout(() => {
				uni.navigateTo({
					url: '/pages/login/login',
				})
			}, 500)
			return
		}
		if (selectChecked.value) {
			console.log(paramsId.value)
			console.log(productPrice.value)
			console.log(cardSelectUrl.value)
			uni.showLoading({
				title: '处理中',
				mask: true,
			})
			let form = {
				totalAmount: productPrice.value,
				payType: 1,
				type: 1,
				quantity: 1,
				productId: paramsId.value,
				isGift: false,
				isUseIntegration: isUseIntegration.value,
				cardimage: cardSelectUrl.value
			}
			let orderId = await orderApi.createOrder(form)
			orderIdStr.value = orderId
			const order = await orderApi.infoWithGift(orderId)

			//支付状态为1,支付金额为0,判断为积分支付
			if (order.state == 1 && order.payAmount == 0) {
				uni.hideLoading();
				uni.showToast({
					title: '积分支付成功',
					icon: 'none',
					duration: 3000,
				})
				cookie.updIntegration()
				cookie.updCouponCount()
				isButtonDisabled.value = true
				btnName.value = '已支付'
				go_page_detail()
			} else {
				let cbFunc = {
					success: () => {
						uni.hideLoading();
						uni.showToast({
							title: '支付成功',
							icon: 'none',
							duration: 3000,
						})
						go_page_detail()
					},
					complete: () => {
						//重新获取积分和券数
						cookie.updIntegration()
						cookie.updCouponCount()
					},
				}
				await payUtils.genPayInfo(orderId, cbFunc)

			}

		} else {
			uni.showModal({
				title: '提示',
				content: '已阅读并同意《Full愈单用途商业预付卡规则》',
				confirmText: "确定",
				cancelText: "取消",
				success: (res) => {
					if (res.confirm) {
						selectChecked.value = true
					}
				}
			});
		}
	}
	const go_page_detail = () => {
		uni.navigateTo({
			url: '/pages/mall/buy-card/buy-card-success?topicon=true&orderid=' + orderIdStr.value +
				'&cardtitle=' +
				productTitle.value
		})
	}
	//获取卡信息
	const getProductInfo = async (productId) => {
		console.log("onshow+++++++++")
		const productList = await productApi.list({
			...params,
			type: 1,
			state: 1,
			order: 'sequence'
		})
		productOne.value = productList.filter(t => {
			return t.id == productId
		});
		couponList.value = productOne.value[0].couponList
		productPrice.value = productOne.value[0].amount
		productTitle.value = productOne.value[0].title
		let jifen = cookie.getIntegration()
		if (jifen == 0) { 
			isUseIntegration.value = false
			return
		}
		let price = productPrice.value
		if (price >= jifen) {
			productPrice.value = (price - jifen).toFixed(2)
			integration.value = jifen
		} else {
			productPrice.value = 0
			integration.value = Math.ceil(price)
		}
	}
	//获取卡封面列表
	const getCardCoverList = async () => {
		displayList.value = await miniImageApi.couponImageList()
		cardSelectUrl.value = displayList.value[0].url
	}
	const onSwiperChange = (e) => {
		currentIndex.value = e.detail.current;
	}
	const onCoverSel = () => {
		let card = displayList.value[currentIndex.value]
		cardSelectUrl.value = card.url
		listCard.value.close()
	}
	const openPopup = () => {
		listCard.value.open('bottom')
	}
	const onCoverCancel = () => {
		listCard.value.close()
	}

	const initSwiper = () => {
		// 计算两侧缩略图的宽度，并转换为 px
		// 假设主图宽度为 240px，两侧缩略图宽度为 200px
		// swiperMargin = (屏幕宽度 - (主图宽度+ 边距)) / 2
		// 为了实现两侧缩略图效果，需要将 swiperMargin 设置为缩略图宽度的一半
		const screenWidth = uni.getSystemInfoSync().windowWidth;
		// 假设中间卡片宽度为 240px，两侧卡片宽度为 200px
		// 240 + 200 + 200 = 640
		// 屏幕宽度 - 640 / 2 = swiperMargin
		// 实际计算应根据设计稿来，这里为了演示效果，直接给一个固定值
		swiperMargin.value = (screenWidth - 275) / 2; // 240 是中间卡片的宽度
		// console.log(this.swiperMargin);

		currentIndex.value = 0;
	}
	const onAnimationFinish = (e) => {
		// 不再需要处理循环逻辑
	}

	const isActiveCard = (index) => {
		// 如果只有一个卡片，它始终是激活的
		if (displayList.length <= 1) return true;

		// 当前显示的卡片索引
		return index === currentIndex.value;
	}

	const go_page = (path) => {
		uni.navigateTo({
			url: path
		})
	}
	const open_images = () => {
		uni.showLoading({
			title: '加载中',
			mask: true,
		})
		uni.downloadFile({
			url: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniFile/Fullrule.pdf',
			success: function(res) {
				uni.hideLoading()
				var filePath = res.tempFilePath;
				uni.openDocument({
					filePath: filePath,
					showMenu: true,
					success: function(res) {
						console.log('打开文档成功');
					}
				});
			}
		});
	}
</script>
<style lang="less" scoped>
	.btn-modify,
	.btn-cancel {
		flex: 1;
		padding-top: 24upx;
		padding-bottom: 24upx;
		font-size: 32rpx;
		font-weight: 500;
		position: relative;
		overflow: visible;
	}

	.btn-con {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		margin-top: 64rpx;
		text-align: center;

		view+view {
			border-left: 1px solid #0000001a;
		}

		view {
			font-size: 30rpx;
			font-weight: 600;
			background-color: transparent !important;
			border: 0;
			color: #333;
			padding-top: 30rpx;
			padding-bottom: 30rpx;
		}
	}

	.card-swiper-container {
		width: 100%;
		height: 300rpx;
		/* 根据实际卡片高度调整 */
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.card-swiper {
		width: 100%;
		
	}

	.swiper-item {
		display: flex;
		justify-content: center;
		align-items: center;
		padding-left: 10rpx;
	}

	.swiper-item-content {
		width: 408upx;
		height: 200upx;
		border-radius: 16rpx;
		overflow: hidden;
		transition: all 0.3s ease-in-out;
		box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.1);
		position: relative;
		background-color: #fff;

		&.active {
			width: 488upx;
			height: 245upx;
			/* border: 2upx solid #584219; */
		}
	}

	.active-check-icon {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		border-top: 40rpx solid #584219;
		/* 绿色背景 */
		border-right: 40rpx solid transparent;
		border-bottom: 40rpx solid transparent;
		border-left: 40rpx solid #584219;
		/* 绿色背景 */
		border-top-left-radius: 10rpx;
		/* 与卡片圆角保持一致 */

		&::after {
			content: '';
			width: 36upx;
			height: 36upx;
			background: url('~@/static/icons/check-solid.svg') no-repeat;
			position: absolute;
			top: -26rpx;
			left: -26rpx;
			color: #fff;
		}
	}

	.card-image {
		width: 100%;
		height: 100%;
		border-radius: 16upx;
	}
</style>