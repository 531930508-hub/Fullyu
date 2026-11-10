<template>
	<view class="min-h-screen  bg-[#F6F4F2] ">
		<view class="px-5 pt-5">
			<view class="bg-white rounded-lg p-2">
				<view class="h-full">
					<image class="rounded-lg " style="max-width: 100%;"
						src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/shop/20250618/f0150089-3138-4424-bc56-459f7101f23a%28._.%29mentou.png"
						mode="widthFix" ></image>
				</view>
				<view class="text-[#584219] text-[32rpx] pl-1  pt-4 pb-4">您的好友「小毛」邀请您一起享受Full愈时刻</view>
				<view class="px-2 pt-4 pb-4 text-[#584219] font-semibold"
					style="border-bottom:1rpx dashed lightgray;border-top:1rpx dashed lightgray;">
					<view class="text-center pb-1">头部水疗 30mins</view>
					<view class="text-center pb-1">10月9日，星期四，下午16:30</view>
					<view class="text-center">Full愈 上海静安大悦城店</view>
				</view>

				<view class="px-2 pt-4 pb-4 text-[#584219]">
					<view class="pb-1 flex items-center justify-center">
						<text> 上海市静安区共和新路134号&nbsp;</text>
						<image src="/static/icons/copy-regular.png" class="w-[30rpx] h-[30rpx]" mode="widthFix"></image>
					</view>
					<view class="text-center">（+86）123456789</view>
					<view class="flex justify-center pt-1">
						<image class="h-[280rpx] w-[280rpx]" mode="widthFix"
						src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/shop/20250618/f0150089-3138-4424-bc56-459f7101f23a%28._.%29mentou.png"
						></image>
					</view>
				</view>
			</view>
			<view class="pt-7 gap-3 ">
				<button class=" h-[80rpx] flex justify-center items-center bg-[#584219] text-white text-[28rpx]" >一建领取</button>
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
	
</script>

<style>

</style>