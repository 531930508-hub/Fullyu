<template>
	<view class="evaluate-modal" v-if="visible">
		<view class="modal-content " :class="{show: modalVisible}" @click.stop>
			<view class="modal-header">
				<view class="flex items-center">
					<text class="modal-title">预约疗愈师&nbsp;&nbsp;</text>
					<image src="/static/icons/image.png" class="w-[40rpx] h-[40rpx] rounded-full"></image>
					<text class="">&nbsp;&nbsp;卢新</text>
				</view>
				<view class="close-btn" @click="handleCancel">×</view>
			</view>

			<view class="therapist-list-modal">
				<view class="text-[#584219] font-medium text-[26rpx]">
					<view class="pt-3 pb-1"> 项目类型<text class="text-[#8A6A40] text-[24rpx]">&nbsp;&nbsp; (treatment
							type)</text></view>
					<view class="treatment-types">
						<view class="treatment-type " :class="{active:0==yinxiangone}" @click="selectTreatment(0)">
							<text class="treatment-name">全感舒筋</text>
							<text class="treatment-name-en">Full Senses Massage</text>
						</view>
						<view class="treatment-type " :class="{active:1==yinxiangone}" @click="selectTreatment(1)">
							<text class="treatment-name">头部水疗</text>
							<text class="treatment-name-en">Full Head Spa</text>
						</view>
						<view class="treatment-type " :class="{active:2==yinxiangone}" @click="selectTreatment(2)">
							<text class="treatment-name">全感悦耳</text>
							<text class="treatment-name-en">Full Ear Spa</text>
						</view>
					</view>
				</view>
				<view class="text-[#584219] font-medium text-[26rpx]">
					<view class=" pb-1">放松时长<text class="text-[#8A6A40] text-[24rpx]">&nbsp;&nbsp;(Duration)</text>
					</view>
					<view class="treatment-types">
						<view v-for="item in ArrDuration" class="treatment-type "
							:class="{active:selectedDuration === item}" @click="selectDuration(item)">
							<text class="treatment-name">{{item}} mins</text>
						</view>
					</view>
				</view>
				<view class="text-[#584219] font-medium text-[26rpx]">
					<view class=" pb-1">到店日期<text class="text-[#8A6A40] text-[24rpx]">&nbsp;&nbsp;(Date)</text></view>
					<view class="treatment-types">
						<view v-for="item in ArrShopDate" class="treatment-type "
							:class="{active:selectedArrShopDate === item}" @click="selectDuration(item)">
							<text class="treatment-name">{{item}}</text>
						</view>
					</view>
				</view>
				<view class="text-[#584219] font-medium text-[26rpx]">
					<view class=" pb-1">到店时间<text class="text-[#8A6A40] text-[24rpx]">&nbsp;&nbsp;(Time)</text></view>
					<view class="time-grid">
						<view v-if="false" class="loading-container">
							<view class="loading-spinner"></view>
						</view>
						<template v-else>
							<view v-for="item in ArrShopTime" :key="item" class="time-option"
								:class="{ active: selectedArrShopTime ===item }" @click="selectArrShopTime(item)">
								<text>{{ item }}</text><!-- , widthNew: selectedArrShopTime ===item -->
								<!-- <text v-if="item=='02-09'"></text>  -->
							</view>
						</template>
					</view>
				</view>
				<view class="text-[26rpx] text-[#8A6A40] pb-4">
					备注：如本次加钟服务无法预约到原疗愈师，本店将会更换其他疗愈师为您服务
				</view>
			</view>

			<!-- 提交按钮 -->
			<view class="modal-actions shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] px-5">
				<button class="cancel-btn text-[#584291]" @click="handleCancel">取消</button>
				<button class="submit-btn" @click="handleSubmit" :disabled="!canSubmit">确定</button>
			</view>
			<view style="height: 10rpx;"></view>
		</view>
	</view>
</template>

<script>
	export default {
		name: 'AddServiceAll',
		props: {
			visible: {
				type: Boolean,
				default: false
			},
			orderId: {
				type: [String, Number],
				default: null
			}
		},
		data() {
			return {
				modalVisible: false,
				showAnimation: false,
				yinxiangone: 0,
				selectedDuration: 30,
				ArrDuration: [30, 60, 90],
				selectedArrShopDate: '02-09',
				ArrShopDate: ['02-09', '02-10', '02-11', '02-13'],
				selectedArrShopTime: '02:09', //选择到店时间
				ArrShopTime: ['02:09', '02:10', '02:11', '02:13', '02:09', '02:10', '02:11', '02:13', '02:09', '02:10',
					'02:11', '02:13', '02:09', '02:10', '02:11', '02:13', '02:09', '02:10', '02:11', '02:13', '02:09',
					'02:10',
					'02:11', '02:13'
				]
			}
		},

		computed: {

		},

		watch: {
			visible(newVal) {
				console.log(newVal)
				if (newVal) {
					this.modalVisible = true
					// 初始化疗愈师评分数据
					//this.initTherapistRatings()
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

			selectTreatment(selectValue) {
				this.yinxiangone = selectValue
				if (selectValue == 0) {
					this.ArrDuration = [30, 60, 90]
					this.selectedDuration = 30
				}
				if (selectValue == 1) {
					this.ArrDuration = [60, 90]
					this.selectedDuration = 60
				}
				if (selectValue == 2) {
					this.ArrDuration = [30, 60]
					this.selectedDuration = 30
				}
			},
			selectDuration(timeNumber) {
				this.selectedDuration = timeNumber
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
				this.$emit('update:visible', false)
				this.$emit('cancel')
			},




			// 处理取消
			handleCancel() {
				this.$emit('update:visible', false)
				this.$emit('cancel')
			},

			// 处理提交
			handleSubmit() {

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
					color: #584219;
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
				padding: 0rpx 32rpx;

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

	// 时间网格样式
	.time-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16upx;
		margin-top: 15upx;
		margin-bottom: 16rpx;
		max-height: 320rpx;
		overflow-y: auto;
		padding-right: 10rpx; // 留出右侧滚动条宽度

		&.loading {
			grid-template-columns: none;
		}

		.loading-container {
			grid-column: 1 / -1;
			display: grid;
			place-items: center;
			height: 320rpx;
		}

		.time-option {
			border-radius: 8upx;
			padding: 8upx 12upx;
			border: 2upx solid #0000001A;
			text-align: center;
			transition: all 0.3s;
			display: flex;
			align-items: center;
			justify-content: center;

			&.widthNew {
				width: 180rpx;
			}

			&.active {
				background-color: #5842191A;
				border-color: #584219;
				position: relative;

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

				text {
					color: #584219;
				}
			}

			&.disabled {
				// background-color: #F0F0F0;
				border-color: #0000000f;

				text {
					color: #00000040;
				}
			}

			text {
				font-size: 24upx;
				color: #333333;
				font-weight: 400;
			}
		}
	}

	.loading-spinner {
		border: 4px solid rgba(0, 0, 0, 0.1);
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border-left-color: #584219;
		animation: spin 1s ease infinite;
	}
</style>