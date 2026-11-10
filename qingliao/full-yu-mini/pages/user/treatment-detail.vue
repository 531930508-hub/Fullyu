<template>
  <view class="treatment-detail">
    <!-- 顶部时间信息卡片 -->
    <view class="time-card">
      <view class="time-section">
        <view class="time-label">开始</view>
        <view class="time-value" v-if="orderInfo.startTime">{{ orderInfo.startTime.split(' ')?.[1] }}</view>
        <view class="date-value" v-if="orderInfo.startTime">{{ orderInfo.startTime.split(' ')?.[0] }}</view>
      </view>

      <view class="duration-section">
        <view class="time-label">放松时长</view>
        <view class="duration-value">{{ orderInfo.duration }}min</view>
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
        <view class="time-value" v-if="orderInfo.endTime">{{ orderInfo.endTime.split(' ')?.[1] }}</view>
        <view class="date-value" v-if="orderInfo.endTime">{{ orderInfo.endTime.split(' ')?.[0] }}</view>
      </view>
    </view>

    <!-- 订单详情卡片 -->
    <view class="order-card">
      <view class="card-title">订单详情</view>

      <view class="order-item">
        <text class="order-label">订单号</text>
        <view class="order-value-row">
          <text class="order-value">{{ orderInfo.code }}</text>
          <image class="copy-icon"
                 src="/static/icons/copy-regular.svg"
                 @click="copyOrderNumber"></image>
        </view>
      </view>

      <view class="order-item">
        <text class="order-label">开始时间</text>
        <text class="order-value">{{ orderInfo.startTime }}</text>
      </view>

      <view class="order-item">
        <text class="order-label">结束时间</text>
        <text class="order-value">{{ orderInfo.endTime }}</text>
      </view>

      <view class="order-item" v-if="orderInfo && orderInfo.orderDetailList &&orderInfo.orderDetailList.length">
        <text class="order-label">预约人数</text>
        <text class="order-value">{{ orderInfo.orderDetailList.length }} 位</text>
      </view>

      <view class="order-item">
        <text class="order-label">项目</text>
        <text class="order-value">{{ $filters.projectTitleFilter(orderInfo.orderDetailList?.[0].projectId) }}  | {{ orderInfo.duration }} mins / 位</text>
      </view>

<!--      <view class="order-item">-->
<!--        <text class="order-label">订单状态</text>-->
<!--        <text class="order-value">{{ $filters.appointmentStateFilter(orderInfo.appointmentState) }}</text>-->
<!--      </view>-->

      <view class="order-item">
        <text class="order-label">支付状态</text>
        <text class="order-value">{{ $filters.orderStateFilter(orderInfo.state) }}</text>
      </view>

      <view class="order-item">
        <text class="order-label">支付方式</text>
        <text class="order-value" v-if="orderInfo.payType">{{ $filters.orderPayTypeFilter(orderInfo.payType) }}</text>
        <text class="order-value" v-else>{{ orderInfo.payChannel == 'a_native' ? '支付宝Alipay': orderInfo.payChannel == 'wx_wap_scan' ? '微信Wechatpay':'二维码支付' }}</text>
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
        <image class="copy-icon"
               src="/static/icons/copy-regular.svg"
               @click="copyShoreAddress"></image>
      </view>
    </view>

    <!-- 服务疗愈师卡片 -->
    <view v-if="showMassagist(orderInfo)" class="therapist-card">
			<view class="flex items-center pb-3 justify-between">
				<view class="card-title" style="padding-bottom: 0;">服务疗愈师</view>
				<text class="text-xs text-[#D2956E]">收藏疗愈师，下次直接找TA!</text>
			</view>
      <view class="therapist-list">
        <view class="therapist-item" v-for="(orderDetail, index) in orderInfo.orderDetailList" :key="index">
          <image @click="previewImg(orderDetail.massagist.avatarUrl)" class="therapist-avatar" v-if="orderDetail.massagist" :src="orderDetail.massagist.avatarUrl"></image>
          <view class="therapist-info" v-if="orderDetail.massagist">
            <text class="therapist-name">{{ orderDetail.massagist.name }}</text>
            <text class="therapist-store">{{ $filters.shoreNameFilter(orderInfo.shopId) }}</text>
          </view>
          <view class="favorite-btn" :class="{ 'favorited': orderDetail.massagist.isFavorited }"
                @click="toggleFavorite(orderDetail.massagist)">
            <text class="favorite-text">{{ orderDetail.massagist.isFavorited ? '已收藏' : '收藏' }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部评价按钮 -->
    <view class="bottom-action" v-if="orderInfo.state == 1 && orderInfo.appointmentState == 2">
      <button class="evaluate-btn" @click="showEvaluateModal">
        评价疗愈师（可获赠积分）
      </button>
    </view>

    <!-- 评价弹框组件 -->
    <TherapistEvaluationModal v-if="orderInfo && orderInfo.orderDetailList &&orderInfo.orderDetailList.length"
                              ref="refTherapistEvaluationModal"
        :visible="showModal"
        :therapists="orderInfo.orderDetailList.map(s=>s.massagist)"
        :orderId="orderInfo.id"
        :showLotteryAfterSubmit="true"
        @cancel="hideModal"
        @submit="handleEvaluationSubmit"
    />
  </view>
</template>

<script>
import TherapistEvaluationModal from '@/components/TherapistEvaluationModal.vue'
import orderApi from "../../api/order"
import customerMassagistRelationApi from "../../api/customerMassagistRelation"
import massagistRateApi from "../../api/massagistRate";
import cookie from "../../utils/cookieUtil"
import {shoreAddressFilter} from "../../filters/index"

export default {
  components: {
    TherapistEvaluationModal
  },
  data() {
    return {
      showModal: false,
      orderInfo: {
        code: '',
        startTime: '',
        endTime: '',
        peopleCount: 1,
        duration: 0,
        payType: 2,
        couponCount: 0,
        shopId: 0
      },
      orderId: ''
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
    if (options.id) {
      this.orderId = options.id
    }
  },
  computed:{
    showMassagist() {
      return (record) => {
        let show = false
        if (!record.orderDetailList){
          return show
        }
        record.orderDetailList.forEach(s=>{
          if (s.specifyType) {
            show = true
          } else if (s.state == 1|| s.state == 2) {
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
      await cookie.updProjectList()
      // 这里应该调用API获取订单详情
      const orderInfo = await orderApi.infoWithDetail(this.orderId) || {}
      if (!orderInfo && !orderInfo.orderDetailList && !orderInfo.orderDetailList.length) {
        return
      }
      const relationData = await customerMassagistRelationApi.getList()
      orderInfo.orderDetailList.forEach(v => {
        const relation = relationData.find(s => s.massagistId == v.massagist.id)
        v.massagist.isFavorited = !!relation
        if (!relation) {
          return
        }
        v.massagist.relationId = relation.id
      })
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

          if(res.confirm) {
            await customerMassagistRelationApi.remove(massagist.relationId)
            await this.loadOrderDetail()
          }
        } catch(err) {
          console.error(err)
        }
      } else {
        await customerMassagistRelationApi.createRelation(massagist.id)
        uni.showToast({
          title: `${action}成功`,
          icon: 'success'
        })
        await this.loadOrderDetail()
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
        title: '评价提交成功',
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

<style lang="scss" scoped>
.treatment-detail {
  padding: 32upx 40upx;
  padding-bottom: 130upx;

  // 顶部时间卡片
  .time-card {
    background: white;
    border-radius: 20upx;
    padding: 32upx 48upx;
    margin-bottom: 32upx;
    display: flex;
    justify-content: space-between;
    box-shadow: 0 4upx 20upx rgba(0, 0, 0, 0.05);

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
        color: #333;
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
        color: #333;
        margin-bottom: 20upx;
      }

      .duration-bar {
        display: flex;
        width: 120upx;
        height: 8px;
        overflow: hidden;
        position: relative;
        transform: skewX(-20deg); /* 整体倾斜 */

        .bar-segment {
          flex: 1;
          height: 100%;
          margin-right: 2upx; /* 段落之间的间距 */
          &:last-child {
            margin-right: 0;
          }
        }

        .light-1 { background-color: #F8EFEA; }
        .light-2 { background-color: #F1E0D4; }
        .light-3 { background-color: #E9D1BF; }
        .dark-1 { background-color: #E0C2AA; }
        .dark-2 { background-color: #D7B395; }
        .dark-3 { background-color: #CE9F7F; }
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
      color: #333;
      padding-bottom: 24upx;
      border-bottom: 2upx dashed #f8f8f8;
    }
  }

  // 订单详情
  .order-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8upx 0;

    .order-label {
      font-size: 28upx;
      color: #00000073;
      flex-shrink: 0;
    }

    .order-value {
      font-size: 28upx;
      color: #333;
      text-align: right;
    }

    .order-value-row {
      display: flex;
      align-items: center;

      .copy-icon {
        width: 32upx;
        height: 32upx;
        margin-left: 10upx;
      }
    }
  }

  // 门店信息
  .store-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 20upx 0;
    border-bottom: 1upx solid #f5f5f5;

    &:last-child {
      border-bottom: none;
    }

    .store-label {
      font-size: 28upx;
      color: #00000073;
      flex-shrink: 0;
      width: 140upx;
    }

    .store-value {
      font-size: 28upx;
      color: #333;
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
