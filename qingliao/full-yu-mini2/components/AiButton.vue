<template>
	<movable-area class="movableArea" style="z-index: 99;">
		<movable-view class="movableView" :y="yluxin" style="width: 100rpx;height: 100rpx; left: 80%; transform: translateX(-50%);"   direction="all" >
			<view class="fixed bottom-0  w-full flex justify-center items-center" style="z-index: 50;">
				<view @click="go_page" class="absolute  right-0 ml-auto w-[100rpx] h-[100rpx] rounded-full bg-white"
					style="fill: var(--Bg-colorBgContainer, #FFF);filter: drop-shadow(0 0 10px rgba(88, 66, 25, 0.50));">
					<view class="flex justify-center items-center h-[100rpx]">
						<image src="/static/icons/Vector.png" mode="widthFix" class="w-[50rpx] h-[50rpx]"></image>
					</view>
				</view>
			</view>
		</movable-view>
	</movable-area>
</template>

<script setup>
	import {
		ref,
		onMounted
	} from 'vue';
	import {
		onShow
	} from '@dcloudio/uni-app';
const props = defineProps({
		yluxin: {
			type: Number,
			default: 640
		}
	});
	const go_page = (index) => {
		uni.navigateTo({
			url: '/pages/index/booking'
		})
	}
</script>

<style scoped>
	.tab-bar-container {
		display: flex;
		justify-content: space-around;
		align-items: center;
		z-index: 2000;
		padding-bottom: env(safe-area-inset-bottom);
	}

	.movableView {
		pointer-events: auto;
	}

	.movableArea {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
</style>