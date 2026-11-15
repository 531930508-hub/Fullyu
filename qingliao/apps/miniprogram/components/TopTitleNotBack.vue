<template>
	<view class="index"> 
		<view class="header px-4 pb-2 flex items-center bg-white"
			:style="{ paddingTop: statusBar + 'px', height: customBar + 'px' }">
			<view class="flex justify-center items-center w-full">
				<image class="w-[130rpx] h-[40rpx]" mode="widthFix" src="/static/icons/title_logo.png" />
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
	const go_back = () => {
		/* uni.$on('sendParamsKey', () => {
		       uni.$emit('changeParamsKey', 11);
		   }); */
		uni.navigateBack({
			url: 1
		})
	}
	const go_home = () => {
		uni.redirectTo({
			url: '/pages/index/index'
		})
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
	.index {
		position: relative;

		.header {
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			z-index: 1000;
			transition: background 0.3s ease;
		}
	}
</style>