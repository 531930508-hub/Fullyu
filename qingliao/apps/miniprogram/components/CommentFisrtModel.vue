<template>
	<view class="evaluate-modal" :class="localeClass()" v-if="visible" @click="handleCancel">
		<view class="modal-content" :class="{show: modalVisible,slowdisplay:!visible}" @click.stop>
			<view class="modal-header">
				<text class="modal-title">{{ t('订单评价') }}</text>
				<view class="close-btn" @click="handleCancel">×</view>
			</view>

			<view class="therapist-list-modal">
				<view class="flex justify-center items-center">
					<image class="therapist-avatar-modal rounded-full w-[100rpx] h-[100rpx]"
						:src="therapistRatings[0].avatar"></image>
				</view>
				<view class="text-center  text-[#584219] text-[34rpx] mt-2">{{therapistRatings[0].name}}</view>
				<view class="text-center  text-[#8A6A40] text-[26rpx] mt-1">{{t(order.productTitle)}} {{order.duration}}mins
				</view>
				<view class="text-center  text-[#584219] text-[28rpx] mt-3">{{ t('请对本次服务进行评价') }}</view>
				<view class="therapist-item-modal">
					<view class="star-rating">
						<view class="star-item" v-for="star in 5" :key="star" @click="setRating(star)"
							:class="{ 'active': star <= (therapistRatings[0].rating || 0) }">
							★
						</view>
					</view>
				</view>
				<view v-if="commentDisplayStatu" class="text-[#584219] font-medium text-[26rpx]">
					<view class="pt-3 pb-1">{{ t('请选择您对疗愈师的印象') }}</view>
					<view class="treatment-types">
						<view class="treatment-type " :class="{active:0==yinxiangone}" @click="selectTreatment(0)">
							<text class="treatment-name">{{ t('很不错') }}</text>
						</view>
						<view class="treatment-type " :class="{active:1==yinxiangone}" @click="selectTreatment(1)">
							<text class="treatment-name">{{ t('一般般') }}</text>
						</view>
						<view class="treatment-type " :class="{active:2==yinxiangone}" @click="selectTreatment(2)">
							<text class="treatment-name">{{ t('比较差') }}</text>
						</view>
					</view>
					<view>{{ t('您对本次服务的印象是') }}</view>
					<view class="treatment-types">
						<view class="treatment-type " :class="{active:0==yinxiangtwo}" @click="selectTreatmentTwo(0)">
							<text class="treatment-name">{{ t('很不错') }}</text>
						</view>
						<view class="treatment-type " :class="{active:1==yinxiangtwo}" @click="selectTreatmentTwo(1)">
							<text class="treatment-name">{{ t('一般般') }}</text>
						</view>
						<view class="treatment-type " :class="{active:2==yinxiangtwo}" @click="selectTreatmentTwo(2)">
							<text class="treatment-name">{{ t('比较差') }}</text>
						</view>
					</view>
					<view>{{ t('我们很重视也很乐意倾听您的反馈，请留下您的宝贵建议。') }}</view>
					<view style="color: #8A6A40;">
						<textarea :focus="textareaFocus" v-model="evaluateComment" type="text" :placeholder="t('请输入您的宝贵建议!')"
							class="rounded-md px-2 py-3 w-full" style="height: 160rpx;font-size: 26rpx; "
							placeholder-style="color:#8A6A40;font-size:13px;font-weight:100">
							   </textarea>
						<view class="flex justify-end items-center">
							<image mode="widthFix" class="w-[32rpx] h-[32rpx]" src="/static/icons/edit.png"></image>
							<text class="text-[26rpx] text-[#8A6A40]"
								@click="getEditFocus">{{ t('&nbsp;点击编辑评价&nbsp;&nbsp;&nbsp;') }}</text>
						</view>
					</view>
				</view>
			</view>

			<!-- 提交按钮 -->
			<view class="modal-actions shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] px-5">
				<button class="cancel-btn text-[#584291]" @click="handleCancel">{{ t('取消') }}</button>
				<button class="submit-btn" @click="handleSubmit" :disabled="!canSubmit">{{ t('确定') }}</button>
			</view>
			<view style="height: 10rpx;"></view>
		</view>
	</view>
</template>



<script>
	import { t } from '../utils/locale'

	export default {
		name: 'CommentFisrtModel',
		props: {
			visible: {
				type: Boolean,
				default: false
			},
			therapists: {
				type: Array,
				default: () => []
			},
			orderId: {
				type: [String, Number],
				default: null
			},
			order: {
				type: Object,
				default: () => []
			},
			// 是否在提交后跳转到抽奖页面
			showLotteryAfterSubmit: {
				type: Boolean,
				default: false
			}
		},
		data() {
			return {
				modalVisible: false,
				showAnimation: false,
				evaluateComment: '',
				therapistRatings: [],
				yinxiangone: 0,
				yinxiangtwo: 0,
				textareaFocus: false,
				orderInfoObject: [],
				commentDisplayStatu: false,
				// 提交中：防止连点重复提交评价（重复评会影响疗愈师评分）
				submitting: false
			}
		},

		computed: {
			// 检查是否可以提交评价f
			canSubmit() {
				//return this.therapistRatings.some(therapist => therapist.rating > 0)
				return true
			}
		},

		watch: {
			visible(newVal) {
				if (newVal) {
					this.submitting = false
					this.modalVisible = true
					// 初始化疗愈师评分数据
					this.initTherapistRatings()
					this.$nextTick(() => {
						setTimeout(() => {
							this.showAnimation = true
						}, 50)
					})
				} else {
					this.showAnimation = false
					setTimeout(() => {
						this.modalVisible = false
						//this.resetForm()
					}, 300)
				}
			},
			therapists: {
				handler() {
					//this.initTherapistRatings()
				},
				immediate: true
			}
		},

		methods: {
			// 初始化疗愈师评分数据
			initTherapistRatings() {
				if (this.therapists && this.therapists.length > 0) {

					this.therapistRatings = this.therapists.map(therapist => ({
						id: therapist.id || therapist.name, // 使用id或name作为标识
						name: therapist.name,
						avatar: therapist.avatarUrl,
						rating: 0
					}))
				}
			},
			getEditFocus() {
				this.textareaFocus = true
			},
			//评价内容
			// 选择项目类型
			selectTreatment(selectValue) {
				this.yinxiangone = selectValue
			},
			selectTreatmentTwo(selectValue) {
				this.yinxiangtwo = selectValue
			},

			// 显示弹框
			showModal() {
				// 延迟显示动画，确保DOM已渲染
				this.$nextTick(() => {
					setTimeout(() => {
						this.modalVisible = true
					}, 50)
				})
			},

			// 隐藏弹框
			hideModal() {
				this.commentDisplayStatu = false
				this.$emit('update:visible', false)
				this.$emit('cancel')
			},

			// 重置表单
			resetForm() {
				this.commentDisplayStatu = false
				this.evaluateComment = ''
				this.therapistRatings.forEach(therapist => {
					therapist.rating = 0
				})
			},

			// 设置疗愈师评分
			setRating(rating) {
				console.log("---------------")
				if (rating < 5) {
					this.commentDisplayStatu = true
				} else {
					this.commentDisplayStatu = false
				}
				this.therapistRatings[0].rating = rating
			},

			// 处理取消
			handleCancel() {
				this.commentDisplayStatu = false
				this.$emit('update:visible', false)
				this.$emit('cancel')
			},

			// 处理提交
			handleSubmit() {
				if (this.submitting) return
				// 订单明细里可能没有疗愈师，therapistRatings 为空时直接取 [0] 会崩
				if (!this.therapistRatings.length) {
					uni.showToast({
						title: t('暂无可评价的疗愈师'),
						icon: 'none'
					})
					return
				}
				// 检查是否至少有一个疗愈师被评分
				const hasRating = this.therapistRatings[0].rating > 0

				if (!hasRating) {
					uni.showToast({
						title: t('请为疗愈师评分'),
						icon: 'none'
					})
					return
				}
				this.submitting = true
				// 构建评价数据
				const evaluationData = {
					orderId: this.orderId,
					therapistRatings: this.therapistRatings.map(therapist => ({
						massagistId: therapist.id,
						rating: therapist.rating,
						name: therapist.name
					})).filter(item => item.rating > 0),
					comment: this.evaluateComment,
					peopleScore:(this.yinxiangone+1),
					serviceScore:(this.yinxiangtwo+1)
				}
 
				// 只负责把数据抛给业务页，成功提示与抽奖由业务页在接口成功后再触发
				this.$emit('submit', evaluationData)
			},
			// 业务页评价接口成功后调用：统一收口「成功提示 + 抽奖入口」
			confirmSubmitted(orderId) {
				this.submitting = false
				uni.showToast({
					title: t('评价提交成功！'),
					icon: 'success',
					duration: 1000
				})
				if (this.showLotteryAfterSubmit) {
					setTimeout(() => {
						uni.navigateTo({
							url: '/pages/user/lottery?orderId=' + (orderId || this.orderId)
						})
					}, 1000)
				}
			},
			// 业务页评价接口失败后调用：解锁按钮，允许重新提交
			cancelSubmitting() {
				this.submitting = false
			}
		}
	}
</script>

<style lang="scss" scoped>
	// 项目类型样式
	.treatment-types {
		margin-top: 16upx;
		display: flex;
		gap: 24upx;


		.treatment-type {
			color: #584219;
			flex: 1;
			border-radius: 8upx;
			padding: 10upx 0;
			border: 2upx solid #0000001A;
			transition: all 0.3s;
			margin-bottom: 32upx;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			min-height: 80upx;
			position: relative;

			&.active {
				background-color: #5842191A;
				border-color: #584219;

				&::after {
					content: '';
					width: 22upx;
					height: 22upx;
					background: url('~@/static/icons/check-solid.svg') no-repeat center, #584219;
					background-size: 14upx 14upx, cover;
					border-top-right-radius: 4upx;
					border-bottom-left-radius: 8upx;
					position: absolute;
					top: 0;
					right: 0;
					color: #fff;
				}

				.treatment-name,
				.treatment-name-en {
					color: #584219;
				}
			}

			.treatment-name {
				font-size: 26upx;
				font-weight: 500;
				color: #584219;
			}

		}
	}


	// 评价弹框
	.evaluate-modal {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 1000;

		.slowdisplay {
			animation: fadeOut 0.3s forwards;

			@keyframes fadeOut {
				from {
					transform: translateY(0);
				}

				to {
					transform: translateY(100%);
				}
			}

		}

		.modal-content {
			background: white;
			border-radius: 20upx 20upx 0 0;
			width: 100%;
			max-height: 80vh;
			overflow-y: auto;
			transform: translateY(100%);
			transition: transform 0.3s ease-out;
			animation: slideUp 0.3s ease-out;

			@keyframes slideUp {
				from {
					transform: translateY(100%);
				}

				to {
					transform: translateY(0);
				}
			}

			&.show {
				transform: translateY(0);
			}

			.modal-header {
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 32upx;
				border-bottom: 1upx solid #f5f5f5;

				.modal-title {
					font-size: 32upx;
					font-weight: bold;
					color: #333;
				}

				.close-btn {
					width: 48upx;
					height: 48upx;
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 36upx;
					color: #999;
					cursor: pointer;
				}
			}

			.therapist-list-modal {
				padding: 32upx;

				.therapist-item-modal {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 18upx 0;
					border-bottom: 1upx solid #f5f5f5;

					&:last-child {
						border-bottom: none;
					}

					.therapist-info-modal {
						display: flex;
						align-items: center;

						.therapist-avatar-modal {
							width: 60upx;
							height: 60upx;
							border-radius: 50%;
							margin-right: 16upx;
						}

						.therapist-name-modal {
							font-size: 28upx;
							color: #333;
							font-weight: 500;
						}
					}

					.star-rating {
						display: flex;
						align-items: center;
						width: 100%;
						justify-content: center;

						.star-item {
							font-size: 40rpx;
							color: #ddd;
							margin: 0 4upx;
							cursor: pointer;
							transition: color 0.2s;

							&.active {
								color: #ffa500;
							}
						}
					}
				}
			}

			.comment-section {
				padding: 0 32upx 32upx;

				.comment-label {
					display: block;
					font-size: 28upx;
					color: #333;
					margin-bottom: 16upx;
					font-weight: 500;
				}

				.comment-input {
					width: 100%;
					min-height: 120upx;
					padding: 16upx;
					border: 1upx solid #e5e5e5;
					border-radius: 12upx;
					font-size: 26upx;
					color: #333;
					background: #fafafa;
					box-sizing: border-box;

					&::placeholder {
						color: #999;
					}
				}
			}

			.modal-actions {
				display: flex;
				padding: 32upx 32upx;
				gap: 20upx;

				.cancel-btn,
				.submit-btn {
					flex: 1;
					height: 80upx;
					border-radius: 12upx;
					font-size: 28upx;
					border: 2rpx solid #584219;
					display: flex;
					align-items: center;
					justify-content: center;

				}

				.cancel-btn {
					background: #f5f5f5;
					color: #666;
				}

				.submit-btn {
					background: #584219;
					color: white;

					&:disabled {
						background: #ccc;
						color: #999;
					}
				}
			}
		}
	}
</style>