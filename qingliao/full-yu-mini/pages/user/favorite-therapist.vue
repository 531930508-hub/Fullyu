<template>
  <view class="favorite-therapist-container">
    <view class="therapist-list">
      <view class="therapist-card" v-for="(therapist, index) in tableData" :key="index">
        <view class="therapist-main">
          <view class="therapist-info">
            <image class="therapist-avatar" :src="therapist.avatarUrl || '/static/icons/avatar-placeholder.svg'"
                   mode="aspectFill"></image>
            <view class="therapist-details">
              <text class="therapist-name">{{ therapist.name }}</text>
              <text class="therapist-source">{{ $filters.shoreNameFilter(therapist.shopId) }}</text>
            </view>
          </view>
          <view @click="removeFavorite(therapist.relationId)">
            <image class="follow-icon" src="/static/icons/favorite-therapist-check.png"/>
            <text class="favorite-text">已收藏</text>
          </view>
        </view>
        <view class="action-area">
          <button class="appointment-btn" @click="showAppointmentModal(therapist)">预约疗愈师</button>
        </view>
      </view>
      <empty-data v-if="tableData.length==0"></empty-data>
    </view>

    <!-- 预约弹框组件 -->
    <AppointmentModal
        v-model:visible="showModal"
        title="预约疗愈师"
        confirm-text="确定"
        :therapistList="currentTherapist"
        :multiple="false"
        @confirm="handleAppointmentConfirm"
        @cancel="handleAppointmentCancel"/>

    <!-- 支付弹框组件 -->
    <PaymentModal
        v-model:visible="showPaymentModal"
        ref="paymentModalRef"
        @confirm="handlePaymentConfirm"
        @cancel="handlePaymentCancel"/>
  </view>
</template>

<script setup>
import {reactive, ref, toRefs,getCurrentInstance} from 'vue';
import {onReachBottom,onShow} from "@dcloudio/uni-app"
import EmptyData from '@/components/empty-data.vue';
import AppointmentModal from '@/components/AppointmentModal.vue'
import PaymentModal from '@/components/PaymentModal.vue';
import customerMassagistRelationApi from "../../api/customerMassagistRelation"
import cookie from "../../utils/cookieUtil";
import orderApi from "../../api/order"

// 支付弹框显示状态
const showPaymentModal = ref(false);

const paymentModalRef = ref(null)

const {proxy} = getCurrentInstance()
const vm = proxy

//请求参数
const params = reactive({
  page: 1,
  size: 10,
  order: '-id',
})
const {page, size} = toRefs(params)

onShow(() => {
  const login = vm.$Cache.get('login')
  if (login){
    vm.$Cache.remove('login')
    return
  }
  params.page = 1;
  fetchData()
})

//收藏疗愈师信息
const data = reactive({
  tableData: [],
  total: 0
})
const {tableData, total} = toRefs(data)

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

//获取收藏疗愈师数据
const fetchData = async () => {
  let {list, total} = await customerMassagistRelationApi.getPage(params)
  if (list && list.length) {
    list = list.map(s => {return{
      ...s.massagist,relationId: s.id
    }}) || []
  }
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

const removeFavorite= async(id)=> {
  uni.showModal({
    title: '提示',
    content: '确定要取消收藏吗？',
    confirmText: '确定',
    cancelText: '取消',
    success: async (res) => {
      if (res.confirm) {
        uni.showToast({
          title: '取消收藏成功',
          icon: 'success'
        })
        await customerMassagistRelationApi.remove(id)
        params.page = 1;
        fetchData()
      }
    }
  })
}

// 弹框相关状态
const showModal = ref(false);
const currentTherapist = ref([]);

// 显示预约弹框
const showAppointmentModal = (therapist) => {
  vm.$Cache.put('therapist',therapist)
  const storeList = cookie.getStoreList()
  cookie.setStore(storeList.find(s=>s.id == therapist.shopId))
  currentTherapist.value = [therapist.id];
  showModal.value = true;
};

// 处理预约确认
const handleAppointmentConfirm = async (appointmentData) => {
  const orderId = await orderApi.createOrder({...appointmentData, massagistIdList:currentTherapist.value,appointmentType:2}) || ''
  showPaymentModal.value = true;
  if (paymentModalRef) {
    paymentModalRef.value.fetchData(orderId)
  }
};

// 处理预约取消
const handleAppointmentCancel = () => {
  currentTherapist.value = null;
};

// 处理支付确认
const handlePaymentConfirm = (paymentData) => {
  console.log('支付信息:', paymentData);
  showPaymentModal.value = false;
  cookie.updCouponCount()
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

// 预约治疗师方法（保留原有功能）
const makeAppointment = (therapist) => {
  uni.navigateTo({
    url: `/pages/index/booking?id=${therapist.id}&name=${therapist.name}`
  });
};
</script>

<style lang="less" scoped>
.favorite-therapist-container {
  background-color: #f8f8f8;
  padding: 32upx 40upx;
  .therapist-list {
    display: flex;
    flex-direction: column;
    gap: 32upx;
  }

  .therapist-card {
    background-color: #ffffff;
    border-radius: 16upx;
    padding: 32upx;
    box-shadow: 0 2upx 10upx rgba(0, 0, 0, 0.05);

    .therapist-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 32upx;
      margin-bottom: 32upx;
      border-bottom: 1px dashed  #0000000F;
    }

    .therapist-info {
      display: flex;
      align-items: center;
    }

    .therapist-avatar {
      width: 96upx;
      height: 96upx;
      border-radius: 50%;
      margin-right: 32upx;
      border: 2upx solid #0000001A;
    }

    .therapist-details {
      display: flex;
      flex-direction: column;
    }

    .therapist-name {
      font-size: 34upx;
      font-weight: bold;
      color: #333333;
      margin-bottom: 8upx;
    }

    .therapist-source {
      font-size: 28upx;
      color: #00000073;
      width: 350upx;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .action-area {
      display: flex;
      align-items: center;
    }

    .follow-icon {
      height: 32upx;
      width: 32upx;
      display: inline-block;
      vertical-align: sub;
      margin-right: 10upx;
    }

    .favorite-text {
      color:#D2956E;
      font-size: 24upx;
    }

    .appointment-btn {
      background-color: transparent;
      color: #584219;
      font-size: 28upx;
      padding: 10upx 32upx;
      border-radius: 16upx;
      line-height: 1.5;
      height: auto;
      margin-right: 0;
      border: 2upx solid #584219;
    }
  }
}


</style>
