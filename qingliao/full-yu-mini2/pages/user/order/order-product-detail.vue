<template>
	<view class="  bg-[#F6F4F2] pb-4">
		<TopTitle></TopTitle>
		<view class="treatment-detail" :style="{'margin-top': (customBar-10)+'px'}">

			<!-- 产品订单详情卡片 -->
			<view class="order-card" style="margin-top: 20rpx;">
				<view class="card-title">产品详情</view>

				<view class="order-item">
					<text class="order-label">订单号</text>
					<view class="order-value-row">
						<text class="order-value">{{orderInfo.code}}</text>
						<image class="copy-icon " src="/static/icons/copy-regular.png"
							@click="copyOrderNumber"></image>
					</view>
				</view>
				<view class="order-item">
					<text class="order-label">购买商品</text>
					<text class="order-value">{{orderInfo.productTitle}}</text>
				</view>

				<view class="order-item">
					<text class="order-label">下单时间</text>
					<text class="order-value">{{orderInfo.createTime}}</text>
				</view>


				<view class="order-item">
					<text class="order-label">购买数量</text>
					<text class="order-value">1 </text>
				</view>

				<view class="order-item">
					<text class="order-label">支付方式</text>
					<text class="order-value">
						{{ $filters.orderPayTypeFilter(orderInfo.payType) }}
					</text>
				</view>
				<view class="order-item">
					<text class="order-label">支付金额</text>
					<text class="order-value">{{orderInfo.payAmount}}元</text>
				</view>

				<view class="order-item" v-if="orderInfo.integrationAmount!=0">
					<text class="order-label">积分抵扣</text>
					<text class="order-value">{{orderInfo.integrationAmount}}积分抵{{orderInfo.integrationAmount}}元</text>
				</view>
			</view>

			<!-- 购买信息卡片 -->
			<view class="store-card" v-if="orderInfo.useUserMobile!='无'">
				<view class="card-title">赠送好友</view>

				<view class="store-item mt-1" style="border-bottom: none;">
					<text class="store-label">实际使用人</text>
					<text class="store-value">
						{{orderInfo.useUserMobile}}
					</text>
				</view>

				<view class="store-item">
					<text class="store-label">领取时间</text>
					<text class="store-value" >{{orderInfo.useUserTime}}</text>
				</view>
			</view>

		</view>
		<!-- <view class="w-full px-5 mb-5">
			<view class="review-button-container" v-if="true">
				<view class="btnNew btn-reviewNew" @click="callMobile(shop.mobile)">
					拨打电话：{{shop.mobile}}
				</view>
			</view>
		</view> -->
	</view>
</template>

<script setup>
	import {
		onLoad,
		onShareAppMessage,
		onShareTimeline,
		onShow,
		onPageScroll
	} from "@dcloudio/uni-app"
	import {
		ref,
		reactive,
		computed,
		nextTick,
		onBeforeUnmount,
		onMounted,
		getCurrentInstance
	} from 'vue'
	import TopTitle from '../../../components/TopTitle.vue';
	import orderApi from "../../../api/order"
	import moment from 'moment'
	import cookie from "../../../utils/cookieUtil";

	const customBar = ref(0)
	const statusBar = ref(0)
	const orderInfo = ref([])
	const shop = ref([])
	onLoad((options) => {
		uni.getSystemInfo({
			success: (e) => {
				// #ifdef MP-WEIXIN
				const custom = wx.getMenuButtonBoundingClientRect() // 获取小程序胶囊按钮位置信息
				customBar.value = e.statusBarHeight + 40
				statusBar.value = e.statusBarHeight + 10
				// #endif
			}
		})
		shop.value = cookie.getStore()
		console.log(shop.value)
		let orderId = options.orderId
		getOrderInfo(orderId)
	});
	const getOrderInfo = async (orderId) => {
		let data = await orderApi.infoWithDetailOrSendInfo(orderId) || {}
		data.createTime = moment(data.createTime).format('YYYY-MM-DD HH:mm')
		if(data.useUserMobile!="无"){
			data.useUserTime = moment(data.useUserTime).format('YYYY-MM-DD HH:mm')
		}
		
		orderInfo.value = data
		console.log(orderInfo.value)
	}
	// 复制订单号
	const copyOrderNumber = () => {
		uni.setClipboardData({
			data: orderInfo.value.code,
			success: () => {
				uni.showToast({
					title: '订单号已复制',
					icon: 'success'
				})
			}
		})
	}
	const callMobile = (mobile) => {
		uni.makePhoneCall({
			phoneNumber: mobile, // 电话号码
			success: function() {
				console.log('拨打电话成功！');
			},
			fail: function(err) {
				console.error('拨打电话失败：', err);
			}
		});
	}
</script>

<style lang="less" scoped>
	.review-button-container {
		position: relative;
		display: inline-block;
		/* or flex, adjust as needed */

		width: 100%;
		/* Adjust spacing from other buttons if necessary */
	}

	.btn-reviewNew {
		color: #584219;
		font-weight: 400;
		border: 2upx solid #584219;

	}

	.btnNew {
		padding: 20rpx 40rpx;
		border-radius: 16rpx;
		font-size: 26rpx;
		text-align: center;
	}

	.review-reward-tag {
		position: absolute;
		top: -12px; // Adjust to position above the button
		left: 66%;
		// transform: translateX(-50%);
		background-color: #FEE3E3; // Light pinkish background
		color: #FA5151; // Reddish text color
		padding: 3px 8px;
		border-radius: 10px;
		font-size: 10px;
		display: flex;
		align-items: center;
		white-space: nowrap;
		z-index: 1; // Ensure it's above the button

		.reward-icon {
			width: 12px;
			height: 12px;
			margin-right: 4px;
		}
	}

	.treatment-detail {
		padding: 32upx 40upx 10upx 40upx;

		.time-cardadd {
			background: white;
			border-radius: 20upx;
			box-shadow: 0 4upx 20upx rgba(0, 0, 0, 0.05);
		}

		// 顶部时间卡片
		.time-card {
			padding: 10rpx 48rpx 40rpx 48rpx;
			margin-bottom: 32upx;
			margin-top: 32upx;
			display: flex;
			justify-content: space-between;


			.time-section {
				display: flex;
				flex-direction: column;
				align-items: center;

				.time-label {
					font-size: 28upx;
					color: #00000073;
					margin-bottom: 10upx;
				}

				.time-value {
					font-size: 44upx;
					font-weight: bold;
					color: #584219;
					margin-bottom: 8upx;
				}

				.date-value {
					font-size: 24upx;
					color: #00000073;
				}
			}

			.duration-section {
				display: flex;
				flex-direction: column;
				align-items: center;

				.time-label {
					font-size: 28upx;
					color: #00000073;
					margin-bottom: 10upx;
				}

				.duration-value {
					font-size: 44upx;
					font-weight: bold;
					color: #584219;
					margin-bottom: 20upx;
				}

				.duration-bar {
					display: flex;
					width: 120upx;
					height: 8px;
					overflow: hidden;
					position: relative;
					transform: skewX(-20deg);
					/* 整体倾斜 */

					.bar-segment {
						flex: 1;
						height: 100%;
						margin-right: 2upx;

						/* 段落之间的间距 */
						&:last-child {
							margin-right: 0;
						}
					}

					.light-1 {
						background-color: #F8EFEA;
					}

					.light-2 {
						background-color: #F1E0D4;
					}

					.light-3 {
						background-color: #E9D1BF;
					}

					.dark-1 {
						background-color: #E0C2AA;
					}

					.dark-2 {
						background-color: #D7B395;
					}

					.dark-3 {
						background-color: #CE9F7F;
					}
				}
			}
		}

		// 通用卡片样式
		.order-card,
		.store-card,
		.therapist-card {
			background: white;
			border-radius: 20upx;
			padding: 32upx;
			margin-bottom: 32upx;
			box-shadow: 0 4upx 20upx rgba(0, 0, 0, 0.05);

			.card-title {
				font-size: 30upx;
				font-weight: bold;
				color: #584219;
				padding-bottom: 20upx;
				border-bottom: 2upx solid #EEECE8;
			}
		}

		// 订单详情
		.order-item {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 13upx 0;

			.order-label {
				font-size: 26upx;
				color: #8A6A40;
				flex-shrink: 0;
			}

			.order-value {
				font-size: 26upx;
				color: #584219;
				text-align: right;
			}

			.order-value-row {
				display: flex;
				align-items: center;

				.copy-icon {
					width: 22upx;
					height: 25upx;
					margin-left: 10upx;
				}
			}
		}

		// 门店信息
		.store-item {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			padding: 15upx 0;
			border-bottom: 1upx solid #f5f5f5;

			&:last-child {
				border-bottom: none;
			}

			.store-label {
				font-size: 26upx;
				color: #8A6A40;
				flex-shrink: 0;
				width: 140upx;
			}

			.store-value {
				font-size: 26upx;
				color: #584219;
				text-align: right;
				flex: 1;
				line-height: 1.5;
			}

			.copy-icon {
				width: 32upx;
				height: 32upx;
				margin-left: 10upx;
			}
		}

		// 疗愈师列表
		.therapist-list {
			.therapist-item {
				display: flex;
				align-items: center;
				padding: 20upx 0;
				border-bottom: 1upx solid #f5f5f5;

				&:last-child {
					border-bottom: none;
				}

				.therapist-avatar {
					width: 80upx;
					height: 80upx;
					border-radius: 50%;
					margin-right: 20upx;
				}

				.therapist-info {
					flex: 1;

					.therapist-name {
						display: block;
						font-size: 30upx;
						font-weight: bold;
						color: #333;
						margin-bottom: 8upx;
					}

					.therapist-store {
						font-size: 24upx;
						color: #00000073;
					}
				}

				.favorite-btn {
					padding: 12upx 24upx;
					border-radius: 20upx;
					border: 2upx solid #584219;

					.favorite-text {
						font-size: 24upx;
						color: #584219;
					}

					&.favorited {
						background-color: #584219;

						.favorite-text {
							color: white;
						}
					}
				}
			}
		}

		// 底部操作区域
		.bottom-action {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			background: white;
			padding: 20upx 30upx;
			padding-bottom: calc(20upx + env(safe-area-inset-bottom));
			box-shadow: 0 -4upx 20upx rgba(0, 0, 0, 0.1);

			.evaluate-btn {
				width: 100%;
				height: 88upx;
				background: #584219;
				border-radius: 16upx;
				border: none;
				font-size: 28upx;
				color: white;
				display: flex;
				align-items: center;
				justify-content: center;
			}
		}


	}
</style>