<template>
	<view class="lang-switch" :style="{ top: topPx + 'px' }">
		<view class="ls-item" :class="{ 'ls-on': lang === 'zh' }" @click.stop="pick('zh')">中</view>
		<view class="ls-item" :class="{ 'ls-on': lang === 'en' }" @click.stop="pick('en')">EN</view>
	</view>
</template>

<script setup>
	import {
		ref,
		onMounted
	} from 'vue'
	import {
		useLocale,
		setLocale,
		syncNavTitle
	} from '../utils/locale'

	/**
	 * 语言切换：只在首页挂载，悬浮在微信胶囊下方。
	 * 其它页面不放入口（避免压住导航与正文），但语言状态是全局的，
	 * 首页切换后 TabBar、会员页等已接双语的界面会一起变。
	 */
	const { lang } = useLocale()
	// 兜底位置：胶囊下沿 + 8px。取不到胶囊信息时也不遮住导航。
	const topPx = ref(96)

	onMounted(() => {
		// #ifdef MP-WEIXIN
		try {
			const menu = uni.getMenuButtonBoundingClientRect()
			if (menu && menu.bottom) {
				topPx.value = menu.bottom + 8
			}
		} catch (error) {
			// 取不到胶囊信息时沿用兜底值
		}
		// #endif
	})

	const pick = (next) => {
		if (lang.value === next) {
			return
		}
		setLocale(next)
		// 原生导航标题不走响应式，切换后主动刷新一次
		syncNavTitle()
	}
</script>

<style lang="less" scoped>
	.lang-switch {
		position: fixed;
		right: 24rpx;
		z-index: 60;
		display: flex;
		align-items: center;
		height: 64rpx;
		padding: 4rpx;
		border-radius: 999rpx;
		background: rgba(255, 253, 248, 0.94);
		border: 1rpx solid rgba(88, 66, 25, 0.12);
		box-shadow: 0 8rpx 24rpx rgba(88, 66, 25, 0.18);
	}

	.ls-item {
		min-width: 52rpx;
		height: 56rpx;
		padding: 0 14rpx;
		line-height: 56rpx;
		text-align: center;
		border-radius: 999rpx;
		font-size: 22rpx;
		letter-spacing: 0.06em;
		color: #6E5A3C;
	}

	.ls-on {
		background: #584219;
		color: #F6F4F2;
		font-weight: 600;
	}
</style>