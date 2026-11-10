<template>
  <view class="treatment-record">
    <!-- 标签页导航 -->
    <view class="tab-nav sticky-top">
      <view
          v-for="(tab, index) in tabs"
          :key="index"
          :class="['tab-item', { active: activeTab === index }]"
          @click="switchTab(index)"
      >
        {{ tab.name }}
      </view>
    </view>

    <!-- 记录列表 -->
    <view class="record-list content-under-sticky">
      <view v-for="(record, index) in tableData" :key="index" class="record-card" @click="detail(record.id)">
        <view :class="['status', {'red': record.state == 0,
                                    'green': record.state == 1 && record.appointmentState == 1,
                                    'default': record.state == 2 || ( record.state == 1 && record.appointmentState == 2),
                                    'yellow': record.appointmentState == 3
                                  }]">
          <text v-if="record.state == 0">未付款</text>
          <text v-else-if="record.state == 1 && record.appointmentState == 1">已付款</text>
          <text v-else-if="record.state == 1 && record.appointmentState == 2">已完成待评价</text>
          <text v-else-if="record.state == 2">已评价</text>
          <text v-else-if="record.appointmentState == 3">已取消</text>
        </view>
        <!-- 开始时间 -->
        <view class="record-row">
          <text class="label">开始时间</text>
          <text class="value">{{ record.startTime }}</text>
        </view>

        <!-- 放松时长 -->
        <view class="record-row">
          <text class="label">项目</text>
          <text class="value">{{ record.productTitle }} | {{ record.duration }} mins</text>
        </view>

        <!-- 服务门店 -->
        <view class="record-row">
          <text class="label">服务门店</text>
          <text class="value">{{ $filters.shoreNameFilter(record.shopId) }}</text>
        </view>

        <!-- 服务疗愈师 -->
        <view v-if="showMassagist(record)" class="record-row therapist-row">
          <text class="label">服务疗愈师</text>
          <view class="therapist-list">
            <view
                v-for="(orderDetail, tIndex) in record.orderDetailList"
                :key="tIndex"
                class="therapist-item">
              <image :src="orderDetail.massagist.avatarUrl" class="therapist-avatar" @click="previewImg(orderDetail.massagist.avatarUrl)"/>
              <text class="therapist-name">{{ orderDetail.massagist.name }}</text>
            </view>
          </view>
        </view>

        <!-- 操作按钮 -->
        <view class="action-buttons" :class="{ 'no-buttons': !hasVisibleButtons(record) }">
          <view class="btn btn-cancel" @click.stop="cancelRecord(record)" v-if="(record.state == 0 || (record.state == 1 && record.appointmentState == 1)) &&isUpdButtonVisible(record)">取消
          </view>
          <view class="btn btn-modify" @click.stop="modifyRecord(record)" v-if="record.state == 1 && record.appointmentState == 1 && isUpdButtonVisible(record)">修改
          </view>
          <view class="btn btn-modify pay" @click.stop="handleToPay(record)" v-if="record.state == 0">去支付
            <view class="countdown-timer" v-if="record.state == 0 && record.cutdown">
              {{ record.cutDownDes }}
            </view>
          </view>
          <view class="review-button-container" v-if="record.state == 1 && record.appointmentState == 2">
            <view class="review-reward-tag">
              <image src="/static/icons/reward-icon.png" class="reward-icon" />
              <text>评价有礼</text>
            </view>
            <view class="btn btn-review" @click.stop="reviewTherapist(record)">
              评价疗愈师
            </view>
          </view>
        </view>
      </view>

      <view v-if="tableData.length==0" class="empty-wrapper">
        <EmptyData title="">
          <view class="btn btn-cancel" @click="goBooking()">去预约</view>
        </EmptyData>
      </view>
    </view>

    <!-- 修改订单弹框组件 -->
    <AppointmentModal
        v-model:visible="showModifyModal"
        title="修改订单"
        confirm-text="确认修改"
        :therapistList="therapist"
        :order="order"
        @confirm="handleModifyConfirm"
        @cancel="handleModifyCancel"
    />

    <!-- 评价疗愈师弹框组件 -->
    <TherapistEvaluationModal
        :visible="showEvaluationModal"
        :therapists="currentEvaluationRecord?.orderDetailList.map(s=>s.massagist) || []"
        :orderId="String(currentEvaluationRecord?.id || '')"
        :showLotteryAfterSubmit="true"
        @submit="handleEvaluationSubmit"
        @cancel="hideEvaluationModal"
    />

    <!-- 支付弹框组件 -->
    <PaymentModal
        v-model:visible="showPaymentModal"
        :countdown="countdown"
        ref="paymentModalRef"
        @confirm="handlePaymentConfirm"
        @cancel="handlePaymentCancel"/>
  </view>
</template>

<style lang="scss" scoped>
.sticky-top {
  position: -webkit-sticky; /* for Safari */
  position: sticky;
  top: 0;
  background-color: #f5f5f5; /* Match the page background */
  z-index: 99;
}

.content-under-sticky {
  padding-top: 90rpx; /* Adjust this based on the actual height of the .tab-nav element */
}
</style>

<script setup>
import {reactive, ref, toRefs,getCurrentInstance,computed} from 'vue';
import AppointmentModal from '@/components/AppointmentModal.vue';
import TherapistEvaluationModal from '@/components/TherapistEvaluationModal.vue';
import PaymentModal from '@/components/PaymentModal.vue';
import {onReachBottom,onShow} from "@dcloudio/uni-app"
import EmptyData from '@/components/empty-data.vue';

import orderApi from "../../api/order"
import massagistRateApi from "../../api/massagistRate";
import cookie from "../../utils/cookieUtil"
import moment from 'moment';
import constant from '@/consts/constant'

const {proxy} = getCurrentInstance()
const vm = proxy

// 支付弹框显示状态
const showPaymentModal = ref(false);

const paymentModalRef = ref(null)

const countdown = ref(0)

const formattedCountdown = computed(() => {
  const seconds = countdown.value;
  return `0:${seconds < 10 ? '0' : ''}${seconds}`;
});

//请求参数
const params = reactive({
  page: 1,
  size: 5,
  type: 0,
  order: '-id',
})
const {page, size} = toRefs(params)

//订单记录与总数
const data = reactive({
  tableData: [],
  total: 0
})
const {tableData, total} = toRefs(data)

// 标签页数据
const tabs = ref([
  {name: '进行中', status: '0,1'},
  {name: '已完成', status: '2'},
  {name: '已取消', status: '3'},
  {name: '全部', status: ''},
]);

// 当前激活的标签页
const activeTab = ref(0);

// 修改弹框相关状态
const showModifyModal = ref(false);
const therapist = ref([]);
const orderId = ref(null);
const order = ref({})

// 评价弹框相关状态
const showEvaluationModal = ref(false);
const currentEvaluationRecord = ref(null);

onShow(() => {
  const login = vm.$Cache.get('login')
  if (login){
    vm.$Cache.remove('login')
    return
  }
  countdown.value = 0
  searchData()
  //有查询是否有待付款的订单
  haveWaitOrder()
})

//触底加载下一页事件
onReachBottom(() => {
  const allTotal = params.page * params.size
  if (allTotal >= data.total) {
    return
  }
  params.page++;
  //加载次数递加
  fetchData()
})

// 切换标签页
const switchTab = (index) => {
  activeTab.value = index
  searchData()
};

const searchData = () =>{
  params.page = 1
  fetchData()
}

//获取订单
const fetchData = async () => {
  if (cutDownTimer) {
    clearInterval(cutDownTimer)
  }
  const {list, total} = await orderApi.getPage({
    ...params,
    appointmentState: tabs.value[activeTab.value].status
  })
  const currentTime = new Date();
  list.forEach(o => {
    if (o.state == 0) {
      const createTime = Date.parse(o.createTime) / 1000
      const currentTime = Date.parse(currentTime) / 1000
      const payCutDownSeconds = o.overTimeSeconds || constant.payCutDownSeconds
      o.cutdown = payCutDownSeconds - (currentTime - createTime)
    }
  })
  startCountdown()
  if (params.page == 1) {
    data.tableData = list || []
  } else {
    data.tableData = [...data.tableData, ...list]
  }
  if (data.total) {
    return
  }
  data.total = total || 0
}

let cutDownTimer = null;
const startCountdown = () => {
  if (cutDownTimer) clearInterval(cutDownTimer);
  cutDownTimer = setInterval(() => {
    data.tableData.forEach(o => {
      if (o.state == 0 && o.cutdown> 0) {
        o.cutdown = o.cutdown -1
        o.cutDownDes = getCutDown(o)
        if (o.cutdown == 0){
          o.state = 3
        }
      }
    })
  }, 1000);
};

const previewImg = (url) => {
  uni.previewImage({
    urls: [url]
  })
}

// 取消记录
const cancelRecord = (record) => {
  if (!isUpdButtonVisible(record)){
    uni.showToast({
      title: '服务即将开始',
      icon: 'none'
    });
    return
  }
  uni.showModal({
    title: '提示',
    content: '确定要取消这个预约吗？',
    confirmText: '确定',
    cancelText: "取消",
    success: async (res) => {
      if (res.confirm) {
        await orderApi.cancelOrder(record.id, '客户操作取消')
        searchData()
        uni.showToast({
          title: '已取消预约',
          icon: 'success'
        });
        cookie.updCouponCount()
      }
    }
  });
};

// 修改记录
const modifyRecord = (record) => {
  uni.showModal({
    title: '提示',
    content: '确定要修改吗？',
    confirmText: '确定',
    cancelText: "取消",
    success: async (res) => {
      if (res.confirm) {
        if (!isUpdButtonVisible(record)){
          uni.showToast({
            title: '服务即将开始',
            icon: 'none'
          });
          return
        }
        orderId.value = record.id
        order.value = data.tableData.find(s=>s.id == record.id)
        if (!order.value){
          uni.showToast({
            title: '订单不存在',
            icon: 'none'
          });
        }
        therapist.value = order.value.orderDetailList.map(s=>s.massagist.id)
        showModifyModal.value = true;
      }
    }
  });
};

// 处理修改确认
const handleModifyConfirm = async (appointmentData) => {
  if (!orderId.value){
    return
  }
  await orderApi.updateOrder({...appointmentData, orderId:orderId.value})
  searchData()
  uni.showToast({
    title: '修改成功',
    icon: 'success'
  });
};

//有查询是否有待付款的订单
const haveWaitOrder = () =>{
  const waitOrderId = vm.$Cache.get('waitOrderId')
  const deadtime = vm.$Cache.get('waitOrderId_mallStore')
  if (!waitOrderId){
    return
  }
  if (deadtime){
    const currentTime = Date.parse(new Date()) / 1000
    countdown.value = deadtime - currentTime - 2;
  }else {
    countdown.value = constant.payCutDownSeconds;
  }
  orderId.value = waitOrderId

  setTimeout(() => {
    if (countdown.value > 0){
      openPaymentModal()
    } else {
      countdown.value = 0
      searchData()
    }
  },1000)
}

//去付款
const handleToPay = (order) =>{
  console.log(order)
  orderId.value = order.id
  const createTime = Date.parse(order.createTime) / 1000
  const currentTime = Date.parse(new Date()) / 1000
  if (order.overTimeSeconds){
    countdown.value = order.overTimeSeconds - (currentTime - createTime);
  } else {
    countdown.value = constant.payCutDownSeconds;
  }
  if (countdown.value > 0 ){
    openPaymentModal()
  } else {
    countdown.value = 0
    searchData()
  }
}

const handleFinish = async (oid) =>{
  await orderApi.finishOrder(oid)
  uni.showToast({
    title: '操作成功',
    icon: 'success'
  });
  searchData()
}

//打开付款界面
const openPaymentModal = () =>{
  showPaymentModal.value = true;
  if (paymentModalRef) {
    paymentModalRef.value.fetchData(orderId.value)
  }
}

// 处理支付确认
const handlePaymentConfirm = (paymentData) => {
  countdown.value = 0
  console.log('支付信息:', paymentData);
  showPaymentModal.value = false;
  searchData()
  cookie.updCouponCount()
};

// 处理支付取消
const handlePaymentCancel = () => {
  showPaymentModal.value = false;
  countdown.value = 0
  searchData()
};

// 处理修改取消
const handleModifyCancel = () => {
  orderId.value = null;
  therapist.value = null;
};

// 评价疗愈师
const reviewTherapist = (record) => {
  currentEvaluationRecord.value = record
  showEvaluationModal.value = true
};

// 隐藏评价弹框
const hideEvaluationModal = () => {
  showEvaluationModal.value = false
  currentEvaluationRecord.value = null
};

// 处理评价提交
const handleEvaluationSubmit = async (evaluationData) => {
  console.log('提交评价数据:', evaluationData);
  const data = await massagistRateApi.createBatch(evaluationData)
  // 显示成功提示
  uni.showToast({
    title: '评价提交成功',
    icon: 'success',
    duration: 2000
  });

  // 隐藏弹框
  hideEvaluationModal();

  //更新订单数据
  searchData()
};

// 检查时间条件
const isUpdButtonVisible = (record) => {
  const currentTime = moment();
  const startTime = moment(record.startTime);
  return currentTime.isBefore(startTime.subtract(30, 'minutes'));
};

const detail = (id) => {
  uni.navigateTo({
    url: `/pages/user/treatment-detail?id=${id}`
  });
};

// 跳转预约界面
const goBooking = () => {
  uni.navigateTo({
    url: `/pages/index/booking`
  });
};

const getCutDown = (item) => {
  const seconds = countdown.value;
  let hours = parseInt(seconds / 3600);
  let min = parseInt((seconds % 3600) / 60);
  let second = seconds % 60;

  hours = hours < 10 ? '0' + hours : hours;
  min = min < 10 ? '0' + min : min;
  second = second < 10 ? '0' + second : second;

  return '倒计时 '+hours + ':' + min + ':' + second;
}

// 检查是否有可见按钮
const hasVisibleButtons = (record) => {
  const hasCancelButton = (record.state == 0 || (record.state == 1 && record.appointmentState == 1)) && isUpdButtonVisible(record);
  const hasModifyButton = record.state == 1 && record.appointmentState == 1 && isUpdButtonVisible(record);
  const hasPayButton = record.state == 0;
  const hasReviewButton = record.state == 1 && record.appointmentState == 2;

  return hasCancelButton || hasModifyButton || hasPayButton || hasReviewButton;
}

// 显示疗愈师
const showMassagist = (record) => {
  let show = false
  record.orderDetailList.forEach(s=>{
    if (s.specifyType) {
      show = true
    }else if (s.state == 1|| s.state == 2) {
      show = true
    }
  })
  return show
}

</script>

<style lang="less" scoped>
.review-button-container {
  position: relative;
  display: inline-block; /* or flex, adjust as needed */
  margin-left: 10px; /* Adjust spacing from other buttons if necessary */
}

.pay{
  position: relative;
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
.review-reward-tag {
  position: absolute;
  top: -12px; // Adjust to position above the button
  left: 66%;
  transform: translateX(-50%);
  background-color: #FFF0F0; // Light pinkish background
  color: #F56C6C; // Reddish text color
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

// Adjust existing button style if it's pushed down by the tag
.action-buttons {
  border-top: 2rpx solid #f0f0f0;
  padding-top: 32rpx;
  margin-top: 32rpx;

  &.no-buttons {
    border-top: none;
    padding-top: 0;
    margin-top: 0;
  }

  .btn-review {
    margin-top: 5px; // Add some top margin to the button itself if the tag overlaps or pushes it
  }
}

.treatment-record {
  padding-bottom: 20upx;

  // 标签页导航
  .tab-nav {
    display: flex;
    background-color: #fff;
    padding: 0 32upx;
    border-bottom: 2upx solid #f0f0f0;

    .tab-item {
      flex: 1;
      text-align: center;
      padding: 24upx 0;
      font-size: 28rpx;
      color: #666;
      position: relative;
      transition: color 0.3s;

      &.active {
        font-size: 34upx;
        color: #584219;
        font-weight: bold;

        &::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 60upx;
          height: 4upx;
          background-color: #584219;
          border-radius: 2upx;
        }
      }
    }
  }

  // 记录列表
  .record-list {
    padding: 32rpx 40rpx;

    .empty-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 120rpx 0;
      min-height: 60vh;
    }

    // 记录卡片
    .record-card {
      position: relative;
      background-color: #fff;
      border-radius: 32rpx;
      padding: 48rpx 48rpx 32rpx;
      margin-bottom: 24rpx;
      box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);

      &:last-child {
        margin-bottom: 0;
      }
      .status {
        position: absolute;
        top: 0;
        left: 0;
        width: fit-content;
        font-size: 24rpx;
        padding: 4rpx 32rpx;
        border-radius: 32rpx 0 16upx 0;
        &.red {
          background-color: #FDD3D0;
          color: #900B09;
        }
        &.green {
          background-color: #CFF7D3;
          color: #02542D;
        }
        &.yellow {
          background-color: #E8B931;
          color: #401B01;
        }
        &.default {
          background-color: #C5B69D;
          color: #584219;
        }
      }

      // 记录行
      .record-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 24rpx;

        &:last-child {
          margin-bottom: 0;
        }

        .label {
          font-size: 28rpx;
          color: #00000073;
          min-width: 140upx;
        }

        .value {
          font-size: 28rpx;
          color: #333;
          font-weight: 500;
          flex: 1;
          text-align: right;
        }
      }

      // 疗愈师行特殊样式
      .therapist-row {
        align-items: flex-start;

        .therapist-list {
          display: flex;
          flex-wrap: wrap;
          gap: 16upx;
          flex: 1;
          justify-content: flex-end;
        }

        .therapist-item {
          display: flex;
          align-items: center;
          gap: 8upx;

          .therapist-avatar {
            width: 48upx;
            height: 48upx;
            border-radius: 50%;
            background-color: #f0f0f0;
          }

          .therapist-name {
            font-size: 24rpx;
            color: #333;
          }
        }
      }
    }
  }
}
</style>
