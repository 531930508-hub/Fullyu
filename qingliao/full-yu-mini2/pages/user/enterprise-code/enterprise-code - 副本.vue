<template>
	<view class="" style="background-color:#F6F4F2 ;">
		<TopTitle></TopTitle>
		<view :style="{position: '-webkit-sticky',position:'sticky',marginTop:customBar+'px','z-index':'99'}">
			<view>
				<image mode="widthFix" style="width: 100%;"
					src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniImage/20260111/cc219ed9-f874-4774-b901-f8ed3aabd0ac(._.)codetop.png">
				</image>
			</view>
			<view class="bgimage min-h-screen w-full " :style="{position: 'fixed',top:customBar+'px',left: '0'}">
				<view :style="{marginTop:topNumber+'px'}">
					<view class="pt-[450rpx] w-full flex justify-center">
						<image
							src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniImage/20260111/795f6077-d46e-4229-9d3a-583a7d48148e(._.)321.png"
							class="w-[280rpx] h-[280rpx]"></image>
					</view>
					<view style="text-align: center;font-size: 34rpx;;color:#584219;margin-top: 20rpx;">
						<text class="font-medium"> —&nbsp;&nbsp;扫描二维码添加 Full愈 企业微信&nbsp;&nbsp; —</text>
					</view>
					<view class="flex items-center justify-center pt-8">
						<image mode="widthFix" class="w-[300rpx] h[300rpx]" :show-menu-by-longpress="true"
							src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/enterprisecode.png">
						</image>
					</view>
					<view class="flex items-center justify-center h-[50rpx]" style="color:#584219;margin-top: 10rpx;">
						(长按识别二维码)
					</view>
				</view>
				
			</view>
		</view>
	</view>
</template>

<script setup>
	import {
		onLoad,
	} from "@dcloudio/uni-app"
	import {
		ref,
		getCurrentInstance
	} from 'vue'
	import TopTitle from '../../../components/TopTitle.vue';


	const customBar = ref(0)
	const statusBar = ref(0)
	const topNumber=ref(0)
	onLoad((options) => {
		uni.getSystemInfo({
			success: (e) => {
				// #ifdef MP-WEIXIN
				const custom = wx.getMenuButtonBoundingClientRect() // 获取小程序胶囊按钮位置信息
				customBar.value = custom.bottom + custom.top - e.statusBarHeight
				statusBar.value = e.statusBarHeight + 10
				if(e.screenHeight<750){
					topNumber.value=-110
				}
				// #endif
			}
		})

	});
	const handleLongPress = () => {
		// 调用扫码功能
		uni.scanCode({
			success: (res) => {
				console.log('扫描结果:', res.result);
				// 处理扫描结果，例如跳转到某个页面或显示结果等
				/* uni.navigateTo({
					url: '/pages/result/result?qrCodeResult=' + res.result
				}); */
			},
			fail: () => {
				uni.showToast({
					title: '扫描失败',
					icon: 'none'
				});
			}
		});
	}
</script>

<style>
	.bgimage {
		background-image: url('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniImage/20260111/19579340-91ed-49e3-9fb4-c8045cb3ec88(._.)codedown.png');
		background-size: 100% auto;
		background-position: bottom;
		background-repeat: no-repeat;
	}
</style>