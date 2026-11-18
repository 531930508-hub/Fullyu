<template>
	<view class="terms-policy" :class="localeClass()">
		<view class="content">
			<view class="title">{{ tt('Full愈', 'Full Yu') }}</view>
			<text class="desc">
				{{ t('条款政策') }}				
			</text>
		</view>
	</view>
</template>



<script setup>
	
	import { t, useLocale } from '../../utils/locale'
	const { tt } = useLocale()
</script>

<style lang="less" scoped>
.terms-policy {
	.content {
		padding: 48upx 40upx 64upx;
		.title {
			font-weight: bold;
			font-size: 44upx;
			margin-bottom: 24upx;
		}
		.desc {
			color: #000000A6;
			font-size: 28upx;
		}
	}
}
</style>
