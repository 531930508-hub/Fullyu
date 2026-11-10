<template>
	<view class="tab-bar-container fixed bottom-0 left-0 w-full flex justify-center items-center">
		<view class="tab-bar-content flex justify-around items-center bg-white rounded-full shadow-lg">
			<view v-for="(item, index) in list" :key="index" class="tab-item flex flex-col items-center" @click="switchTab(item, index)">
				<image :src="selected === index ? item.selectedIconPath : item.iconPath" class="w-6 h-6 mb-1" />
				<text class="text-xs text-[#584219]" :class="{ 'text-selected': selected === index }">{{ item.text }}</text>
			</view>
		</view>
	</view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';

const props = defineProps({
	list: {
		type: Array,
		required: true
	},
	selected: {
		type: Number,
		default: 0
	}
});

const switchTab = (item, index) => {
	if (item.text === '预约') {
		uni.navigateTo({
			url: item.pagePath,
			success: () => {
				// 隐藏TabBar
				uni.hideTabBar();
			}
		});
	} else {
		uni.switchTab({ url: item.pagePath });
	}
};
</script>

<style scoped>
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 10rpx;
}
.tab-bar-container {
	position: fixed;
	bottom: 32rpx;
	left: 50%;
	transform: translateX(-50%);
	width: 500rpx;
	height: 140rpx;
	/* background-color: white; */
	border-radius: 68rpx;
	/* box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1); */
	display: flex;
	justify-content: space-around;
	align-items: center;
	z-index: 1000;
	padding-bottom: env(safe-area-inset-bottom);
}

.tab-bar-content {
	height: 126rpx;
  width: 500rpx;
	box-shadow: 0px 4px 4px 0px #5842194D, 0px 8px 12px 6px #58421926;
}

.text-selected {
	color: #584219;
}
</style>