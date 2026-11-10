<template>
	<view class="min-h-screen " style="background-color:#F6F4F2 ;">
		<TopTitle></TopTitle>
		<view class="about" :style="{position: '-webkit-sticky',position:'sticky',top:customBar+'px','z-index':'99'}">
			<image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/about.png"></image>
			<view class="content">
				<view class="title text-[#8A6A40]">Full愈</view>
				<text class="desc text-[#8A6A40]">
					Full愈定位为都市中的中高端放松及疗愈品牌，在Full愈，我们以纯净精油的自然香气为起点， 以空间为载体，创造一个全方位的沉浸式放松体验。
					我们用「Full愈」空间调动五感视觉、听觉、嗅觉、触觉和味觉， 让放松渗透每个感官⻆落。Full愈，是全方位的放松，是深层次的自我回归。
				</text>
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
	} from 'vue';
	import TopTitle from '../../components/TopTitle.vue';
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
	.about {
		image {
			height: 320upx;
			width: 100%;
			margin-bottom: 48upx;
		}

		.content {
			padding: 0 40upx 64upx;

			.title {
				font-weight: bold;
				font-size: 44upx;
				margin-bottom: 24upx;
			}

			.desc {
				color: #8A6A40;
				font-size: 28upx;
			}
		}
	}
</style>