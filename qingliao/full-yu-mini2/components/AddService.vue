<template>
	<view class="evaluate-modal" v-if="visible">
		<view class="modal-content " :class="{show: modalVisible}" @click.stop>
			<view class="modal-header">
				<text class="modal-title">加钟</text>
				<view class="close-btn" @click="handleCancel">×</view>
			</view>

			<view class="therapist-list-modal">
				<view class="text-[#584219] font-medium text-[26rpx]">
					<view class="pt-3 pb-1"> 项目类型<text class="text-[#8A6A40] text-[24rpx]">&nbsp;&nbsp; (Treatment
							Type)</text></view>
					<view class="treatment-types">
						<view class="treatment-type " :class="{active:0==yinxiangone}" @click="selectTreatment(0)">
							<text class="treatment-name">全感舒筋</text>
							<text class="treatment-name-en text-[20rpx]">Full Senses Massage</text>
						</view>
						<view class="treatment-type " :class="{active:1==yinxiangone}" @click="selectTreatment(1)">
							<text class="treatment-name">头部水疗</text>
							<text class="treatment-name-en text-[20rpx]">Full Head Spa</text>
						</view>
						<view class="treatment-type " :class="{active:2==yinxiangone}" @click="selectTreatment(2)">
							<text class="treatment-name">全感悦耳</text>
							<text class="treatment-name-en text-[20rpx]">Full Ear Spa</text>
						</view>
					</view>
					<view>
						<text>{{ArrDurationDescr[yinxiangone]}}</text>
					</view>
				</view>
				<view class="text-[#584219] font-medium text-[26rpx]">
					<view class="pt-3 pb-1">放松时长<text class="text-[#8A6A40] text-[24rpx]">&nbsp;&nbsp;(Duration)</text>
					</view>
					<view class="treatment-types">
						<view v-for="(item,index1) in ArrDuration" :key="index1" class="treatment-type "
							:class="{active:selectedDuration === item}" @click="selectDuration(item)">
							<text class="treatment-name">{{item}} mins</text>
						</view>

					</view>
					<view>
						<text>{{ArrDurationminDesr}}</text>
					</view>
				</view>
				<view class="text-[26rpx] text-[#8A6A40] pb-4 pt-2">
					备注：加钟服务优先由原疗愈师为您延续。若原疗愈师时段已被预约，我们将为您安排其他疗愈师，确保您的服务品质无缝衔接。
				</view>
			</view>

			<!-- 提交按钮 -->
			<view class="modal-actions shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] px-5">
				<button class="cancel-btn text-[#584291]" @click="handleCancel">取消</button>
				<button class="submit-btn" @click="handleSubmit">确定</button>
			</view>
			<view style="height: 10rpx;"></view>
		</view>
	</view>
</template>

<script>
	export default {
		name: 'AddService',
		props: {
			visible: {
				type: Boolean,
				default: false
			},
			order: {
				type: Object,
				default: []
			}
		},
		data() {
			return {
				modalVisible: false,
				showAnimation: false,
				yinxiangone: 0,
				selectedDuration: 30,
				ArrDuration: [30, 60, 90],
				ArrDurationminDesr: '零重力单点深释｜头 / 眼 / 面 / 肩颈 / 手臂 / 小腿任选1个',
				ArrDurationDescr: ['沉浸式头部护理体验，结合头皮清洁与按摩，在沉浸场域与正念调节中释放头部压力', '在沉浸场域与正念调节中，针对身体不同部位进行放松护理，每30分钟专注一个部位：肩颈 / 头部 / 眼部 / 面部 / 手臂 / 小腿','专业耳部清洁与放松护理，在沉浸场域与正念调节中，释放耳部压力']
			}
		},

		computed: {

		},

		watch: {
			visible(newVal) {
				console.log(newVal)
				if (newVal) {
					this.modalVisible = true
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
			}
		},

		methods: {

			selectTreatment(selectValue) {
				this.yinxiangone = selectValue
				console.log(selectValue)
				console.log(this.selectedDuration)
				if (selectValue == 0) {
					this.ArrDuration = [30, 60, 90]
					this.selectedDuration = 30
				}
				if (selectValue == 1) {
					this.ArrDuration = [30, 60, 90]
					this.selectedDuration = 30
				}
				if (selectValue == 2) {
					this.ArrDuration = [30, 60]
					this.selectedDuration = 30
				}
				this.selectMinText()
			},
			selectDuration(timeNumber) {
				this.selectedDuration = timeNumber
				this.selectMinText()
			},
			selectMinText() {
				if (this.yinxiangone == 0 && this.selectedDuration == 30) {
					this.ArrDurationminDesr = '零重力单点深释｜头 / 眼 / 面 / 肩颈 / 手臂 / 小腿任选1个'
				}
				if (this.yinxiangone == 0 && this.selectedDuration == 60) {
					this.ArrDurationminDesr = '零重力双区联动｜任选2个部位组合疗愈'
				}
				if (this.yinxiangone == 0 && this.selectedDuration == 90) {
					this.ArrDurationminDesr = '零重力三轴重塑｜任选3个部位深度修复'
				}
				if (this.yinxiangone == 1 && this.selectedDuration == 30) {
					this.ArrDurationminDesr = '洗护 + 吹干｜碎片时间快速清爽'
				}
				if (this.yinxiangone == 1 && this.selectedDuration == 60) {
					this.ArrDurationminDesr = '洗护 + 吹干｜碎片时间快速清爽 + 神经放松 + 普洱茶汤水循环｜标准疗愈体验'
				}
				if (this.yinxiangone == 1 && this.selectedDuration == 90) {
					this.ArrDurationminDesr = '洗护 + 吹干｜碎片时间快速清爽 + 神经放松 + 普洱茶汤水循环｜标准疗愈体验 + 眉心滴油深愈｜深度修复'
				}
				if (this.yinxiangone == 2 && this.selectedDuration == 30) {
					this.ArrDurationminDesr = '基础清洁 + 神经速调｜快放松优先，清洁为维护级'
				}
				if (this.yinxiangone == 2 && this.selectedDuration == 60) {
					this.ArrDurationminDesr = '精采深洁 + 颅息放松｜清洁疗愈双达标'
				}

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
				console.log(this.order.id)
				console.log(this.selectedDuration)
				console.log(this.yinxiangone)
				// 构建加钟数据
				const serviceData = {
					orderId: this.order.id,
					duration: this.selectedDuration,
					yinxiangone: this.yinxiangone,
					order: this.order
				}
				this.$emit('update:visible', false)
				this.$emit('submit', serviceData)
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
			margin-bottom: 20upx;
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
</style>