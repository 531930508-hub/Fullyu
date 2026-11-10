<template>
  <view class="mall-container safe-bottom">
    <!-- 购券标签 -->
    <view class="tabs sticky-top">
      <view class="tab" :class="{active: activeTab === 'buy'}" @click="switchTab('buy')">购券</view>
      <view v-if="token" class="tab" :class="{active: activeTab === 'mine'}" @click="switchTab('mine')">我的券</view>
      <view v-if="token" class="tab" :class="{active: activeTab === 'sent'}" @click="switchTab('sent')">送好友</view>
    </view>

    <view class="content content-under-sticky">
      <!-- 购券内容 -->
      <view v-if="activeTab === 'buy'">
        <!-- 选择Full愈券种 -->
        <view class="section">
          <view class="section-header">
            <text class="section-title">选择Full愈券种</text>
            <text class="discount-text">最高低至62折</text>
          </view>
          <view class="coupon-options">
            <view v-for="(product, index) in productList" :key="index">
              <view class="coupon-item"
                    :class="{ selected: selectedCoupon === product.id, gold: product.id == 3, super: product.id == 12, platinum: product.id == 10, diamond: product.id == 11 }"
                    @click="selectCoupon(product)">
                <view class="coupon-header">
                  <view class="check-icon" v-if="selectedCoupon === product.id"></view>
                </view>
                <view class="coupon-content">
                  <view class="title-row">
										<text class="coupon-badge" :class="{'gold': product.id ==3,'super': product.id ==12 ,'platinum': product.id ==10 ,'diamond': product.id ==11 }" v-if="product.icon">Full愈</text>
                    <text class="coupon-title">{{ product.title }}</text>
										<image v-if="product.id==3" src="/static/icons/crown.png" class="w-8 h-5" style="position: absolute;top: 8px;left: 40%;"/>
                    <image v-if="product.id==10" src="/static/icons/crown.png" class="w-8 h-5" style="position: absolute;top: 8px;left: 40%;"/>
                    <image v-if="product.id==11" src="/static/icons/crown.png" class="w-8 h-5" style="position: absolute;top: 8px;left: 40%;"/>
                    <image v-if="product.id==12" src="/static/icons/crown.png" class="w-8 h-5" style="position: absolute;top: 8px;left: 40%;"/>
                  </view>
                  <view v-for="(explain,eIndex) in product.explainArray" :key="'e'+eIndex">
                    <text v-if="product.explainArray.length > 1" class="mr-1" style="font-weight: bolder;">·</text>
                    <text class="coupon-explain">{{explain}}</text>
                  </view>
                  <text class="coupon-desc">{{ product.comment }}</text>
                </view>
                <view class="coupon-price">
                  <text class="price">{{ product.amount }}元</text>
                  <text v-if="product.originalAmount && product.originalAmount != product.amount" class="original-price">{{ product.originalAmount }}元</text>
                </view>
                <view class="coupon-header">
                  <view class="check-icon" v-if="selectedCoupon === product.id"></view>
                </view>
              </view>
              <!-- 数量选择器 -->
              <view class="quantity-selector" v-if="selectedCoupon === product.id && product.isMultiBuy">
                <view class="quantity-btn minus" @click="decreaseQuantity">-</view>
                <input type="number" class="quantity" v-model="quantity" disabled />
                <view class="quantity-btn plus" @click="increaseQuantity(product)">+</view>
              </view>
<!--              <view class="coupon-price">-->
<!--                <text class="price">999元</text>-->
<!--                <text class="original-price">原价1584元</text>-->
<!--              </view>-->
            </view>
          </view>
        </view>
        <!-- 购券用途 -->
        <view class="section" style="display: flex; justify-content: space-between;">
          <view class="section-title">购券用途</view>
          <view class="purpose-options">
            <view class="purpose-item" :class="{selected: selectedPurpose === 'self'}" @click="selectPurpose('self')">
              <image
                  :src="selectedPurpose === 'self'? '/static/icons/check-circle-solid.svg' : '/static/icons/circle-regular.svg'"
                  class="purpose-icon"/>
              <text class="purpose-text">送自己</text>
            </view>
            <view class="purpose-item" :class="{selected: selectedPurpose === 'friend'}" v-if="!coupon.buyLimit"
                  @click="selectPurpose('friend')">
              <image
                  :src="selectedPurpose === 'friend'? '/static/icons/check-circle-solid.svg' : '/static/icons/circle-regular.svg'"
                  class="purpose-icon"/>
              <text class="purpose-text">送好友</text>
            </view>
          </view>
        </view>

        <!-- 送好友 -->
<!--        <view v-if="selectedPurpose === 'friend'" class="friend-gift-section">-->
<!--         <CardSwiper/>-->
<!--        </view>-->
				<view class="h-4"></view>
      </view>

      <!-- 我的券内容 -->
      <view v-if="activeTab === 'mine'">
        <!-- 优惠券列表 -->
        <mineCoupon ref="refMineCoupon" @handlePurchaseCoupon="activeTab='buy'"/>
      </view>

      <!-- 我赠送的内容 -->
      <view v-if="activeTab === 'sent'">
        <view v-if="giftList.length > 0" class="sent-list">
          <view v-for="(coupon, index) in giftList" :key="index" class="sent-item">
            <view class="coupon-info">
              <image :src="coupon.image" class="coupon-image" mode="aspectFill"/>
              <view class="coupon-details">
                <view class="coupon-row" v-if="coupon.orderId">
                  <text class="label">订单号</text>
                  <text class="value">{{ coupon.code }}</text>
                </view>
                <view class="coupon-row" v-if="coupon.orderId">
                  <text class="label">购买时间</text>
                  <text class="value">{{ coupon.payTime }}</text>
                </view>
                <view class="coupon-row">
                  <text class="label">礼物内容</text>
                  <text class="value">{{ coupon.couponName }}</text>
                </view>
<!--                <view v-for="(gift, gindex) in coupon.content" :key="'g'+gindex" class="coupon-row">-->
<!--                  <text class="label">礼物<text v-show="gindex > 0">{{ gindex + 1 }}</text></text>-->
<!--                  <text class="value">{{ gift }}</text>-->
<!--                </view>-->
                <!--                <view class="coupon-row">-->
                <!--                  <text class="label">等卡会员</text>-->
                <!--                  <text class="value">{{ coupon.memberLevel }}</text>-->
                <!--                </view>-->
                <view class="coupon-row" v-if="coupon.orderId">
                  <text class="label">总金额</text>
                  <text class="value price">¥ {{ coupon.totalAmount }}</text>
                </view>
              </view>
            </view>
            <view class="status-section">
              <view class="status-badge" :class="coupon.state">
                <img v-if="coupon.state === 0 || coupon.state === -1" src="/static/icons/clock-solid.svg" class="icon"/>
                <img v-if="coupon.state === 1" src="/static/icons/check-circle-solid-green.svg" class="icon"/>
                <img v-if="coupon.state === 2 || coupon.state === 3" src="/static/icons/ban-solid-red.svg" class="icon"/>
                <text>{{ $filters.giftStateFilter(coupon.state) }}</text>
              </view>
              <button v-if="coupon.state <= 0" class="btn coupon-btn"
                      @click="handleSentAction(coupon)">
                <text class="coupon-btn-text">赠送微信好友</text>
                <text class="coupon-arrow"></text>
              </button>
<!--              <button v-if="coupon.state === -1" class="btn coupon-btn" open-type="share"-->
<!--                      @click="handleSentAction(coupon)">-->
<!--                <text class="coupon-btn-text">赠送微信好友</text>-->
<!--                <text class="coupon-arrow"></text>-->
<!--              </button>-->
              <button v-if="coupon.state == -1 || coupon.state == 2" class="btn coupon-btn"
                      @click="handleRevocation(coupon)">
                <text class="coupon-btn-text">送自己</text>
                <text class="coupon-arrow"></text>
              </button>
            </view>
          </view>
        </view>
        <view v-else class="empty-content">
          <empty-data title="暂无可赠送券">
            <button class="btn btn-cancel mt-2" @click="activeTab='buy'">去购券</button>
          </empty-data>
        </view>
      </view>
    </view>
    <!-- 底部购买区域 -->
    <view class="bottom-bar" v-if="activeTab === 'buy'">
      <view v-if="integration && isUseIntegration" class="bottom-note">购券支持积分支付，当前{{ integration }}积分可抵扣{{ integration }}元，购券时优先抵扣积分</view>
      <view class="total-price">
        <text class="label">待支付：</text>
        <text class="price">¥{{ payPrice }}</text>
      </view>
      <button
          class="buy-btn"
          size="large"
          @click="handlePurchase()"
      >确认购买</button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.sticky-top {
  position: -webkit-sticky; /* for Safari */
  position: sticky;
  top: 0;
  background-color: #fff;
  z-index: 99;
}

.content-under-sticky {
  padding-top: 90rpx; /* Adjust this based on the actual height of the .tabs element */
}
</style>

<script setup>
import {onLoad, onReachBottom, onShareAppMessage, onShareTimeline, onShow} from "@dcloudio/uni-app"
import payUtils from "../../utils/payUtils";
import orderApi from "../../api/order";
import {computed, nextTick, reactive, ref, toRefs,getCurrentInstance} from 'vue';
import productApi from "../../api/product"
import giveGiftApi from "../../api/giveGift"
import customerCouponApi from "../../api/customerCoupon"
import mineCoupon from '@/components/mine-coupon.vue';
import payApi from "../../api/pay";
import cookie from "../../utils/cookieUtil"
import EmptyData from '@/components/empty-data.vue';
import customerApi from "../../api/customer"

const {proxy} = getCurrentInstance()
const vm = proxy

//token
const token = ref(cookie.getToken())

const integration = ref(cookie.getIntegration())

const refMineCoupon = ref(null)

const coupon = ref({})

//请求参数
const params = reactive({
  page: 1,
  size: 10
})

//券包
const productData = reactive({
  productList: [],
  productTotal: 0
})
const {productList} = toRefs(productData)

//我的券
const couponData = reactive({
  couponList: [],
  couponTotal: 0,
})
const {couponList} = toRefs(couponData)

//我赠送的
const giftData = reactive({
  giftList: [],
  giftTotal: 0,
})
const {giftList} = toRefs(giftData)

// 当前激活的标签页
const activeTab = ref('buy');
// 选中的券种
const selectedCoupon = ref(-1);
// 数量
const quantity = ref(1);
//是否使用积分
const isUseIntegration = ref(true);
// 购券用途
const selectedPurpose = ref('self');

const activityCode = ref(null)

onLoad((options) => {
  init(options)
});

const init = async (options) =>{
  if (options) {
    const {scene,tab} = options
    // scene值为动态小程序码分享的
    if (scene && token.value) {
      vm.$Cache.put('activityCode', scene)
      await customerApi.saveCustomerTagByActivityCode(scene)
      vm.$Cache.remove('activityCode')
    } else if (scene) {
      activityCode.value = scene
      vm.$Cache.put('activityCode', scene)
    }
    if (tab) {
      switchTab(tab)
    } else {
      switchTab('buy')
    }
  } else {
    switchTab('buy')
  }
  cookie.updStoreList()
  if (token.value){
    cookie.updIntegration()
    cookie.updCouponCount()
  }
}

onShow(() => {
  init({tab:'buy'})
  isUseIntegration.value = true
})

onShareAppMessage(async (res) => {
  return {
    path: '/pages/index/index',
    imageUrl: ''
  }
});

onShareTimeline((res) => {
  return {
    imageUrl: '',
    // query: (this.currentUser ? 'invitationCode=' + this.currentUser.invitationCode : ''),
  }
});

const payPrice = computed(() => {
  if (!productData.productList.length) {
    return
  }
  // 计算总价并保留两位小数
  let price = productData.productList.find(s => s.id == selectedCoupon.value).amount * quantity.value
  if (isUseIntegration.value){
    if (integration.value >= price){
      price = 0
    } else if (integration.value){
      price -= integration.value
    }
  }
  return parseFloat(price.toFixed(2))
})

const totalPrice = computed(() => {
  if (!productData.productList.length) {
    return
  }
  // 计算总价并保留两位小数
  const price = productData.productList.find(s => s.id == selectedCoupon.value).amount * quantity.value
  return parseFloat(price.toFixed(2))
})

//获取购券商品
const fetchProductData = async () => {
  const productList = await productApi.list({...params, type: 1, state: 1, order:'sequence', activityCode: activityCode.value})
  productData.productList = productList || []
  if (!productData.productList.length) {
    return
  }
  selectCoupon(productData.productList[0])
}

//获取我赠送的
const fetchGiftData = async () => {
  const {list, total} = await giveGiftApi.getPage({
    ...params,
    order: '-create_time'
  })
  if (params.page == 1) {
    giftData.giftList = list || []
  } else {
    giftData.giftList = [...giftData.giftList, ...list]
  }
  if (giftData.giftTotal) {
    return
  }
  giftData.giftTotal = total || 0
}

//触底加载下一页事件
onReachBottom(() => {
  const allTotal = params.page * params.size
  switch (activeTab.value) {
    case 'buy':
      if (allTotal >= productData.productList.length) {
        return
      }
      params.page++;
      fetchProductData()
      break
    case 'mine':
      nextTick(() => {
        if (refMineCoupon.value) {
            refMineCoupon.value.handleCurrentChange(++params.page)
        }
      });
      break
    case 'sent':
      if (allTotal >= giftData.giftTotal) {
        return
      }
      params.page++;
      fetchGiftData()
      break
    default:
      break
  }
})

// 切换标签页
const switchTab = (tab) => {
  activeTab.value = tab
  params.page = 1
  switch (tab) {
    case 'buy':
      fetchProductData()
      integration.value = cookie.getIntegration()
      break
    case 'mine':
      break
    case 'sent':
      fetchGiftData()
      break
    default:
      break
  }
};

// 选择券种
const selectCoupon = (product) => {
  coupon.value = product
  selectedCoupon.value = product.id;
  quantity.value = 1;
	if (product.buyLimit != 0) {
		selectPurpose('self')
	}
  setTimeout(() => {
    integration.value = cookie.getIntegration()
  },500)
};

// 增加数量
const increaseQuantity = (product) => {
  if (product.buyLimit != 0 && product.buyLimit == quantity.value){
    uni.showToast({
      title: '已达购买上限',
      icon: 'none',
    })
    return
  }
  quantity.value++;
};

// 减少数量
const decreaseQuantity = () => {
  if (quantity.value > 1) {
    quantity.value--;
  }
};

// 选择用途
const selectPurpose = (purpose) => {
  selectedPurpose.value = purpose;
};

// 选择是否使用积分
const changeUseIsUseIntegration = () => {
  isUseIntegration.value = !isUseIntegration.value;
};

// 处理购买
const handlePurchase = async () => {
  // uni.showToast({
  //   title: '购买功能开发中',
  //   icon: 'none'
  // });
  //先校验登录
  if (!cookie.getToken()){
    uni.showToast({
      title: '暂未登录',
      icon: 'none'
    });
    setTimeout(() => {
      uni.navigateTo({
        url: '/pages/login/login',
      })
    },500)
    return
  }
    uni.showLoading({
      title: '处理中',
      mask: true,
    })
    const purpose = selectedPurpose.value

    let form = {
      totalAmount: totalPrice.value,
      payType: 1,
      type: 1,
      quantity: quantity.value,
      productId: selectedCoupon.value,
      isGift: selectedPurpose.value === 'friend',
      isUseIntegration: isUseIntegration.value
    }
    let orderId = await orderApi.createOrder(form)
    const order = await orderApi.infoWithGift(orderId)
    //支付状态为1,支付金额为0,判断为积分支付
    if (order.state == 1 &&order.payAmount == 0) {
      uni.hideLoading();
      uni.showToast({
        title: '积分支付成功',
        icon: 'none',
      })
      cookie.updIntegration()
      cookie.updCouponCount()
      fetchProductData()
    } else {
      let cbFunc = {
        success: () => {
          uni.hideLoading();
          uni.showToast({
            title: '支付成功',
            icon: 'none',
            duration: 3000,
          })
        },
        complete: () => {
          //重新获取积分和券数
          cookie.updIntegration()
          cookie.updCouponCount()
          fetchProductData()
        },
      }
      await payUtils.genPayInfo(orderId, cbFunc)
    }

    //并跳转我的券或送礼界面
    setTimeout(() => {
      //检查是否有待付款的订单
      const waitOrderId = vm.$Cache.get('waitOrderId')
      if (waitOrderId){
        uni.navigateTo({
          url: '/pages/user/treatment-record'
        });
      } else if (purpose === 'friend'){
        if (order.gift && order.gift.id){
          handleSentAction(order.gift)
        } else {
          switchTab('sent')
        }
      } else {
        switchTab('mine')
      }
    },500)
};

// 处理下一步
const handleNextStep = () => {
  uni.navigateTo({
    url: '/pages/mall/order-confirm'
  });
};

// 处理赠送操作
const handleSentAction = async  (gift) => {
  uni.showModal({
    title: '提示',
    content: '确定要送好友吗？',
    confirmText: "确定",
    cancelText: "取消",
    success: async (res) => {
      if (res.confirm) {
        // 未赠送, 未领取
        console.log('gift', gift.id)
        uni.navigateTo({
          url: '/pages/mall/sendGift?id=' + gift.id
        });
      }
    }
  });
};

// 处理赠送操作
const handleRevocation = async (coupon) => {
  if (coupon.state === -1 || coupon.state === 2) {
    uni.showModal({
      title: '提示',
      content: '确定要送自己吗？',
      confirmText: "确定",
      cancelText: "取消",
      success: async (res) => {
        if (res.confirm) {
          // 未赠送或超时
          await giveGiftApi.revocation({id: coupon.id})
          params.page = 1
          fetchGiftData()
          uni.showToast({
            title: `操作成功`,
            icon: 'none'
          });
        }
      }
    });
  }
};

</script>

<style lang="less" scoped>
.mall-container {
  padding-bottom: 120upx;

  &.has-coupon-actions {
    padding-bottom: 200upx;
  }

  // 主要内容
  .content {
    padding: 32upx 40upx 0upx;
  }

  // 标签页
  .tabs {
    background-color: #fff;
    display: flex;
    overflow: hidden;
    border-bottom: 1px solid #f0f0f0;

    .tab {
      flex: 1;
      padding: 24upx 0;
      text-align: center;
      font-size: 30upx;
      color: #666;
      position: relative;

      &.active {
        color: #584219;
        font-weight: bold;
        font-size: 34upx;

        &::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 40upx;
          height: 6upx;
          background-color: #584219;
          border-radius: 8upx;
        }
      }
    }
  }

  // 区块
  .section {
    background-color: white;
    border-radius: 32upx;
    padding: 32upx;
    margin-bottom: 20upx;

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30upx;
    }

    .section-title {
      font-size: 30upx;
      font-weight: bold;
      color: #333;
    }

    .discount-text {
      font-size: 24upx;
      color: #000000A6;
    }
  }

  // 券种选项
  .coupon-options {
    .coupon-item {
      border: 2upx solid #e5e5e5;
      border-radius: 16upx;
      padding: 48upx 40upx;
      margin-bottom: 20upx;
      display: flex;
      align-items: center;
      position: relative;

      &.selected {
        border-color: #584219;
        background-color: #faf9f7;

        &.gold {
          border-color: #A18341;

          .check-icon {
            border-top-color: #A18341;
            border-left-color: #A18341;
          }
        }

        &.super {
          border-color: #b0823f;

          .check-icon {
            border-top-color: #b0823f;
            border-left-color: #b0823f;
          }
        }

        &.platinum {
          border-color: #908d91;

          .check-icon {
            border-top-color: #908d91;
            border-left-color: #908d91;
          }
        }

        &.diamond {
          border-color: #888eed;

          .check-icon {
            border-top-color: #888eed;
            border-left-color: #888eed;
          }
        }
      }

      .coupon-header {
        position: absolute;
        top: 0;
        left: 0;

      .check-icon {
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        border-top: 40rpx solid #584219; /* 绿色背景 */
        border-right: 40rpx solid transparent;
        border-bottom: 40rpx solid transparent;
        border-left: 40rpx solid #584219; /* 绿色背景 */
        border-top-left-radius: 10rpx; /* 与卡片圆角保持一致 */

        &::after {
          content: '';
          width: 36upx;
          height: 36upx;
          background: url('~@/static/icons/check-solid.svg') no-repeat;
          position: absolute;
          top: -26rpx;
          left: -26rpx;
          color: #fff;
        }
      }
    }

      .coupon-content {
        flex: 1;
        width: 75%;

        .title-row {
          display: flex;
          align-items: center;
          margin-bottom: 15upx;
        }

        .coupon-title {
          font-size: 32upx;
          font-weight: bold;
          color: #333;
          display: block;
        }

        .coupon-badge {
          background: linear-gradient(305.24deg, #737E90 -14.09%, #D0D6E3 58.6%);
          color: #666;
          padding: 8upx 12upx;
          border-radius: 8upx;
          font-size: 20upx;
          margin-right: 10upx;

          &.gold {
            background: linear-gradient(297.18deg, #A18341 30.28%, #EEDBA6 78.78%);
            color: #584219;
          }

          &.super {
            background: linear-gradient(297.18deg, #b0823f 30.28%, #ffda50 78.78%); /* 更浅且渐变过渡更细腻的超级金色 */
            color: #4E3C1D;  /* 深棕色文字 */
          }

          &.platinum {
            background: linear-gradient(297.18deg, #908d91 30.28%, #efecf2 78.78%); /* 更加温暖且金属感的铂金色 */
            color: #2C2C2C;  /* 深灰色文字 */
          }

          &.diamond {
            background: linear-gradient(297.18deg, #888eed 30.28%,#ecf5ff 78.78%,#c4ddfd 100%);
            color: #170e50;
          }
        }
        .coupon-explain{
          font-size: 26upx;
          color: #666;
        }

        .coupon-desc {
          font-size: 24upx;
          color: #999;
          display: block;
          margin-top: 15upx;
          white-space: pre;
        }
      }

      .coupon-price {
        text-align: right;

        .price {
          font-size: 34upx;
          font-weight: bold;
          color: #333;
          display: block;
        }

        .original-price {
          font-size: 24upx;
          color: #D2956E;
          text-decoration: line-through;
          display: block;
          margin-top: 5upx;
        }
      }
    }
  }

  // 数量选择器
  .quantity-selector {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-top: 24upx;
    margin-bottom: 24upx;

    .quantity-btn {
      width: 60upx;
      height: 60upx;
      border: 2upx solid #e5e5e5;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32upx;
      color: #333;

      &.minus {
        border-radius: 8upx 0 0 8upx;
      }

      &.plus {
        border-radius: 0 8upx 8upx 0;
      }
    }

    .quantity {
      width: 80upx;
      height: 60upx;
      border-top: 2upx solid #e5e5e5;
      border-bottom: 2upx solid #e5e5e5;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28upx;
      color: #333;
      text-align: center;
    }
  }

  // 购券用途
  .purpose-options {
    display: flex;
    .purpose-item {
      display: flex;
      align-items: center;
      .purpose-icon {
        width: 40upx;
        height: 40upx;
        margin-right: 16upx;
      }

      .purpose-text {
        font-size: 28upx;
        color: #333;
      }
    }
    .purpose-item  + .purpose-item {
      margin-left: 32upx;
    }
  }

// 送好友区域
.friend-gift-section {
  margin-bottom: 20upx;

  .section-title {
    font-size: 30upx;
    font-weight: bold;
    color: #333;
    margin-bottom: 30upx;
  }
}

.coupon-btn {
	display: flex;
	margin-right: 0;
	align-items: center;
	background-color: #584219;

    .coupon-btn-text {
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


  // 空内容提示
  .empty-content {
    padding: 100upx 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400upx;
  }

  // 我赠送的券列表
  .sent-list {
    .sent-item {
      background-color: white;
      border-radius: 32upx;
      padding: 32upx;
      margin-bottom: 24upx;
      box-shadow: 0 4upx 12upx rgba(0, 0, 0, 0.08);

      .coupon-info {
        display: flex;
        border-bottom: 1px dashed #0000000F;
        margin-bottom: 32upx;
        padding-bottom: 32upx;

        .coupon-image {
          width: 144upx;
          height: 144upx;
          border-radius: 16upx;
          margin-right: 48upx;
          flex-shrink: 0;
        }

        .coupon-details {
          flex: 1;

          .coupon-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8upx;

            &:last-child {
              margin-bottom: 0;
            }

            .label {
              font-size: 28upx;
              color: #00000073;
              min-width: 120upx;
            }

            .value {
              font-size: 28upx;
              font-weight: 500;
              text-align: right;

              &.price {
                color: #584219;
              }
            }
          }
        }
      }

      .status-section {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .status-badge {
          font-size: 30upx;
          font-weight: 600;
          .icon {
            width: 40upx;
            height: 40upx;
            margin-right: 16upx;
            vertical-align: sub;
          }

          &.pending {
            // background-color: #FFF3E0;
            // color: #FF9800;
          }

          &.received {
            // background-color: #E8F5E8;
            // color: #4CAF50;
          }

          &.expired {
            // background-color: #FFEBEE;
            color: #F44336;
          }
        }

        .btn {
          text {
            font-size: 28upx;
            color: white;
            margin-right: 8upx;
          }

          .arrow-icon {
            width: 28rpx;
            height: 28upx;
            margin-left: 10rpx;
            vertical-align: middle;
          }
        }
      }
    }
  }

  // 我的优惠券列表样式
  .my-coupons-list {
    .coupon-card {
      background-color: white;
      border-radius: 24upx;
      margin-bottom: 24upx;
      padding: 32upx;
      display: flex;
      align-items: center;
      position: relative;
      border: 2upx solid #f0f0f0;
      transition: all 0.3s ease;
      box-shadow: 0 4upx 12upx rgba(0, 0, 0, 0.08);
      overflow: hidden;

      // 上下凹槽效果
      &::before,
      &::after {
        content: '';
        position: absolute;
        width: 32upx;
        height: 32upx;
        background-color: #f5f5f5;
        border-radius: 50%;
        z-index: 1;
      }

      &::before {
        top: 50%;
        left: -16upx;
        transform: translateY(-50%);
        box-shadow: inset 0 0 8upx rgba(0, 0, 0, 0.1);
      }

      &::after {
        top: 50%;
        right: -16upx;
        transform: translateY(-50%);
        box-shadow: inset 0 0 8upx rgba(0, 0, 0, 0.1);
      }

      &.selected {
        border-color: #584219;
        background-color: #faf9f7;
        box-shadow: 0 6upx 20upx rgba(88, 66, 25, 0.15);

        &::before,
        &::after {
          background-color: #f0ede6;
        }
      }

      &:active {
        transform: scale(0.98);
      }

      .checkbox {
        margin-right: 24upx;
        position: relative;
        z-index: 2;

        .checkbox-inner {
          width: 40upx;
          height: 40upx;
          border: 2upx solid #ddd;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          box-shadow: 0 2upx 4upx rgba(0, 0, 0, 0.1);
          background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);

          &.checked {
            background: linear-gradient(135deg, #584219 0%, #6b4e26 100%);
            border-color: #584219;
            box-shadow: 0 3upx 8upx rgba(88, 66, 25, 0.3);
            transform: scale(1.05);
          }

          .check-icon {
            color: white;
            font-size: 24upx;
            font-weight: bold;
            text-shadow: 0 1upx 2upx rgba(0, 0, 0, 0.2);
          }
        }
      }

      .coupon-content {
        flex: 1;
        display: flex;
        position: relative;
        z-index: 2;

        .coupon-left {
          width: 160upx;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-right: 2upx dashed #e5e5e5;
          margin-right: 24upx;
          padding-right: 24upx;
          position: relative;

          // 添加渐变背景
          &::before {
            content: '';
            position: absolute;
            top: -10upx;
            left: -10upx;
            right: -10upx;
            bottom: -10upx;
            background: linear-gradient(135deg, rgba(88, 66, 25, 0.05) 0%, rgba(88, 66, 25, 0.02) 100%);
            border-radius: 16upx;
            z-index: -1;
          }

          .coupon-image{
            width: 200upx;
            height: 150upx;
          }

          .coupon-value {
            font-size: 36upx;
            font-weight: bold;
            color: #584219;
            margin-bottom: 8upx;
            text-shadow: 0 1upx 2upx rgba(88, 66, 25, 0.1);
          }

          .coupon-condition {
            font-size: 20upx;
            color: #999;
            text-align: center;
            background-color: rgba(88, 66, 25, 0.08);
            padding: 4upx 8upx;
            border-radius: 8upx;
          }
        }

        .coupon-right {
          flex: 1;

          .coupon-name {
            font-size: 32upx;
            font-weight: bold;
            color: #333;
            margin-bottom: 8upx;
          }

          .coupon-desc {
            font-size: 24upx;
            color: #666;
            margin-bottom: 8upx;
          }

          .coupon-expire {
            font-size: 22upx;
            color: #999;
          }
        }
      }

      .coupon-status {
        position: absolute;
        top: 16upx;
        right: 16upx;
        padding: 8upx 16upx;
        border-radius: 12upx;
        font-size: 20upx;
        font-weight: 500;
        z-index: 3;
        box-shadow: 0 2upx 6upx rgba(0, 0, 0, 0.1);

        &.available {
          background: linear-gradient(135deg, #e8f5e8 0%, #d4edda 100%);
          color: #4caf50;
          border: 1upx solid rgba(76, 175, 80, 0.2);
        }

        &.used {
          background: linear-gradient(135deg, #f5f5f5 0%, #e9ecef 100%);
          color: #999;
          border: 1upx solid rgba(153, 153, 153, 0.2);
        }

        &.expired {
          background: linear-gradient(135deg, #ffebee 0%, #f8d7da 100%);
          color: #f44336;
          border: 1upx solid rgba(244, 67, 54, 0.2);
        }
      }

      // 不可选择状态的样式
      &:has(.coupon-status.used),
      &:has(.coupon-status.expired) {
        opacity: 0.6;

        .checkbox .checkbox-inner {
          background-color: #f5f5f5;
          border-color: #ddd;
        }
      }
    }
  }

  // 优惠券操作栏
  .coupon-actions {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: white;
    padding: 24upx 32upx;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 -4upx 20upx rgba(0, 0, 0, 0.1);
    z-index: 100;

    .selected-count {
      font-size: 28upx;
      color: #666;
    }
  }

  // 底部购买栏
  .bottom-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: white;
    padding: 30upx;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 -4upx 20upx rgba(0, 0, 0, 0.1);

    .bottom-note {
      position: absolute;
      top: -20rpx;
      right: 0rpx;
      background-color: #fde2e2;
      color: #f56c6c;
      padding: 4rpx 12rpx;
      border-radius: 20rpx;
      font-size: 20rpx;
      line-height: 1.2;
      white-space: nowrap;
    }

    .total-price {
      .label {
        font-size: 28upx;
        vertical-align: text-bottom;
      }

      .price {
        font-size: 44upx;
        font-weight: bold;
        color: #584219;
      }
    }

    .buy-btn {
      font-size: 30upx;
      padding: 24upx 114upx;
      background-color: #584219;
      margin-right: 0;
      color: white;
      flex: 1;
      margin-left: 30upx;
    }
  }
}
</style>
