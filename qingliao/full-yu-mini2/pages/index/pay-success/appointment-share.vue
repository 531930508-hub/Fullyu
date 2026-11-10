<template>
	<view class="min-h-screen  bg-[#F6F4F2] ">
		<!-- :style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99'}" -->
		<view class="pb-8">
			<!-- <view class="bg-white h-[120rpx] font-semibold flex items-center pl-5 text-[#584219]">
				<text>预约成功，Full愈期待您的光临</text>
			</view> -->

			<view id="luxintest" v-for="(item,index) in orderDetail" :key="index" class="px-5 pt-5">
				<view class="bg-white rounded-lg p-2 ">
					<view class="h-full">
						<image class="rounded-lg " style="width: 100%;" :src="shop.coverImageUrls" mode="widthFix">
						</image>
					</view>
					<view class="text-[#584219] text-[32rpx] pl-1  pt-4 pb-4">
						您的好友「{{nickname}}」邀请您一起享受Full愈时刻</view>
					<view class="px-2 pt-4 pb-4 text-[#584219] font-semibold"
						style="border-bottom:1rpx dashed lightgray;border-top:1rpx dashed lightgray;">
						<view class="text-center pb-1">{{orderData.productTitle}} {{item.duration}}mins</view>
						<view class="text-center pb-1">{{orderData.cardimage}}</view>
						<view class="text-center"> {{shop.name}}</view>
					</view>

					<view class="px-2 pt-4 pb-4 text-[#584219]">
						<view class="pb-1 flex items-center justify-center">
							<text> {{shop.address}}&nbsp;</text>
							<image @click="copyShoreAddress" src="/static/icons/copy-regular.png"
								class="w-[30rpx] h-[30rpx]" mode="widthFix">
							</image>
						</view>
						<view class="pb-1 flex items-center justify-center">
							<text @click="callMobile(shop.mobile)">{{shop.mobile}}&nbsp;</text>
							<image @click="callMobile(shop.mobile)" src="/static/icons/mobile.png"
								class="w-[30rpx] h-[30rpx]" mode="widthFix">
							</image>
						</view>
						<!-- <view class="text-center"></view> -->
					</view>
					<view class="flex justify-center items-center">
						<image style="width: 200px;height: 200px;" show-menu-by-longpress="{{true}}"
							src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/codemini.jpg"></image>
					</view>
					<view class="flex items-center justify-center h-[50rpx]" style="color:#584219;">
						(长按识别二维码)
					</view>
				</view>
				<view style="display: none;" class="pt-7 gap-3 flex items-center">
					<!-- <button class="w-1/2 h-[80rpx] flex justify-center items-center text-[28rpx]" @click="draw"
						style="border: 1px solid #584219;">保存为图片</button> -->
					<button @click="receiveOrder"
						class="w-2/3 h-[80rpx] flex justify-center items-center bg-[#584219] text-white text-[28rpx]">一建领取</button>
				</view>

			</view>
		</view>
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
		computed,
		nextTick,
		onBeforeUnmount,
		onMounted,
		getCurrentInstance
	} from 'vue'
	import TopTitle from '../../../components/TopTitle.vue';
	import api from '../../../api/order.js'
	import shopApi from "../../../api/shop"
	const instance = getCurrentInstance()

	onMounted(() => {

	})


	const customBar = ref(0)
	const statusBar = ref(0)
	const orderData = ref([])
	const orderDetail = ref([])
	const shop = ref([{
		coverImageUrls: '',
		address: '',
		mobile: '',
		name: ''
	}])
	const nickname = ref('')
	const orderDetailId = ref(0)
	onLoad((options) => {
		console.log(options)
		uni.getSystemInfo({
			success: (e) => {
				// #ifdef MP-WEIXIN
				const custom = wx.getMenuButtonBoundingClientRect() // 获取小程序胶囊按钮位置信息
				customBar.value = custom.bottom + custom.top - e.statusBarHeight
				statusBar.value = e.statusBarHeight + 10
				// #endif
			}
		})
		console.log(options)
		nickname.value = options.custName
		getOrderDetail(options.orderId)
	})

	const getOrderDetail = async (orderId) => {
		let data = await api.infoWithDetail(orderId)
		orderData.value = data
		orderDetail.value = data.orderDetailList;
		console.log(data)
		shop.value = await shopApi.getSingleByShopId(data.shopId)
		if(data.state==3||data.state==4||data.state==5||data.state==6){
			uni.showToast({
				title: '订单已取消！',
				icon: 'error'
			})
		}
	}
	const callMobile = (mobile) => {
			uni.makePhoneCall({
				phoneNumber: mobile, // 电话号码
				success: function() {
					console.log('拨打电话成功！');
				},
				fail: function(err) {
					console.error('拨打电话失败：', err);
				}
			});
		}
	// 复制地址
	const copyShoreAddress = () => {
		console.log(shop)
		uni.setClipboardData({
			data: shop.value.address,
			success: () => {
				uni.showToast({
					title: '地址已复制',
					icon: 'success'
				})
			},
		})
	}

	const onLongPress = () => {
		uni.navigateToMiniProgram({
			appId: 'wxeb4e8a99b7eeebf8',
			path: '/pages/index/index',
			extraData: {
				foo: 'bar'
			},
			success(res) {
				// 打开成功的回调
				console.log('打开成功');
			}
		})
	}

	const receiveOrder = async () => {
		uni.showModal({
			title: '提示',
			content: '确定要领取吗？',
			confirmText: "确定",
			cancelText: "取消",
			success: async (res) => {
				if (res.confirm) {
					await api.receiveOrder(orderDetailId.value, shareCode.value)
				}
			}
		});
	}
</script>

<style>

</style>