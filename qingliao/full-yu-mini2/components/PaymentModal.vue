<template>
  <!-- 支付弹框 -->
  <view class="modal-overlay" v-if="visible" @click.stop>
	  <view>1111111111</view>
    <view class="payment-modal" @click.stop>
      <view class="modal-header">
        <text class="modal-title">支付方式</text>
        <view class="close-icon" @click="handleCancel"></view>
      </view>

      <view class="modal-content">
        <!-- 支付方式 -->
        <view class="payment-option" :class="{ active: selectedPayment === 'fuyu' }" @click="selectPayment('fuyu')">
          <view class="check-icon" v-if="selectedPayment === 'fuyu'"></view>
          <view class="payment-info">
            <view class="payment-icon fuyu-icon"></view>
            <view class="payment-details">
              <text class="payment-name">15mins Full愈券 <text  class="text-xs" style="color: #00000073;">({{checkoutData.canUseCouponCount || 0}}张)</text></text>
              <view class="payment-description">
                <text class="consumption-text">本次消耗</text>
                <text class="consumption-count">{{checkoutData.costCouponCount || 0}}</text>
                <text class="consumption-text">张Full愈券</text>
                <!-- <text v-if="checkoutData.costCouponCount <= checkoutData.canUseCouponCount">
                  <text class="consumption-text">核销本单后剩余</text>
                  <text class="remaining-count">{{checkoutData.canUseCouponCount - checkoutData.costCouponCount}}</text>
                  <text class="consumption-text">张</text>
                </text> -->
                <text v-if="!(checkoutData.costCouponCount <= checkoutData.canUseCouponCount)">
                  <text class="consumption-text">，不足以支付当前订单</text>
                </text>
              </view>
              <button class=" btn coupon-btn mb-1" @click.stop="goToCoupons">
                <text class="coupon-btn-text">去购券</text>
                <text class="coupon-arrow"></text>
              </button>
              <text class="text-xs" style="color: #d2956e;">现在购券可享低至62折</text>
            </view>
          </view>
        </view>

        <!-- 微信支付 -->
        <view class="payment-option" :class="{ active: selectedPayment === 'wechat' }" @click="selectPayment('wechat')">
          <view class="check-icon" v-if="selectedPayment === 'wechat'"></view>
          <view class="payment-info items-center">
            <view class="wechat-icon"></view>
            <view class="payment-details">
              <text class="payment-name">微信支付</text>
              <text class="pay-price">
                <text class="price">{{ checkoutData.order ? checkoutData.order.payAmount : 0}} 元</text>
                <text v-if="checkoutData.order && checkoutData.order.totalAmount != checkoutData.order.payAmount" class="original-price">{{ checkoutData.order.totalAmount }}元</text>
              </text>
            </view>
          </view>
        </view>
      </view>

      <view class="modal-footer">
        <!-- <button class="btn btn-cancel" @click="handleCancel">取消</button> -->
                <button class="btn btn-modify" @click="handleConfirm">
          确认 Comfirm
          <view class="countdown-timer">
            倒计时 {{ formattedCountdown }}
          </view>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref,getCurrentInstance, watch, onUnmounted, computed } from 'vue';
import orderApi from "../api/order";
import payUtils from "../utils/payUtils";
import moment from "moment";
import constant from '../consts/constant'

const {proxy} = getCurrentInstance()
const vm = proxy

// Props
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  countdown: {
    type: Number,
    default: 0
  }
});

// Emits
const emit = defineEmits(['update:visible', 'confirm', 'cancel']);

const countdown = ref(0);
let timer = null;

const formattedCountdown = computed(() => {
  const seconds = countdown.value;
  let hours = parseInt(seconds / 3600);
  let min = parseInt((seconds % 3600) / 60);
  let second = seconds % 60;

  hours = hours < 10 ? '0' + hours : hours;
  min = min < 10 ? '0' + min : min;
  second = second < 10 ? '0' + second : second;

  return hours + ':' + min + ':' + second;
});

const startCountdown = () => {
  if (props.countdown){
    countdown.value = props.countdown;
  }else {
    countdown.value = constant.payCutDownSeconds;
  }
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value--;
    } else {
      stopCountdown();
      handleCancel();
    }
  }, 1000);
};

const stopCountdown = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

watch(() => props.visible, (newVal) => {
  if (newVal) {
    startCountdown();
  } else {
    stopCountdown();
  }
});

onUnmounted(() => {
  stopCountdown();
});

// 选中的支付方式
const selectedPayment = ref('fuyu');

const checkoutData = ref({
  canUseCouponCount: 0,
  costCouponCount: 0,
  order: {},
})


// 选择支付方式
const selectPayment = (type) => {
  selectedPayment.value = type;
};

// 去购券
const goToCoupons = () => {
  let order = checkoutData.value.order
  if (!order || !order.id) {
    uni.showToast({
      duration: 3000,
      icon: 'none',
      title: '订单信息缺失, 请重新操作'
    })
    return
  }
  if (order.overTimeSeconds){
    const currentTime = moment();
    const createTime = moment(order.createTime);
    const newCreateTime = createTime.add(order.overTimeSeconds, 'seconds');
    const diffInSeconds = newCreateTime.diff(currentTime, 'seconds');
    if (diffInSeconds > 0){
      vm.$Cache.put('waitOrderId', order.id, diffInSeconds)
    }
  }else {
    vm.$Cache.put('waitOrderId', order.id, constant.payCutDownSeconds)
  }
  uni.navigateTo({
    url: '/pages/mall/mall'
  });
  emit('update:visible', false);
};

// 处理取消
const handleCancel = () => {
  emit('update:visible', false);
  emit('cancel');
};

// 处理确认
const handleConfirm = async () => {

  let order = checkoutData.value.order
  if (!order || !order.id) {
    uni.showToast({
      duration: 3000,
      icon: 'none',
      title: '订单信息缺失, 请重新操作'
    })
    return
  }
  // 发起支付
  if (selectedPayment.value === 'fuyu') {
    // 券包
    await orderApi.payCheckout(order.id, 2)

    uni.showToast({
      title: '预约成功！期待即将与您开启一段Full愈旅程~',
      icon: 'none',
      duration: 3000,
    })

    emit('confirm', );
    emit('update:visible', false);
  } else {
	  console.log("+++++++++")
    uni.showLoading({
      title: '处理中',
      mask: true,
    })
    // 付费
    let cbFunc = {
      success: () => {
        uni.showToast({
          title: '预约成功！期待即将与您开启一段Full愈旅程~',
          icon: 'none',
          duration: 3000,
        })

        emit('confirm', );
        emit('update:visible', false);
      },
    }

    await orderApi.payCheckout(order.id, 1)
    await payUtils.genPayInfo(order.id, cbFunc)
  }
};

const fetchData = async (orderId) => {
  // 获取可用券次数
  // 获取订单信息
  uni.showLoading({
    title: '处理中',
    mask: true,
  })
  let data = await orderApi.getCheckoutData(orderId) || {
    canUseCouponCount: 0,
    costCouponCount: 0,
    order: {},
  }
  checkoutData.value = data
  if (!data.canUseCouponCount || data.canUseCouponCount < data.costCouponCount) {
    vm.$Cache.remove('waitOrderId')
    selectedPayment.value = 'wechat'
    uni.hideLoading();
  } else if (countdown.value > 0) {
    const waitOrderId = vm.$Cache.get('waitOrderId')
    vm.$Cache.remove('waitOrderId')
    //是否自动支付
    if (!waitOrderId || waitOrderId != orderId){
      uni.hideLoading();
      return
    }
    uni.showLoading({
      title: '自动支付',
      mask: true,
    })
    setTimeout(() => {
      handleConfirm()
    },1000)
  }
}
defineExpose({ fetchData });
</script>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 5000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.payment-modal {
  width: 100%;
  max-height: 80vh;
  background-color: white;
  border-radius: 32rpx 32rpx 0 0;
  padding: 0;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.modal-header {
  padding: 44rpx 48rpx 36rpx;
  border-bottom: 2rpx solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .modal-title {
    font-size: 34rpx;
    font-weight: 600;
  }

  .close-icon {
    width: 36rpx;
    height: 36rpx;
    background: url('~@/static/icons/close.svg') no-repeat 0 0;
    background-size: cover;
  }
}

.modal-content {
  padding:48rpx;
}

.payment-option {
  border: 2upx solid #e5e5e5;
  border-radius: 16upx;
  padding: 32rpx 20rpx;
  margin-bottom: 20upx;
  display: flex;
  align-items: center;
  position: relative;
  background-color: #fff;
  transition: all 0.3s ease;

  &.active {
    border-color: #A18341;
    background-color: #faf9f7;

    .check-icon {
      position: absolute;
      top: 0;
      right: 0;
      width: 0;
      height: 0;
      border-top: 40rpx solid #A18341;
      border-right: 40rpx solid #A18341;
      border-bottom: 40rpx solid transparent;
      border-left: 40rpx solid transparent;
      border-top-right-radius: 10rpx;

      &::after {
        content: '';
        width: 36upx;
        height: 36upx;
        background: url('~@/static/icons/check-solid.svg') no-repeat;
        position: absolute;
        top: -28rpx;
        right: -36rpx;
        color: #fff;
      }
    }
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.payment-info {
  display: flex;
  flex: 1;
}

.payment-icon {
  width: 48rpx;
  height: 48rpx;
  margin-right: 24rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: bold;

  &.fuyu-icon {
    background-color: #C5B69D;
    color: white;
  }
}

.wechat-icon {
  width: 40rpx;
  height: 40rpx;
  background: url('~@/static/icons/wechat-pay.png') no-repeat 0 0;
  background-size: cover;
  margin-right: 24upx;
}

.payment-details {
  flex: 1;
}

.payment-name {
  font-size: 32rpx;
  font-weight: 600;
}

.pay-price {
  text-align: right;

  .price {
    color: #fa5151;
    font-size: 34upx;
    margin-left: 24upx;
  }

  .original-price {
    margin-left: 5px;
    font-size: 26upx;
    color: #D2956E;
    text-decoration: line-through;
  }
}

.payment-description {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 16upx;
  margin-bottom: 16rpx;
  width: max-content;

  .consumption-text {
    font-size: 28rpx;
    // color: #666;
  }

  .consumption-count,
  .remaining-count {
    font-size: 24rpx;
    color: #E53E3E;
    font-weight: 600;
    margin: 0 4rpx;
  }
}

.coupon-btn {
  width: 150upx;
  display: flex;
  margin-left: 0;
  align-items: center;
  background-color: #584219;
  padding: 10rpx 24rpx;
  border: none;
  border-radius: 8upx;

  .coupon-btn-text {
    font-size: 24rpx;
    color: white;
    margin-right: 8rpx;
  }

  .coupon-arrow {
    width: 12rpx;
    height: 12rpx;
    border-top: 2rpx solid #fff;
    border-right: 2rpx solid #fff;
    transform: rotate(45deg);
    display: inline-block;
  }
}

.modal-footer {
  display: flex;
  padding: 32rpx 48rpx;
  gap: 24rpx;

  .btn-modify,
  .btn-cancel {
    flex: 1;
    padding-top: 24upx;
    padding-bottom: 24upx;
    font-size: 32rpx;
    font-weight: 500;
  }

  .btn-modify {
    position: relative;
    overflow: visible;
  }
}

.countdown-timer {
  position: absolute;
  top: -20rpx;
  right: -20rpx;
  background-color: #fde2e2;
  color: #f56c6c;
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
  font-size: 20rpx;
  line-height: 1.2;
  white-space: nowrap;
}
</style>
