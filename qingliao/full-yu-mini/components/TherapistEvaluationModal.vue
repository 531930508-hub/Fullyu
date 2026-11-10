<template>
  <view class="evaluate-modal" v-if="visible" @click="handleCancel">
    <view class="modal-content" :class="{show: modalVisible}" @click.stop>
      <view class="modal-header">
        <text class="modal-title">评价疗愈师</text>
        <view class="close-btn" @click="handleCancel">×</view>
      </view>

      <view class="therapist-list-modal">
        <view class="therapist-item-modal" v-for="(therapist, index) in therapistRatings" :key="index">
          <view class="therapist-info-modal">
            <image class="therapist-avatar-modal" :src="therapist.avatar"></image>
            <text class="therapist-name-modal">{{ therapist.name }}</text>
          </view>

          <!-- 星级评价 -->
          <view class="star-rating">
            <view class="star-item"
                  v-for="star in 5"
                  :key="star"
                  @click="setRating(index, star)"
                  :class="{ 'active': star <= (therapist.rating || 0) }">
              ★
            </view>
          </view>
        </view>
      </view>

      <!-- 文字评价 -->
      <!-- <view class="comment-section">
        <text class="comment-label">评价内容</text>
        <textarea class="comment-input"
                 v-model="evaluateComment"
                 placeholder="请输入您的评价内容（选填）"
                 maxlength="200"></textarea>
      </view> -->

      <!-- 提交按钮 -->
      <view class="modal-actions">
        <button class="cancel-btn" @click="handleCancel">取消</button>
        <button class="submit-btn" @click="handleSubmit" :disabled="!canSubmit">提交</button>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'TherapistEvaluationModal',
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
      therapistRatings: []
    }
  },

  computed: {
    // 检查是否可以提交评价
    canSubmit() {
      return this.therapistRatings.some(therapist => therapist.rating > 0)
    }
  },

  watch: {
    visible(newVal) {
      if (newVal) {
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
          this.resetForm()
        }, 300)
      }
    },
    therapists: {
       handler() {
         this.initTherapistRatings()
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

    // 重置表单
    resetForm() {
      this.evaluateComment = ''
      this.therapistRatings.forEach(therapist => {
        therapist.rating = 0
      })
    },

    // 设置疗愈师评分
    setRating(therapistIndex, rating) {
      this.therapistRatings[therapistIndex].rating = rating
    },

    // 处理取消
    handleCancel() {
      this.$emit('update:visible', false)
      this.$emit('cancel')
    },

    // 处理提交
    handleSubmit() {
      // 检查是否至少有一个疗愈师被评分
      const hasRating = this.therapistRatings.some(therapist => therapist.rating > 0)

      if (!hasRating) {
        uni.showToast({
          title: '请至少为一位疗愈师评分',
          icon: 'none'
        })
        return
      }
      // 构建评价数据
      const evaluationData = {
        orderId: this.orderId,
        therapistRatings: this.therapistRatings.map(therapist => ({
          massagistId: therapist.id,
          rating: therapist.rating,
          name: therapist.name
        })).filter(item => item.rating > 0),
        comment: this.evaluateComment
      }

      // 触发提交事件
      this.$emit('submit', evaluationData)

      // 关闭弹框
      this.$emit('update:visible', false)

      // 显示成功提示
      uni.showToast({
        title: '评价提交成功',
        icon: 'success',
        duration: 2000
      })
      // 如果需要跳转到抽奖页面
      if (this.showLotteryAfterSubmit) {
        setTimeout(() => {
          uni.navigateTo({
            url: '/pages/user/lottery?orderId='+evaluationData.orderId
          })
        }, 2000)
      }
    }
  }
}
</script>

<style lang="scss" scoped>
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
        padding: 24upx 0;
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

          .star-item {
            font-size: 34upx;
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
      padding: 0 32upx 32upx;
      gap: 20upx;

      .cancel-btn,
      .submit-btn {
        flex: 1;
        height: 80upx;
        border-radius: 12upx;
        font-size: 28upx;
        border: none;
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
