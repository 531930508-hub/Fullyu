<template>
	<view class="min-h-screen  bg-[#F6F4F2] ">
		<TopTitle></TopTitle>
		<view
			:style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99',marginTop:customBar+'px'}">
			<view v-if="topdisplayStatus=='true'"
				class="bg-white h-[120rpx] font-semibold flex items-center pl-5 text-[#584219]">
				<text>预约成功，Full愈期待您的光临</text>
			</view>
			<view v-if="orderData.length>1" v-for="(item,index) in orderData" :key="index" class="px-5 pt-5">
				<view class="p-3 bg-white rounded-xl text-[#584219]">
					<view class="flex justify-center items-center pb-3 pt-2"
						style="border-bottom:1rpx dashed lightgray;">
						<view class="w-1/2 flex items-center text-[30rpx]">
							<image src="/static/icons/time.png" mode="widthFix" class="w-[34rpx] h-[34rpx]"></image>
							<text>&nbsp;预约{{(index+1)}}</text>
						</view>
						<view class="w-1/2 flex justify-end items-center ">
							<!-- @click="shareOrder(orderData.id,item.id)" -->
							<view
								class=" border border-[#584219] rounded-md px-2 pt-1 pb-1 text-[28rpx] flex items-center justify-center">
								<button :data-id="item.id" open-type="share" class=" flex justify-center items-center "
									style="padding: 0;color: #584219;background: #FFFFFF;">分享好友</button>
								<image src="/static/icons/external-link.png" class="w-[35rpx] h-[35rpx]"
									mode="widthFix">
								</image>
							</view>
						</view>
					</view>
					<view class="pt-3 pb-1 flex justify-center items-center text-[28rpx]">
						<view class="w-1/5">项目</view>
						<view class="w-4/5 flex justify-end">{{item.productTitle}}
							{{item.orderDetailList[0].duration}}mins</view>
					</view>
					<view class="pt-1 pb-1 flex justify-center items-center text-[28rpx]">
						<view class="w-1/5">时间</view>
						<view class="w-4/5 flex justify-end">{{item.cardimage}}</view>
					</view>
					<view class="pt-1 pb-1 flex justify-center items-center text-[28rpx]">
						<view class="w-1/5">位置</view>
						<view class="w-4/5 flex justify-end"> {{shop[0].name}}</view>
					</view>
					<view class="pt-1 pb-1 flex justify-center items-center text-[28rpx]">
						<view class="w-1/5">地址</view>
						<view class="w-4/5 flex justify-end">
							<text> {{shop[0].address}}&nbsp; </text>
							<image @click="copyShoreAddress" src="/static/icons/copy-regular.png"
								class="w-[30rpx] h-[30rpx]" mode="widthFix">
							</image>
						</view>
					</view>
					<view class="pt-1 pb-1 flex justify-center items-center text-[28rpx]">
						<view class="w-1/5">电话</view>
						<view class="w-4/5 flex justify-end">{{shop[0].mobile}}</view>
					</view>
				</view>
			</view>
			<view v-else>
				<view v-for="(item,index) in orderData" :key="index" class="px-5 pt-5">
					<view class="bg-white rounded-lg p-2">
						<view class="h-full">
							<image class="rounded-lg " style="width: 100%;" :src="shop[0].coverImageUrls"
								mode="widthFix"></image>
						</view>
						<view class="px-2 pt-4 pb-4 text-[#584219] font-semibold"
							style="border-bottom:1rpx dashed lightgray;border-top:1rpx dashed lightgray;">
							<view class="text-center pb-1">{{item.productTitle}}
								{{item.orderDetailList[0].duration}}mins</view>
							<view class="text-center pb-1">{{item.cardimage}}</view>
							<view class="text-center"> {{shop[0].name}}</view>
						</view>

						<view class="px-2 pt-4 pb-4 text-[#584219]">
							<view class="pb-1 flex items-center justify-center">
								<text> {{shop[0].address}}&nbsp;</text>
								<image @click="copyShoreAddress" src="/static/icons/copy-regular.png"
									class="w-[30rpx] h-[30rpx]" mode="widthFix">
								</image>
							</view>
							<view class="pb-1 flex items-center justify-center">
								<text @click="callMobile(shop[0].mobile)">{{shop[0].mobile}}&nbsp;</text>
								<image @click="callMobile(shop[0].mobile)" src="/static/icons/mobile.png"
									class="w-[30rpx] h-[30rpx]" mode="widthFix">
								</image>
							</view>
							<!-- <view class="text-center">{{shop[0].mobile}}</view> -->
						</view>
					</view>
				</view>
			</view>
			<view v-if="orderData.length>1" class="p-10 ">
				<button @click="go_page_bar"
					class="h-[80rpx] flex justify-center items-center bg-[#584219] text-white text-[28rpx]">管理我的预约</button>
			</view>
			<view v-else class="p-10 flex justify-center items-center">
				<button style="border:2rpx solid #584219;width: 40%;" :data-id="orderData[0].id" open-type="share"
					class="h-[80rpx] flex justify-center items-center bg-white text-[#584219] text-[28rpx]">一键分享</button>
				<button @click="go_page_bar" style="width: 40%;"
					class="h-[80rpx] flex justify-center items-center bg-[#584219] text-white text-[28rpx]">管理我的预约</button>
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
	import cookie from "../../../utils/cookieUtil"
	import orderApi from "../../../api/order"

	const customBar = ref(0)
	const statusBar = ref(0)
	const orderData = ref([{
		id: 0
	}])
	const orderDetail = ref([])
	const shop = ref([{
		coverImageUrls: '',
		address: '',
		mobile: '',
		name: ''
	}])
	const topdisplayStatus = ref(true)

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
		console.log(options)
		topdisplayStatus.value = options.topdisplayStatus
		getOrderDetail(options.orderId)
	});

	const getOrderDetail = async (orderId) => {
		let data = await api.infoWithDetailNew(orderId)
		let shopList = cookie.getStoreList()
		shop.value = shopList.filter(t => {
			return t.id == data[0].shopId
		});
		orderData.value = data
		orderDetail.value = data[0].orderDetailList

		console.log(shop.value)
		console.log(orderData.value)
	}
	const go_page_bar = () => {
		uni.switchTab({
			url: '/pages/user/order/order'
		})
	}
	// 复制地址
	const copyShoreAddress = () => {
		uni.setClipboardData({
			data: shop.value[0].address,
			success: () => {
				uni.showToast({
					title: '地址已复制',
					icon: 'success'
				})
			},
		})
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
	onShareAppMessage(async (res) => {
		console.log(res.target.dataset.id)
		//let data=await orderApi.shareOrder(res.target.dataset.id)
		let name = cookie.getNickname()
		return {
			title: "邀请好友共同Full愈", // 卡片标题
			path: '/pages/index/pay-success/appointment-share?custName=' + name + '&orderId=' + res.target
				.dataset.id, // 携带参数
			imageUrl: shop.value[0].coverImageUrls // 1:1 比例缩略图
		}
	})
	const shareOrder = (orderId, orderDetailId) => {
		/* uni.navigateTo({
			url: '/pages/index/pay-success/appointment-share?orderId='+orderId+'&orderDetailId='+orderDetailId
		}); */
	}
</script>

<style>

</style>