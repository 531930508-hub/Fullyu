<template>
	<view class="tab-bar-container fixed bottom-0 left-0 w-full flex justify-center items-center">
		<view class="tab-bar-content flex justify-around items-center bg-white rounded-full shadow-lg">
			<view v-for="(item, index) in list" :key="index" class="tab-item flex flex-col items-center"
				@click="switchTab(item, index)">
				<image :src="selected === index ? item.selectedIconPath : item.iconPath"
					style="width: 43rpx;height: 28rpx;margin-top: -10rpx;" />
				<text class="text-xs" :class="{ 'text-selected': selected === index }">{{ t(item.text) }}</text>
			</view>
		</view>
	</view>
</template>

<script setup>
	import { t } from '../utils/locale'

	import {
		ref,
		onMounted
	} from 'vue';
	import {
		onShow
	} from '@dcloudio/uni-app';
	import cookie from "../utils/cookieUtil"

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

	/**
	 * pages.json 里 tabBar.list 注册的页面，只有这些能用 switchTab 切换。
	 * 预约页（select-project）不在 tabBar 里，对它调 switchTab 会静默失败、点击没反应。
	 */
	const TAB_PAGES = [
		'/pages/index/index',
		'/pages/mall/mall',
		'/pages/mall/my-card/my-card',
		'/pages/user/order/order',
		'/pages/user/index'
	]

	const switchTab = (item, index) => {
		/**
		 * 按 pagePath 分派而不是按 item.text 比较：text 已交给 t() 做英文渲染，
		 * 用文案判断会在英文模式下失效，导致预约/订单走错跳转方式。
		 */
		const path = (item.pagePath || '').split('?')[0]
		if (!TAB_PAGES.includes(path)) {
			// 非 tabBar 页面（预约）只能 navigateTo
			uni.navigateTo({
				url: item.pagePath
			});
			return
		}
		if (path.indexOf('order') > -1) {
			if (checkLogin()) {
				uni.switchTab({
					url: path
				});
			}
		} else {
			uni.switchTab({
				url: path
			});
		}
	};
	const checkLogin = () => {
		//先校验登录
		if (!cookie.getToken()) {
			uni.showToast({
				title: t('暂未登录'),
				icon: 'none'
			});
			setTimeout(() => {
				uni.navigateTo({
					url: '/pages/login/login',
				})
			}, 500)
			return false
		}
		return true
	}
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
		bottom: 30rpx;
		left: 50%;
		transform: translateX(-50%);
		width: 670rpx;
		height: 100rpx;
		/* background-color: white; */
		border-radius: 68rpx;
		/* box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1); */
		display: flex;
		justify-content: space-around;
		align-items: center;
		z-index: 40;
		padding-bottom: env(safe-area-inset-bottom);
	}

	.tab-bar-content {
		height: 100rpx;
		width: 670rpx;
		box-shadow: 0px 4px 4px 0px #5842194D, 0px 8px 12px 6px #58421926;
	}

	.text-xs {
		color: #8A6A40;
		font-family: "PingFang SC";
		font-size: 28rpx;
		font-style: normal;
		font-weight: 400;
		line-height: 135%;
		/* 16.2px */

	}

	.text-selected {
		color: #584219;
		font-family: "PingFang SC";
		font-size: 28rpx;
		font-style: normal;
		font-weight: 600;
		line-height: 135%;
		/* 16.2px */
	}
</style>