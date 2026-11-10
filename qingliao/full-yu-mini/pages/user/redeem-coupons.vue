<template>
<!-- <view class="redeem-coupons" :style="{ minHeight: headerHeight + 'px' }"> -->
<view class="redeem-coupons">
	<view class="card">
		<view class="title">礼品卡兑换</view>
		<input class="coupons-input" placeholder-class="input-placeholder" v-model.trim="code" placeholder="请输入兑换密码"/>
		<button class="btn btn-modify" @click="receive()" :class="{'disabled': !code}" :disabled="!code">确认领取</button>
	</view>
	<view>
		<view class="split-text">
			<image src="/static/icons/split-icon.png"/><text>领取说明</text><image src="/static/icons/split-icon.png"/>
		</view>
		<view class="work-flow flex justify-center items-center">
			<view class="flex flex-col text-center justify-center items-center">
				<image src="/static/icons/redeem-coupons1.png"/>
				<text>绑定领券</text>
			</view>
			<view class="middle-icon flex flex-col text-center justify-center items-center">
				<image src="/static/icons/redeem-coupons2.png"/>
				<text>预约</text>
			</view>
			<view class="flex flex-col text-center justify-center items-center">
				<image src="/static/icons/redeem-coupons3.png"/>
				<text>用券抵扣</text>
			</view>
		</view>
		<view class="text-sm text-[#56534C]">
			<p>1、输入券码时，请注意区分英文字母大小写，同时注意不要有空格</p>
			<p>2、券码领取后，不可退款，不可转赠。同时，请注意券的有效期，避免过期导致券不可用</p>
		</view>
	</view>
</view>
</template>

<script setup>
import { ref, computed } from 'vue';
import giftCardApi from '../../api/giftCard'
const code = ref('')

const receive = () => {
  giftCardApi.receive(code.value).then(res=>{
    console.log(res)
    // 成功提示
    uni.showModal({
      title:"领取成功",
      content: res,
      confirmText: '去查看',
      cancelText:"继续兑换",
      success(res) {
        if(res.confirm) {
          uni.navigateTo({
            url: '/pages/mall/mall?tab=mine'
          })
        }
        if (res.cancel) {
          code.value = ''
        }
      }
    })
  }).catch(err=>{
    console.log(err)
    // 失败提示
    uni.showModal({
      title:"抱歉！领取失败",
      content: err,
      confirmText: '继续兑换',
      showCancel:false,
      success(res) {
        if(res.confirm) {
          code.value = ''
        }
      }
    })
  })
}

// 计算顶部背景高度
const systemInfo = uni.getSystemInfoSync()
const menuButtonInfo = wx.getMenuButtonBoundingClientRect()

const headerHeight = computed(() => {
  const statusBarHeight = systemInfo.statusBarHeight || 0
  const menuButtonHeight = menuButtonInfo.height || 0
  const menuButtonTop = menuButtonInfo.top || 0
  const navigationBarHeight = (menuButtonTop - statusBarHeight) * 2 + menuButtonHeight
  // 852upx 是原始高度，需要转换为 px
  const originalHeightPx = uni.upx2px(749)
  return originalHeightPx + statusBarHeight + navigationBarHeight
})

</script>

<style lang="less" scoped>
.redeem-coupons {
	background: url("https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/backgroundImage.jpg") no-repeat;
	background-size: 100%;
	padding-top: 192rpx;
	// padding-top: 184rpx;
	padding-left: 40rpx;
	padding-right: 40rpx;
	.card {
		background: #FFFFFF;
		box-shadow: 0rpx 4rpx 22rpx 0rpx rgba(178,176,175,0.5);
		border-radius: 24rpx;
		margin-bottom: 66rpx;
		padding: 48rpx 46rpx 68rpx;
		.title {
			font-weight: 600;
			font-size: 34rpx;
			color: #333333;
			margin-bottom: 48rpx;
			text-align: center;
		}
		.coupons-input {
			margin-bottom: 48rpx;
			background: #F4F2F0;
			border-radius: 16rpx;
			height:88rpx;
			padding-left: 32rpx;
			font-size: 30rpx;
		}
		.input-placeholder {
			color: #989191;
		}
		.btn-modify {
			background-color: #584219;
			color: #fff;
			padding-top: 22rpx;
			padding-bottom: 22rpx;
			font-size: 30rpx;
		}
		.disabled {
			background-color: rgba(88, 66, 25, 0.6);
			color: #ffffff;
			border-color: transparent;
		}
	}
	.split-text {
		color: #333333;
		font-size: 32rpx;
		text-align: center;
		margin-bottom: 46rpx;
		text {
			margin-left: 22rpx;
			margin-right: 22rpx;
		}
		image {
			width: 50rpx;
			height: 14rpx;
		}
	}
	.work-flow {
		color: #56534C;
		font-size: 28rpx;
		gap: 152rpx;
		margin-bottom: 44rpx;
		.middle-icon {
			position: relative;
			&::before,
			&::after{
				content: '';
				position: absolute;
				top: 46rpx;
				height: 1px;
				border-top: 1px dashed #979797;
				width: 76rpx;
			}
			&::before {
				left: -130rpx;
			}
			&::after{
				left: 130rpx;
			}
		}
		image {
			width: 92rpx;
			height: 92rpx;
			margin-bottom: 12rpx;
		}
	}
}
</style>
