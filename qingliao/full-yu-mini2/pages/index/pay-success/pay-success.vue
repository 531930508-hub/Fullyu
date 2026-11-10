<template>
	<view class="min-h-screen  bg-[#F6F4F2] ">
		<TopTitle></TopTitle>
		<view class="flex justify-around items-center mt-[500rpx]">
			<image mode="widthFix" class="h-[160rpx] w-[160rpx]" src="/static/icons/paysuccess.png"></image>
		</view>
		<view class="flex justify-center text-[#584219] text-[30rpx] mt-6">
			<text>购买成功</text>
		</view>
		<view class="flex justify-center text-[#584219] text-[26rpx] mt-3">
			<text>订单号 COH20000089475 </text>
		</view>
		<view class="flex justify-center text-[#584219] text-[28rpx] mt-3 font-medium">
			<text>付款：¥988元</text>
		</view>
		<view class="flex justify-center mt-[300rpx]">
			<button class="w-2/3 h-[80rpx] flex justify-center items-center bg-[#584219] text-white text-[26rpx]" >去使用</button>
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


	const go_page = (path) => {
		uni.navigateTo({
			url: path
		})
	}
	const go_page_notbutton = (path) => {
		console.log(path)
		uni.navigateTo({
			url: path
		});
	}


	const customBar = ref(0)
	const statusBar = ref(0)

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

	});
</script>

<style lang="less" scoped>


</style>