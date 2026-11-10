<template>
  <view class="coupon-container flex flex-col relative pb-4" @click="closeTooltip">
    <view v-if="isLoading" class="flex-grow flex items-center justify-center">
      <view class="text-[#b8b8b8] text-base">加载中...</view>
    </view>
    <view v-else-if="couponList.length === 0" class="flex-grow flex items-center justify-center">
      <empty-data title="暂无可用券" class="mt-[100rpx]">
        <button class="btn btn-cancel mt-2" @click="handlePurchaseCoupon()">去购券</button>
      </empty-data>
    </view>
    <view v-else class="space-y-4">
      <view class="expired-toggle2">
        <text>可用券 {{ couponTotal }} 张</text>
        <text class="mx-1" style="color: #584219;">一共可享受 {{couponTotal*15}}mins Full愈时刻</text>
      </view>
      <view v-if="showAvailable" class="space-y-4">
        <view v-for="(coupon, index) in couponList" :key="index" class="coupon-card-wrapper">
          <view class="coupon-card" :class="{ 'disabled': coupon.state !== 1 }">
            <image v-if="!coupon.orderId || coupon.type > 0" class="w-14 h-14 absolute" style="left: -4px;top: -4px;" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/present.png"/>
            <view class="coupon-left">
              <view class="coupon-title">
                <image class="w-[180rpx] h-[48rpx]" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/coupon-text.png" mode="aspectFit"/>
              </view>
              <view class="coupon-info">券号: {{ coupon.code }}</view>
              <view class="coupon-info">有效期: {{ formatDate(coupon.endTime) }}
                <view v-if="coupon.type > 0" class="relative inline-block ml-1">
                  <img src="/static/icons/circle-question-solid.svg" class="w-3 h-3 align-text-top" @click.stop="toggleTooltip(index)"/>
                  <view v-if="activeTooltipIndex === index" class="tooltip-box">
                    {{`${coupon.typeLabel}，${coupon.createTime.substring(0,10)}获得`}}
                    <view class="tooltip-arrow"></view>
                  </view>
                </view>
              </view>
            </view>
            <view class="coupon-right">
              <image src="/static/icons/15mins.png" class="coupon-mins-img" mode="aspectFit"/>
              <button class="btn use-btn" :disabled="coupon.state !== 1" @click="handleBookAppointment(coupon)">立即使用</button>
            </view>
            <view v-if="coupon.state !== 1" class="expired-stamp">
              <image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/expire.png" class="expired-img" />
            </view>
          </view>
        </view>
      </view>

      <!-- Expired Coupons Section -->
      <view v-if="expiredCouponList.length > 0" class="expired-section">
        <view class="expired-toggle" @click="toggleExpired">
          <text>失效券 {{ expiredCouponTotal }} 张</text>
          <text class="ml-4 mr-1" style="color: #584219;">{{ showExpired? '收起' : '展开' }}</text>
          <image :class="['arrow-icon', { 'expanded': showExpired }]" src="/static/icons/arrow-right.png" mode="aspectFit" />
        </view>
        <view v-if="showExpired" class="space-y-4 mt-4">
          <view v-for="(coupon, index) in expiredCouponList" :key="index" class="coupon-card-wrapper">
            <view class="coupon-card" :class="{ 'disabled': coupon.state !== 1 }">
              <image v-if="!coupon.orderId" class="w-14 h-14 absolute" style="left: -4px;top: -4px;" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/present-2.png"/>
              <view class="coupon-left">
                <view class="coupon-title">
                  <image class="w-[180rpx] h-[48rpx]" src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/coupon-text.png" mode="aspectFit"/>
                </view>
                <view class="coupon-info">券号: {{ coupon.code }}</view>
                <view class="coupon-info">有效期: {{ formatDate(coupon.endTime) }}</view>
              </view>
              <view class="coupon-right">
                <image src="/static/icons/15mins.png" class="coupon-mins-img" mode="aspectFit"/>
                <button class="btn use-btn" :disabled="coupon.state !== 1" @click="handleBookAppointment(coupon)">立即使用</button>
              </view>
              <view v-if="coupon.state === 2" class="expired-stamp">
                <image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/expire.png" class="expired-img" />
              </view>
              <view v-else-if="coupon.state === 0" class="expired-stamp">
                <image src="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/used.png" class="expired-img" />
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 预约弹框组件 -->
    <AppointmentModal
        v-model:visible="showAppointmentModal"
        title="预约服务"
        @confirm="handleAppointmentConfirm"
        @cancel="handleAppointmentCancel"
    />

    <!-- 支付弹框组件 -->
    <PaymentModal
        v-model:visible="showPaymentModal"
        ref="paymentModalRef"
        @confirm="handlePaymentConfirm"
        @cancel="handlePaymentCancel"/>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted, toRefs,getCurrentInstance } from 'vue';

import EmptyData from './empty-data.vue';
import cookie from "../utils/cookieUtil"
import customerCouponApi from '../api/customerCoupon.js';
import AppointmentModal from '@/components/AppointmentModal.vue';
import PaymentModal from '@/components/PaymentModal.vue';
import orderApi from "../api/order";
import constant from "../consts/constant";

const {proxy} = getCurrentInstance()
const vm = proxy

// 支付弹框显示状态
const showPaymentModal = ref(false);
const paymentModalRef = ref(null)
const activeTooltipIndex = ref(-1);

const emit = defineEmits(['handlePurchaseCoupon'])

//我的券
const couponData = reactive({
  couponList: [],
  couponTotal: 0,
  expiredCouponList: [],
  expiredCouponTotal: 0
})
const {couponList, couponTotal, expiredCouponList, expiredCouponTotal} = toRefs(couponData)
const isLoading = ref(false);
const showExpired = ref(false);
const showAvailable = ref(true);

// 预约弹框显示状态
const showAppointmentModal = ref(false);
const params = reactive({
  page: 1,
  size: 12,
  state: 1,
  order:'endTime',
  useType: '0,1'
});

function formatDate(timestamp) {
  if (!timestamp || !timestamp.startsWith('2')) return '永久有效';
  const date = new Date(timestamp);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

const toggleTooltip = (index) => {
  if (activeTooltipIndex.value === index) {
    activeTooltipIndex.value = -1;
  } else {
    activeTooltipIndex.value = index;
  }
};

const closeTooltip = () => {
  activeTooltipIndex.value = -1;
};

const handlePurchaseCoupon = () => {
  emit('handlePurchaseCoupon')
};

// 处理去预约
const handleBookAppointment = (coupon) => {
  if (coupon.state !== 1) return;
  console.log('使用优惠券预约:', coupon);
  showAppointmentModal.value = true;
};

const handleCurrentChange = (val)  => {
  if (params.page != 1 && (params.page * params.size >= couponData.couponTotal)) {
    return
  }
  params.page = val
  fetchCouponData()
}

//获取我的券
const fetchCouponData = async () => {
  const {list, total} = await customerCouponApi.getPage({...params})
  if (params.page == 1) {
    couponData.couponList = list || []
  } else {
    couponData.couponList = [...couponData.couponList, ...list]
  }
  cookie.setCouponCount(total)
  couponData.couponTotal = total || 0
}

const toggleExpired = () => {
  showExpired.value = !showExpired.value;
};

const toggleAvailable = () => {
  showAvailable.value = !showAvailable.value;
};

//获取失效的券
const fetchExpiredCouponData = async () => {
  const {list, total} = await customerCouponApi.getPage({page: 1, size: 100, state: '0,2', useType: '0,1', order:'endTime'})
  couponData.expiredCouponList = list || []
  couponData.expiredCouponTotal = total || 0
}

onMounted(() => {
  params.page = 1
  fetchCouponData();
  fetchExpiredCouponData();
});

// 处理预约确认
const handleAppointmentConfirm = async (formData) => {
  console.log('预约信息:', formData);
  const orderId = await orderApi.createOrder({...formData, appointmentType:2}) || ''
  vm.$Cache.put('waitOrderId', orderId, constant.payCutDownSeconds)
  showPaymentModal.value = true;
  if (paymentModalRef) {
    paymentModalRef.value.fetchData(orderId)
  }
};

// 处理预约取消
const handleAppointmentCancel = () => {
  showAppointmentModal.value = false;
};

// 处理支付确认
const handlePaymentConfirm = (paymentData) => {
  console.log('支付信息:', paymentData);
  showPaymentModal.value = false;
  params.page = 1
  fetchCouponData()
  cookie.getCouponCount()
  setTimeout(() => {
    uni.navigateTo({
      url: '/pages/user/treatment-record'
    });
  },1000)
  // uni.showToast({
  //   title: '支付成功',
  //   icon: 'success'
  // });
};

// 处理支付取消
const handlePaymentCancel = () => {
  showPaymentModal.value = false;
};
defineExpose({ handleCurrentChange });
</script>

<style lang="scss" scoped>
.coupon-card-wrapper {
	width: 100%;
}

.coupon-card {
	display: flex;
	width: 100%;
	height: 240rpx;
	background: url('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/bg-1.png') no-repeat;
	background-size: contain;
	position: relative;
	color: #584219;
}

.coupon-card.disabled {
	background: url('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0627/bg-2.png') no-repeat;
	background-size: contain;
	// filter: grayscale(25%);
	opacity: 0.7;
	color: #00000040;
	.coupon-info {
		color: #00000040;
		.coupon-title {
			opacity: 0.5;
		}
	}
}

.coupon-left {
	flex: 1;
	padding: 48rpx 0 48rpx 64rpx;
	display: flex;
	flex-direction: column;
	justify-content: center;
}

.coupon-title {
	margin-bottom: 24rpx;
}

.coupon-info {
	font-size: 24rpx;
	color: #8c7b5d;
}

.coupon-right {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
  width: 272rpx;
}

.coupon-mins-img {
	width: 142rpx;
	height: 64rpx;
	margin-bottom: 32rpx;
}

.use-btn {
	background-color: #584219;
	color: white;
	border: none;;
  border-radius: 8rpx;
	font-size: 24rpx;
}

.use-btn[disabled] {
	background-color:#00000040;
	color: #ffffff;
}

.expired-stamp {
	position: absolute;
	top: 50%;
	right: 160rpx;
	transform: translate(-50%, -50%);
	width: 120rpx;
	height: 100rpx;
	opacity: 0.8;
}

.expired-img {
	width: 100%;
	height: 100%;
}

.expired-section {
	margin-top: 32rpx;
	color: #00000073;
}

.expired-toggle {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 28rpx;
}

.expired-toggle2 {
	display: flex;
	align-items: center;
	justify-content: space-between;
	font-size: 28rpx;
	color: #00000073;
}

.arrow-icon {
	width: 24rpx;
	height: 24rpx;
	transition: transform 0.3s;
	transform: rotate(90deg);
}

.arrow-icon.expanded {
	transform: rotate(270deg);
}

.tooltip-box {
  position: absolute;
  background-color: #333;
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  bottom: calc(100% + 5px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
	width: max-content;
}

.tooltip-arrow {
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid #333;
}
</style>
