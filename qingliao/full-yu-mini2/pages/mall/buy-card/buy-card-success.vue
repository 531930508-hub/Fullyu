<template>
	<view class="min-h-screen  bg-[#F6F4F2] text-[#584219]">
		<TopTitle></TopTitle>
		<view :style="{position: '-webkit-sticky',position:'sticky',top:customBar+'rpx','z-index':'99',minHeight:'1300rpx'}">
			<view v-if="topiconStr" class="w-full flex justify-center pt-4" :style="{marginTop:(customBar-10)+'rpx'}">
				<image src="/static/icons/paysuccess.png" mode="widthFix" class="w-[70rpx] h-[70rpx]"></image>
			</view>
			<view v-if="topiconStr" class="text-center text-[34rpx] pt-4">购买成功</view>
			<view class="px-5">
				<view class="w-full pt-6">
					<image mode="widthFix" style="width: 100%;" 
					:src="cardSelectUrl||'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniImage/20260130/dd9fa990-b96a-410a-be54-1c0f6b92b936(._.)券种 (7).png'">
											</image>
				</view>
				<view class="flex items-center mt-2 pb-4" style="border-bottom: 1px solid #E6E2DC;">
					<view class="w-2/3">{{cardtitleStr}}</view>
					<view class="w-1/3 flex justify-end ">
						<button @click="openPopup" class="  right-0 text-[26rpx] text-[#584219]"
							style="border: 1px solid #584219;margin: 0;">修改卡面</button>
					</view>
				</view>
				<view class="py-4 text-[#584219] text-[26rpx]">
					<text class="font-medium"> 如需送给朋友，留下您的赠言</text>
				</view>
				<view class="bg-white rounded-md ">
					<textarea :focus="textareaFocus" v-model="inputTitleVal" type="text" placeholder="请输入祝福语"
					  @input="handleInputTitleVal"	class="rounded-md px-2 py-3 w-full" style="height: 240rpx;font-size: 26rpx; ">
					   </textarea>
					<view class="flex justify-end items-center pb-3">
						<image mode="widthFix" class="w-[32rpx] h-[32rpx]" src="/static/icons/update.png"></image>
						<text class="text-[26rpx] text-[#BFBFBF]"
							@click="getEditFocus">&nbsp;点击编辑祝福语&nbsp;&nbsp;&nbsp;</text>
					</view>
				</view>
			</view>
			<view class="shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-[env(safe-area-inset-bottom)] px-5"
				style="height: 150rpx;position: fixed; bottom: 0;left: 0;width: 100%;background-color: #FFFFFF;">

				<view class="flex justify-center items-center pt-3" style="gap: 30rpx;">
					<view class="w-[50%]" >
						<button open-type="share" class=" h-[80rpx] flex justify-center items-center "
							style="border: 1px solid #584219;">送朋友</button>
					</view>
					<view class="w-[50%]">
						<button @click="go_page()"
							class=" h-[80rpx] flex justify-center items-center bg-[#584219] text-white">去预约使用</button>
					</view>
				</view>
			</view>
		</view>
	</view>

	<uni-popup ref="listCard" type="bottom">
		<view style="width:100%;background: #fff;border-radius: 20rpx" class="pt-3 px-5">
			<view class="pb-3" style="border-bottom: 1px solid #EEEEEE;">选择卡面</view>
			<view class="flex justify-center items-center h-[120rpx] text-[#353535] font-medium pt-1">左右滑动选择卡券图案</view>

			<view class="card-swiper-container">
				<swiper class="card-swiper" :current="currentIndex" :indicator-dots="false" :autoplay="false"
					:interval="3000" :duration="300" :circular="false" :previous-margin="swiperMargin + 'px'"
					:next-margin="swiperMargin + 'px'" @change="onSwiperChange" @animationfinish="onAnimationFinish">
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
	import TopTitle from '../../../components/TopTitle.vue';
	import uniPopup from "../../../uni_modules/uni-popup/components/uni-popup/uni-popup.vue";
	import orderApi from "../../../api/order";
	import miniImageApi from "../../../api/miniImage"

	const emit = defineEmits(['change']);
	const listCard = ref(null)
	const textareaFocus = ref(false) //手动获取焦点
	const cardSelectUrl = ref('')

	// 输入标题
	const inputTitleVal = ref('特别的感谢，给特别的你')
	// 分享码
	const shareCode = ref('')

	const currentIndex = ref(0)
	const swiperMargin = ref(40)
	const customBar = ref(0)
	const statusBar = ref(0)
	const displayList = ref([])
	const cardtitleStr = ref('')
	const orderidStr = ref(0)
	const topiconStr=ref(true)
	onLoad((options) => {
		console.log(options)
		const {
			orderid,
			cardtitle,
			topicon
		} = options
		
		cardtitleStr.value = cardtitle
		orderidStr.value = orderid
		topiconStr.value=topicon=="true"
console.log("topiconStr.value")
console.log(topiconStr.value)
		uni.getSystemInfo({
			success: (e) => {
				// #ifdef MP-WEIXIN
				const custom = wx.getMenuButtonBoundingClientRect() // 获取小程序胶囊按钮位置信息
				customBar.value = (custom.bottom + custom.top - e.statusBarHeight)*2
				statusBar.value = e.statusBarHeight + 10
				// #endif
			}
		})
		initSwiper()
		getCardCoverList()
		getOrderInfo(orderid)
	});
	//分享按钮事件
	const handleInputTitleVal = (e) => {
		inputTitleVal.value=e.detail.value
	}
	onShareAppMessage(async (res) => {
		let data=await orderApi.shareFriend(orderidStr.value,inputTitleVal.value)
		 console.log(data)
		return {
			title: inputTitleVal.value, // 卡片标题
			path: '/pages/mall/gift?id=' + data.giveId+'&shareCode='+encodeURIComponent(data.code), // 携带参数
			imageUrl: cardSelectUrl.value // 阿里云自动缩放比例，必须是阿里云图片服务器'?x-oss-process=image/resize,m_pad,w_500,h_400,color_FFFFFF'
		}
	})
	const getOrderInfo = async (orderid) => {
		const order = await orderApi.infoWithGift(orderid)
		cardSelectUrl.value = order.cardimage
		console.log(order)
	}
	//获取卡封面列表
	const getCardCoverList = async () => {
		displayList.value = await miniImageApi.couponImageList()
	}
	const onSwiperChange = (e) => {
		currentIndex.value = e.detail.current;
	}
	const onCoverSel = async () => {
		let card = displayList.value[currentIndex.value]
		cardSelectUrl.value = card.url
		listCard.value.close()

		await orderApi.updateCardImage(orderidStr.value, cardSelectUrl.value)

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
	const getEditFocus = () => {
		textareaFocus.value = true
	}
	const go_page = () => {
		uni.navigateTo({
			url: '/pages/index/select-project'
		})
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