<template>
  <div class="RefundForm">
    <el-dialog
      :title="'退款申请'"
      :visible.sync="dialogVisible"
      width="30%"
      append-to-body
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">

        <el-form-item label="退款金额" prop="refundAmount"
                      :rules="[{required: true, message: '请输入退款金额', trigger: ['blur', 'change']}]">
          <el-input-number style="width: 100%" v-model="form.refundAmount" @change="handleChange" :min="0.00"
                           :max="order.payAmount" placeholder="退款金额"></el-input-number>
          <el-alert style="margin-top: 10px">本订单使用{{order.couponAmount}}张卡券支付，审批通过卡券会退还给客户</el-alert>
        </el-form-item>
        <el-form-item label="退款原因" prop="refundReason"
                      :rules="[{required: true, message: '请输入退款原因', trigger: ['blur', 'change']}]">
          <el-input
            type="textarea"
            :rows="2" :maxlength="255" show-word-limit
            placeholder="请输入退款原因"
            v-model="form.refundReason">
          </el-input>
        </el-form-item>

      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">取 消</el-button>
        <el-button type="primary" @click="onSubmit">确 定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import refundApplyApi from "@/api/order/refundApply";
import orderApi from "@/api/order/order";

export default {
  name: 'RefundForm',
  components: {},
  props: {},
  data() {
    return {
      form: {},
      dialogVisible: false,
      order: {}
    }
  },
  computed: {
    ...mapGetters(['userId', 'shopId'])
  },
  created() {
  },
  methods: {
    async resetOpen(form = {}) {
      if (form.orderId) {
        const res = await orderApi.list({id: form.orderId})
        this.order = res.data[0] || {}
      }
      this.form = {...form}
      this.dialogVisible = true
    },
    open(order = {}) {
      this.order = order
      this.form = {
        orderId: order.id,
        type: 1,
        shopId: order.shopId ? order.shopId : this.shopId,
        customerId: order.customerId,
        createUser: this.userId
      }
      if (order.couponAmount > 0 && order.payAmount == 0){
        this.form.refundAmount = 0
      }
      this.dialogVisible = true
    },
    handleClose() {
      this.dialogVisible = false
      this.form = {}
      this.order = {}
    },
    handleChange(value) {
      let formattedValue = value.toString().replace(/^(\d+(\.\d{0,2})?).*$/, '$1');
      if (parseFloat(formattedValue) < 0) {
        formattedValue = '0';
      }
      if (parseFloat(formattedValue) > this.order.payAmount) {
        formattedValue = this.order.payAmount.toFixed(2);
      }
      this.form.refundAmount = formattedValue;
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      this.showFullLoading()
      await refundApplyApi.add(this.form)
      this.hideFullLoading()
      this.handleClose()
      this.$notify.success("操作成功")
      this.$emit("submit-success")
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.RefundForm {
}
</style>
