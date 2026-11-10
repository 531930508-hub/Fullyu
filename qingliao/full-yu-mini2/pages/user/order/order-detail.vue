<template>
	<view class="  bg-[#F6F4F2] pb-4">
		<TopTitle></TopTitle>
		<view class="treatment-detail" :style="{'margin-top': (customBar-10)+'px'}">
			<!-- 顶部时间信息卡片 -->
			<view class="time-cardadd" style="margin-top: 20rpx;">
				<view class="w-full px-5 ">
					<view class="text-[#584219] font-semibold h-[100rpx] text-center flex justify-center items-center"
						style="border-bottom: 2rpx solid #EEECE8;">
						{{orderInfo.productTitle}}
					</view>
				</view>
				<view class="time-card">
					<view class="time-section">
						<view class="time-label">开始</view>
						<view class="time-value" v-if="orderInfo.startTime">{{orderInfo.startTime.split(' ')?.[1].substring(0,5)}}</view>
						<view class="date-value" v-if="orderInfo.startTime">{{orderInfo.startTime.split(' ')?.[0]}}</view>
					</view>

					<view class="duration-section">
						<view class="time-label">放松时长</view>
						<view class="duration-value">{{ orderInfo.duration }}mins</view>
						<view class="duration-bar">
							<view class="bar-segment light-1"></view>
							<view class="bar-segment light-2"></view>
							<view class="bar-segment light-3"></view>
							<view class="bar-segment dark-1"></view>
							<view class="bar-segment dark-2"></view>
							<view class="bar-segment dark-3"></view>
						</view>
					</view>

					<view class="time-section">
						<view class="time-label">结束</view>
						<view class="time-value" v-if="orderInfo.endTime">{{ orderInfo.endTime.split(' ')?.[1].substring(0,5) }}</view>
						<view class="date-value" v-if="orderInfo.endTime">{{ orderInfo.endTime.split(' ')?.[0] }}</view>
					</view>
				</view>
			</view>
			<!-- 订单详情卡片 -->
			<view class="order-card">
				<view class="card-title">订单详情</view>

				<view class="order-item">
					<text class="order-label">订单号</text>
					<view class="order-value-row">
						<text class="order-value">{{ orderInfo.code }}</text>
						<image @click="copyOrderNumber" class="copy-icon " src="/static/icons/copy-regular.png"></image>
					</view>
				</view>
				<view class="order-item">
					<text class="order-label">项目名称</text>
					<text
						class="order-value">{{ $filters.projectTitleFilter(orderInfo.orderDetailList?.[0].projectId) }}
						| {{ orderInfo.duration }} mins </text>
				</view>
				<view class="order-item">
					<text class="order-label">开始时间</text>
					<text class="order-value">{{ orderInfo.startTime.substring(0,16) }}</text>
				</view>

				<view class="order-item">
					<text class="order-label">结束时间</text>
					<text class="order-value">{{ orderInfo.endTime.substring(0,16) }}</text>
				</view>
				<view class="order-item"
					v-if="orderInfo && orderInfo.orderDetailList &&orderInfo.orderDetailList.length">
					<text class="order-label">预约人数</text>
					<text class="order-value">{{ orderInfo.orderDetailList.length }} 位</text>
				</view>
				<view v-for="(orderDetail, index) in orderInfo.orderDetailList" :key="index"
					class="order-item flex justify-center items-center">
					<view class="w-1/3">
						<text class="order-label">服务疗愈师</text>
					</view>
					<view class="w-2/3 flex justify-end items-center">
						<image @click="previewImg(orderDetail.massagist.avatarUrl)" v-if="orderDetail.massagist"
							:src="orderDetail.massagist.avatarUrl" class="w-[35rpx] h-[35rpx]"></image>
						<text class="text-[#584219] text-[26rpx]"
							v-if="orderDetail.massagist">&nbsp;&nbsp;{{ orderDetail.massagist.name }}&nbsp;&nbsp;</text>
						<image @click="toggleFavorite(orderDetail.massagist)"
							:src="orderDetail.massagist.isFavorited?'/static/icons/shoucangselect.png':'/static/icons/favorite-therapist.png'"
							class="w-[30rpx] h-[30rpx]"></image> 
						<text @click="toggleFavorite(orderDetail.massagist)"
							class="text-[#8A6A40] text-[26rpx]">&nbsp;&nbsp;{{ orderDetail.massagist.isFavorited ? '已收藏' : '收藏' }}</text>
						<image @click="toggleAvoid(orderDetail.massagist)"
							:src="orderDetail.massagist.isBlocked?'/static/icons/avoid-therapist-check.svg':'/static/icons/avoid-therapist.svg'"
							class="w-[30rpx] h-[30rpx] ml-[18rpx]"></image>
						<text @click="toggleAvoid(orderDetail.massagist)"
							:class="['text-[26rpx]', orderDetail.massagist.isBlocked ? 'text-[#7A736B]' : 'text-[#8A6A40]']">&nbsp;&nbsp;{{ orderDetail.massagist.isBlocked ? '已暂别' : '暂别' }}</text>
					</view>
				</view>

				<view class="order-item">
					<text class="order-label">疗愈时长</text>
					<text class="order-value">{{ orderInfo.duration }} mins / 位</text>
				</view>
				<view class="order-item" v-if="orderInfo.payType==4">
					<text class="order-label">支付方式</text>
					<text class="order-value"
						v-if="orderInfo.payAmount>0">现金支付</text>
					<text class="order-value"
						v-else>合并支付</text>
				</view>
				<view class="order-item" v-else>
					<text class="order-label">支付方式</text>
					<text class="order-value"
						v-if="orderInfo.payType">{{ $filters.orderPayTypeFilter(orderInfo.payType) }}</text>
					<text class="order-value"
						v-else>{{ orderInfo.payChannel == 'a_native' ? '支付宝Alipay': orderInfo.payChannel == 'wx_wap_scan' ? '微信Wechatpay':'二维码支付' }}</text>
				</view>
				<view class="order-item" v-if="!orderInfo.couponAmount&&orderInfo.payAmount>0">
					<text class="order-label">支付金额</text>
					<text class="order-value">{{orderInfo.payAmount}}元</text>
				</view>
				<view class="order-item" v-if="orderInfo.couponAmount">
					<text class="order-label">用券数量</text>
					<text class="order-value">{{ orderInfo.couponAmount }} 张</text>
				</view>
			</view>

			<!-- 门店信息卡片 -->
			<view class="store-card">
				<view class="card-title">门店信息</view>

				<view class="store-item">
					<text class="store-label">服务门店</text>
					<text class="store-value">{{ $filters.shoreNameFilter(orderInfo.shopId) }}</text>
				</view>

				<view class="store-item">
					<text class="store-label">详细地址</text>
					<text class="store-value">{{ $filters.shoreAddressFilter(orderInfo.shopId) }}</text>
					<image class="copy-icon" src="/static/icons/copy-regular.png" @click="copyShoreAddress"></image>
				</view>
			</view>


			<!-- 底部评价按钮 -->
			<!-- <view class="bottom-action">
				<button class="evaluate-btn" @click="showEvaluateModal">
					评价疗愈师（可获赠积分）
				</button>
			</view> -->


		</view>
		<view v-if="orderInfo.state == 1 && orderInfo.appointmentState == 2" class="w-full px-5 mb-5">
			<view class="review-button-container" v-if="true">
				<view class="review-reward-tag">
					<image src="/static/icons/reward-icon.png" class="reward-icon" />
					<text>评价抽奖得积分</text>
				</view>
				<view class="btnNew btn-reviewNew" @click="showEvaluateModal">
					评价本次服务
				</view>
			</view>
		</view>

		<!-- 评价弹框组件 -->
		<CommentFisrtModel ref="refCommentFisrtModel" :order="orderInfo" :therapists="orderInfo.orderDetailList.map(s=>s.massagist)" :visible="showModal"
			:orderId="orderInfo.id" :showLotteryAfterSubmit="true" @cancel="hideModal"
			@submit="handleEvaluationSubmit" />
	</view>
</template>


<script>
	import CommentFisrtModel from '../../../components/CommentFisrtModel.vue'
	import orderApi from "../../../api/order"
	import customerMassagistRelationApi from "../../../api/customerMassagistRelation"
	import customerMassagistBlockApi from "../../../api/customerMassagistBlock"
	import massagistRateApi from "../../../api/massagistRate";
	import cookie from "../../../utils/cookieUtil"
	import {
		shoreAddressFilter
	} from "../../../filters/index"
	import TopTitle from '../../../components/TopTitle.vue';

	export default {
		components: {
			CommentFisrtModel,
			TopTitle
		},
		data() {
			return {
				showModal: false,
				orderInfo: {
					id: 0,
					code: '',
					startTime: '',
					endTime: '',
					peopleCount: 1,
					duration: 0,
					payType: 2,
					couponCount: 0,
					shopId: 0,
					orderDetailList:[{projectId:0,massagist:[{isFavorited:0}]}]
				},
				therapistsObject: [{
					avatar: '',
					name: "卢新",
					rating: 3
				}],
				orderId: '',
				customBar: 0,
				statusBar: 0
			}
		},
		watch: {
			orderId: {
				handler(newVal, oldVal) {
					if (newVal) {
						this.loadOrderDetail()
					}
				},
				immediate: true
			}
		},
		onLoad(options) {
			// 获取订单ID并加载详情数据
			console.log(options)
			if (options.id) {
				this.orderId = options.id
			}
			uni.getSystemInfo({
				success: (e) => {
					// #ifdef MP-WEIXIN
					const custom = wx.getMenuButtonBoundingClientRect() // 获取小程序胶囊按钮位置信息
					this.customBar = e.statusBarHeight + 40
					this.statusBar = e.statusBarHeight + 10
					// #endif
				}
			})
		},
		computed: {
			showMassagist() {
				return (record) => {
					let show = false
					if (!record.orderDetailList) {
						return show
					}
					record.orderDetailList.forEach(s => {
						if (s.specifyType) {
							show = true
						} else if (s.state == 1 || s.state == 2) {
							show = true
						}
					})
					return show
				}
			}
		},
		methods: {
			// 加载订单详情
			async loadOrderDetail() {
				console.log("----------------------")
				await cookie.updProjectList()
				// 这里应该调用API获取订单详情
				const orderInfo = await orderApi.infoWithDetail(this.orderId) || {}
				console.log(orderInfo)
				if (!orderInfo && !orderInfo.orderDetailList && !orderInfo.orderDetailList.length) {
					return
				}
				const [relationData, blockPage] = await Promise.all([
					customerMassagistRelationApi.getList(),
					customerMassagistBlockApi.getPage({page: 1, size: 300})
				])
				const blockList = (blockPage && blockPage.list) || []
				console.log(relationData)
				orderInfo.orderDetailList.forEach(v => {
					const relation = relationData.find(s => s.massagistId == v.massagist.id)
					v.massagist.isFavorited = !!relation
					v.massagist.relationId = relation ? relation.id : null
					// 暂别与收藏互斥，同一行并列展示
					const block = blockList.find(s => s.massagistId == v.massagist.id)
					v.massagist.isBlocked = !!block
					v.massagist.blockId = block ? block.id : null
				})
				console.log(orderInfo)
				this.orderInfo = orderInfo
			},
			// 复制订单号
			copyOrderNumber() {
				uni.setClipboardData({
					data: this.orderInfo.code,
					success: () => {
						uni.showToast({
							title: '订单号已复制',
							icon: 'success'
						})
					}
				})
			},
			// 复制订单号
			copyShoreAddress() {
				uni.setClipboardData({
					data: shoreAddressFilter(this.orderInfo.shopId),
					success: () => {
						uni.showToast({
							title: '地址已复制',
							icon: 'success'
						})
					}
				})
			},

			// 切换疗愈师收藏状态
			async toggleFavorite(massagist) {
				const action = !massagist.isFavorited ? '收藏' : '取消收藏'
				if (massagist.isFavorited) {
					try {
						const res = await new Promise((resolve) => {
							uni.showModal({
								title: '提示',
								content: '确定要取消收藏吗？',
								confirmText: '确定',
								cancelText: '取消',
								success: resolve
							})
						})

						if (res.confirm) {
							await customerMassagistRelationApi.remove(massagist.relationId)
							await this.loadOrderDetail()
						}
					} catch (err) {
						console.error(err)
					}
				} else {
					// 收藏与暂别互斥：服务端会同步解除暂别
					const wasBlocked = !!massagist.isBlocked
					await customerMassagistRelationApi.createRelation(massagist.id)
					uni.showToast({
						title: `${action}成功`,
						icon: 'success'
					})
					await this.loadOrderDetail()
					if (wasBlocked) {
						setTimeout(() => {
							uni.showToast({
								title: '已同时解除暂别',
								icon: 'none'
							})
						}, 1800)
					}
				}
			},
			// 切换疗愈师暂别状态：设为暂别需确认，解除暂别即时生效
			async toggleAvoid(massagist) {
				if (!massagist) {
					return
				}
				if (massagist.isBlocked) {
					await customerMassagistBlockApi.remove(massagist.blockId)
					uni.showToast({
						title: '已恢复，可以正常预约 TA 了',
						icon: 'none'
					})
					await this.loadOrderDetail()
					return
				}
				const res = await new Promise((resolve) => {
					uni.showModal({
						title: '暂时不约 TA？',
						content: `之后预约时会自动避开「${massagist.name}」，TA 不会收到任何通知，随时可以恢复。`,
						confirmText: '暂时不约',
						cancelText: '再想想',
						confirmColor: '#7A736B',
						success: resolve
					})
				})
				if (!res.confirm) {
					return
				}
				const wasFavorited = !!massagist.isFavorited
				await customerMassagistBlockApi.createRelation(massagist.id)
				uni.showToast({
					title: '已设为暂别，之后自动避开 TA',
					icon: 'none'
				})
				await this.loadOrderDetail()
				if (wasFavorited) {
					setTimeout(() => {
						uni.showToast({
							title: '已同时取消对 TA 的收藏',
							icon: 'none'
						})
					}, 1800)
				}
			},
			previewImg(url) {
				uni.previewImage({
					urls: [url]
				})
			},
			// 显示评价弹框
			showEvaluateModal() {
				this.showModal = true
			},
			// 隐藏评价弹框
			hideModal() {
				this.showModal = false
			},

			// 处理评价提交
			async handleEvaluationSubmit(evaluationData) {
				console.log('提交评价数据:', evaluationData)

				const data = await massagistRateApi.createBatch(evaluationData)
				// 显示成功提示
				uni.showToast({
					title: '评价提交成功,即将进入抽奖页面！',
					icon: 'success',
					duration: 2000
				});
				this.loadOrderDetail()
				// 隐藏弹框
				this.hideModal()
			}
		}
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
		background-color: #584219;
		color: #FFFFFF;
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