<template>
	<view class="gm-page">
		<web-view v-if="url && !failed" :src="url" @error="onError"></web-view>

		<view v-else class="gm-empty">
			<view class="gm-mark">愈</view>
			<text class="gm-title serif">{{ tt('游戏暂时打不开', 'The game cannot open right now') }}</text>
			<text class="gm-desc">{{ tt('请返回会员页重新进入；如仍然打不开，稍后再试或联系工作人员。', 'Go back to the member page and try again. If it still fails, try later or contact our team.') }}</text>
			<button class="gm-btn" @click="goBack">{{ tt('返回会员页', 'Back to member page') }}</button>
		</view>
	</view>
</template>

<script setup>
	import {
		ref
	} from 'vue'
	import {
		onLoad
	} from '@dcloudio/uni-app'
	import { useLocale } from '../../../utils/locale'

	const { tt, syncLocale } = useLocale()

	const url = ref('')
	const failed = ref(false)

	onLoad((options) => {
		syncLocale()
		const raw = options && options.url
		if (!raw) return
		try {
			url.value = decodeURIComponent(raw)
		} catch (e) {
			url.value = raw
		}
	})

	function onError() {
		failed.value = true
	}

	function goBack() {
		const pages = getCurrentPages()
		if (pages && pages.length > 1) {
			uni.navigateBack()
			return
		}
		uni.redirectTo({
			url: '/pages/user/brand-member/brand-member'
		})
	}
</script>

<style lang="less" scoped>
	.gm-page {
		min-height: 100vh;
		background: #F6F4F2;
	}

	.gm-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 220rpx 64rpx 80rpx;
		text-align: center;
	}

	.gm-mark {
		width: 112rpx;
		height: 112rpx;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: SourceHanSerifSC, 'Songti SC', serif;
		font-size: 46rpx;
		color: #F6F4F2;
		background: linear-gradient(140deg, #4A3515 0%, #584219 60%, #77582D 100%);
		box-shadow: 0 16rpx 30rpx -18rpx rgba(88, 66, 25, 0.5);
	}

	.gm-title {
		margin-top: 36rpx;
		font-size: 38rpx;
		letter-spacing: 0.06em;
		color: #584219;
	}

	.gm-desc {
		margin-top: 18rpx;
		font-size: 24rpx;
		line-height: 1.8;
		letter-spacing: 0.04em;
		color: #8A6A40;
	}

	.gm-btn {
		margin-top: 40rpx;
		min-height: 84rpx;
		padding: 0 48rpx;
		border-radius: 16rpx;
		background: #584219;
		color: #F6F0E4;
		font-size: 26rpx;
		letter-spacing: 0.06em;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
