<template>
  <el-dialog title="二维码支付" :visible.sync="dialogVisible" :before-close="handleClose" width="400px" modal-append-to-body
             append-to-body :close-on-click-modal="false">
    <div class="QrCodePayDialog">
      <div v-if="payed" style="height: 400px;font-size: 30px;" class="flex flex-column align-center justify-center">
        <div>
          <i class="el-icon-success c-success"></i>已成功支付
        </div>
        <div style="margin-top: 10px">
          （{{ counter }}）秒后将关闭弹框
        </div>
      </div>
      <div v-show="!payed && dialogVisible" style="text-align: center;margin-top: 20px">
        <div class="payment-container" :class="pay[payCode].style">
          <div class="payment-header">
            <div class="payment-logo">{{ pay[payCode].cn }} {{ pay[payCode].en }}</div>
            <!--            <div class="payment-title">扫码支付</div>-->
          </div>
          <div class="qrcode-placeholder">
            <div class="qrcode-mock">
              <div v-if="(payCode == 'a_native' && !aliPayImageUrl) || (payCode == 'wx_wap_scan' && !wxPayImageUrl)"
                   style="height: 146px"></div>
              <img v-show="payCode == 'a_native'" class="image" :src="aliPayImageUrl">
              <img v-show="payCode == 'wx_wap_scan'" class="imagewx" :src="wxPayImageUrl">
              <div class="price-section" v-show="payAmount">
                <div class="discount-price" v-show="payAmount">
                  ￥<span class="amount">{{ payAmount }}</span>
                </div>
                <div class="original-price" v-show="totalAmount && payAmount != totalAmount">￥{{ totalAmount }}</div>
              </div>
            </div>
          </div>
          <div class="payment-footer">
            <div class="payment-notice">请使用{{ pay[payCode].cn }}扫码完成支付</div>
          </div>
        </div>
      </div>
      <el-radio-group v-model="payCode" @change="onPayCodeChange" v-show="!payed && dialogVisible">
        <el-radio border label="a_native" value="a_native">支付宝 Alipay</el-radio>
        <el-radio border label="wx_wap_scan" value="wx_wap_scan">微信 Wechatpay</el-radio>
      </el-radio-group>
    </div>
  </el-dialog>
</template>

<script>
import orderApi from '../../api/order/order'

export default {
  name: 'QrCodePayDialog',
  components: {},
  props: {},
  data() {
    return {
      dialogVisible: false,
      orderCode: '',
      payed: false,
      timer: null,
      counter: 4,
      wxPayImageUrl: '',
      aliPayImageUrl: '',
      payCode: 'wx_wap_scan',
      payAmount: 0,
      totalAmount: 0,
      pay: {
        a_native: {
          cn: '支付宝',
          en: 'Alipay',
          style: 'alipay-style'
        },
        wx_wap_scan: {
          cn: '微信',
          en: 'Wechatpay',
          style: 'wechat-style'
        }
      }
    }
  },
  watch: {
    dialogVisible: {
      handler(newVal) {
        if (newVal) {
          this.startTimer();
        } else {
          this.clearTimer();
        }
      },
      immediate: true
    },
    payed: {
      handler(newVal) {
        if (newVal) {
          this.startPayedTimer();
        } else {
          this.clearTimer();
        }
      },
      immediate: true
    },
  },
  methods: {
    handleClose() {
      this.dialogVisible = false
      this.counter = 4
      this.payed = false
    },
    open(orderCode, payAmount, totalAmount) {
      this.dialogVisible = true
      this.orderCode = orderCode
      this.payAmount = payAmount
      this.totalAmount = totalAmount
      this.wxPayImageUrl = ''
      this.aliPayImageUrl = ''
      this.payCode = 'a_native'//打开默认支付宝
      this.onPayCodeChange('a_native')
    },
    async onPayCodeChange(payCode) {
      if (this.orderCode) {
        console.log("this.aliPayImageUrl")
        console.log(this.aliPayImageUrl)
        console.log(this.wxPayImageUrl)
        if (payCode == 'a_native' && this.aliPayImageUrl) {
          return
        }
        if (payCode == 'wx_wap_scan' && this.wxPayImageUrl) {
          return
        }
        this.showFullLoading()
        const res = await orderApi.getPayCode(this.orderCode, payCode)

        this.hideFullLoading()
        if (payCode == 'a_native') {
          this.aliPayImageUrl = URL.createObjectURL(res.data)
        } else {
          this.wxPayImageUrl = URL.createObjectURL(res.data)
        }
      }
    },
    startTimer() {
      this.payed = false;
      this.timer = setInterval(async () => {
        let res = await orderApi.payedInfo(this.orderCode)
        if (res.data) {
          this.payed = true
          this.$emit("fetch")
          this.clearTimer()
        }
      }, 1500);
    },
    clearTimer() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    },
    startPayedTimer() {
      this.counter = 4; // 重置计数器
      this.timer = setInterval(() => {
        this.counter--
        if (this.counter == 0) {
          this.handleClose()
          this.clearTimer()
        }
      }, 1000);
    },
  },
  beforeDestroy() {
    this.clearTimer();
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.QrCodePayDialog {
  margin-top: -20px;
  text-align: center;

  .image {
    padding: 15px;
    height: 180px;
  }

  .imagewx {
    height: 180px;
  }


  /* 基础变量 */

  .payment-container {
    --wechat-brand: #07C160;
    --alipay-brand: #1677FF;
    --original-price-color: #FF4D4F;
    --badge-red: #FF4D4F;
    --badge-orange: #FF8F1F;
  }

  /* 基础样式 */

  .payment-container {
    width: 280px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    font-family: "PingFang SC", "Helvetica Neue", sans-serif;
    color: #333;
    text-align: center;
    margin: 20px auto;
    overflow: hidden;
    background-color: var(--brand-color);
  }

  .payment-header {
    padding: 16px 0;
    color: white;
    background-color: #FFFFFF;
  }

  .payment-logo {
    font-size: 22px;
    font-weight: bold;
    margin-bottom: 5px;
  }

  .payment-title {
    font-size: 16px;
    opacity: 0.9;
  }

  .qrcode-placeholder {
    padding: 25px;
  }

  .qrcode-mock {
    width: 220px;
    height: 245px;
    margin: 0 auto;
    background: #fff;
    border: 1px dashed #ddd;
    padding-top: 10px;
    color: #999;
  }

  /* 价格区域 */

  .price-section {
    display: flex;
    justify-content: center;
    align-items: center;
    background: #fff;
    margin: 0 auto;
    padding-bottom: 10px;
  }

  .original-price {
    color: var(--original-price-color);
    font-size: 18px;
    font-weight: bold;
    text-decoration: line-through;
  }

  .original-price::before {
    font-size: 14px;
    background: #FFECEC;
    color: var(--original-price-color);
    padding: 2px 8px;
    border-radius: 4px;
    margin-right: 8px;
  }

  .discount-price {
    font-size: 28px;
    font-weight: bold;
    color: var(--brand-color);
    display: flex;
    align-items: baseline;
    justify-content: center;
  }

  .discount-price .amount {
    font-size: 36px;
    margin: 0 3px;
  }

  .discount-badge {
    font-size: 14px;
    color: white;
    padding: 3px 8px;
    border-radius: 4px;
    margin-left: 10px;
    position: relative;
    top: -2px;
  }

  .payment-footer {
    font-size: 13px;
    color: #999;
    padding-bottom: 20px;
  }

  .payment-notice {
    display: inline-block;
    padding: 5px 15px;
    background: #f9f9f9;
    border-radius: 15px;
  }

  /* 品牌差异化样式 */

  .wechat-style {
    --brand-color: var(--wechat-brand);
  }

  .alipay-style {
    --brand-color: var(--alipay-brand);
  }

  .wechat-style .payment-header {
    color: var(--wechat-brand);
  }

  .alipay-style .payment-header {
    color: var(--alipay-brand);
  }

  .wechat-style .discount-badge {
    background: var(--badge-red);
  }

  .alipay-style .discount-badge {
    background: var(--badge-orange);
  }
}
</style>
