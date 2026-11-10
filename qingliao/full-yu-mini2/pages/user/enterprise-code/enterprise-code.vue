<template>
	<view class="bgimage" :style="{height:heightvalue+'px'}">
		<TopTitle></TopTitle>
		<view class="banner-detail " :style="{position: '-webkit-sticky',position:'sticky',marginTop:customBar+'px','z-index':'99'}">
		 <image :show-menu-by-longpress="true" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/enterprisecode.jpg" mode="widthFix"></image>
		</view>
	</view>
</template>

<script setup>
import {ref} from 'vue'
import {onShow, onLoad} from '@dcloudio/uni-app'
import TopTitle from '../../../components/TopTitle.vue';
const customBar = ref(0)
	const statusBar = ref(0)
	const topNumber=ref(0)
	const heightvalue=ref(0)
	onLoad((options) => {
		uni.getSystemInfo({
			success: (e) => {
				// #ifdef MP-WEIXIN
				const custom = wx.getMenuButtonBoundingClientRect() // 获取小程序胶囊按钮位置信息
				customBar.value = custom.bottom + custom.top - e.statusBarHeight
				statusBar.value = e.statusBarHeight + 10
				
				heightvalue.value=wx.getSystemInfoSync().windowHeight-customBar.value;
				console.log(heightvalue.value)
				
				// #endif
			}
		})

	});


</script>

<style lang="scss" scoped>
	.bgimage{
		background-image:url(https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/bgimage.png);
	}
.banner-detail {
  
  width: 100%;

  image {
    width: 100%;
  }
}
</style>
