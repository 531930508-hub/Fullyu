<template>
	<view class="receive-gift min-h-screen bg-gray-100 relative" :class="localeClass()">
		<!-- Main content area -->
		<view class="relative z-10 pt-8 px-4">
			<!-- Blessing message section -->
			<view class="bg-white shadow-md p-2 mx-auto mt-4" style="width: 480rpx;">
				<view class="w-full h-[252rpx] overflow-hidden mb-5">
					<image :src="img(giftInfo.gift.image || defaultImg, 750)" :webp="true" mode="scaleToFill" class="card-image" />
				</view>
				<view class="text-[30rpx] mb-2 ml-2 pb-8">{{giftInfo.gift.title}}</view>
			</view>

			<!-- Gift section -->
			<view v-for="(detail, detailIdx) in giftInfo.giftDetail" :key="detailIdx">
				<view class="mt-8" v-if="detail.useType == 0">
					<view class="text-gray-800 text-base font-semibold mb-4">{{ t('礼物：') }}{{ detail.name }}</view>
					<view class="bg-white rounded-lg shadow-sm p-3 flex items-center">
						<!--  <image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Full%E6%84%88%E5%88%B8.jpg" class="w-[240rpx] h-20 rounded-md mr-4" /> -->
						<view class="flex-1">
							<view class="text-[34rpx] font-bold mb-2">{{ detail.size }}{{ t('张') }}</view>
							<view class="text-xs text-gray-500 mb-1">
								{{ t('有效期至：') }}{{ detail.endDate && detail.endDate.startsWith('2') ? detail.endDate: t('永久有效') }}
							</view>
							<view class="text-xs text-gray-500">{{ t('可享受：共 ') }}{{ detail.size * 30 }}{{ t(' mins Full愈 时长') }}</view>
						</view>
					</view>
				</view>

				<!-- Gift 2 section -->
				<view class="mt-8" v-if="detail.useType == 1">
					<view class="flex items-center mb-2">
						<view class="text-gray-800 text-base font-semibold">{{ t('礼物2：') }}{{ detail.name }}</view>
						<button class="coupon-badge">{{ tt('Full愈', 'Full Yu') }}</button>
					</view>
					<view class="bg-white rounded-lg shadow-sm p-4 text-sm text-gray-600 leading-relaxed">
						{{detail.comment}}
					</view>
				</view>
			</view>
		</view>

		<view class="h-24"></view>
		<!-- Bottom fixed payment button -->
		<view class="fixed bottom-0 left-0 w-full bg-white p-4 shadow-lg z-50" >
			<button v-if="giftInfo.gift.state == 0" @click="receiveGift"
				class="w-full bg-[#584219] text-white py-3 rounded-lg text-sm">{{ t('确认领取') }}</button>
			<button v-else disabled
				class="w-full bg-[#584219] text-white py-3 rounded-lg text-sm">{{ $filters.giftStateFilter(giftInfo.gift.state) }}</button>
		</view>

	</view>
</template>



<script setup>
	import { t, useLocale } from '../../utils/locale'
	const { tt } = useLocale()
	import { img } from '../../utils/imageLocale'
	import {
		onLoad,
		onShow
	} from "@dcloudio/uni-app"
	import {
		ref
	} from 'vue'
	import giveGiftApi from "../../api/giveGift";
	import orderApi from '../../api/order'
	import cookie, {
		getCouponCount
	} from "../../utils/cookieUtil"
	const giftId = ref(-1)
	const shareCode = ref('')
	const giftInfo = ref({
		gift: {},
		order: {},
		giftDetail: [],
	})

	const defaultImg = ref('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniImage/20260209/648a6e6d-d63c-45c9-b684-4a27c40e1d99%28._.%29%E5%88%B8%E7%A7%8D%20%287%29.png')

	onLoad((options) => {
		giftId.value = options.id
		shareCode.value = options.shareCode
		console.log(options)
		fetchData()
	})
	const fetchData = async () => {
		let data = await giveGiftApi.infoById(giftId.value)
		giftInfo.value = data || {
			gift: {},
			order: {},
			giftDetail: [],
		}
	}


	const receiveGift = async () => {
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
		}else{
			uni.showModal({
				title: t('提示'),
				content: t('确定要领取吗？'),
				confirmText: t('确定'),
				cancelText: t('取消'),
				success: async (res) => {
					if (res.confirm) {
						await giveGiftApi.receiveGift(giftId.value, shareCode.value)
						console.log('%c[sendGift-sendGift]', 'color: #1678ff', )
						// shareBtn.value.click()
						uni.showModal({
							title: t('提示'),
							showCancel: false,
							confirmText: t('确定'),
							content: t('领取成功'),
							success: function(res) {
								/* uni.redirectTo({
								  url: '/pages/mall/mall?tab=mine'
								}); */
								uni.switchTab({
									url: '/pages/mall/my-card/my-card'
								})
							}
						});
					}
				}
			});
		}
	}
</script>

<style lang="less" scoped>
	.receive-gift {
		background: url('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/backgroundImage.jpg') no-repeat;
		background-size: 100% 786rpx;
	}

	.coupon-badge {
		background: linear-gradient(305.24deg, #737E90 -14.09%, #D0D6E3 58.6%);
		color: #666;
		padding: 4upx 12upx;
		border-radius: 8upx;
		font-size: 20upx;
		margin-right: 0;

		&.gold {
			background: linear-gradient(297.18deg, #A18341 30.28%, #EEDBA6 78.78%);
			color: #584219;
		}
	}

	.btn-con {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		padding: 10rpx 40rpx;

		.btn {
			display: flex;
			justify-content: center;
			align-items: center;
			height: 80rpx;
			width: 40%;
			background: #f5f5f5;
		}
	}

	.card-image {
		width: 100%;
		height: 100%;
		border-radius: 16upx;
	}
</style>