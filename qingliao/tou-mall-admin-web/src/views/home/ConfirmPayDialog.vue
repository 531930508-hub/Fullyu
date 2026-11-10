<template>
  <el-dialog title="确认收款" :visible.sync="dialogVisible" width="400px" modal-append-to-body
             append-to-body :close-on-click-modal="false">
    <div class="ConfirmPayDialog">
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">
        <el-form-item v-if="payType == 3" label="点评券号" prop="couponCode"
                      :rules="[{required: true, message: '请输入点评券号', trigger: ['blur', 'change']}]">
          <el-input v-model="form.couponCode" placeholder="点评券号" clearable></el-input>
        </el-form-item>
        <el-form-item label="实付金额" prop="payAmount"
                      :rules="[{required: true, message: '请输入实付金额', trigger: ['blur', 'change']}]">
          <el-input-number v-model="form.payAmount" :precision="2" :step="1" style="width: 100%"
                           placeholder="请输入实付金额"></el-input-number>
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer" style="float: right">
        <el-button class="btn-B m-r-10" @click="dialogVisible = false">取 消</el-button>
        <el-button type="primary" @click="onSubmit" class="btn-A">确 定</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import orderApi from "../../api/order/order"

export default {
  name: 'ConfirmPayDialog',
  components: {},
  props: {},
  data() {
    return {
      dialogVisible: false,
      form: {
        payAmount: 0
      },
      payType: ''
    }
  },
  methods: {
    open(orderId, payAmount, payType, couponCode) {
      this.form = {payAmount: 0}
      this.dialogVisible = true
      this.form.id = orderId
      if (payAmount) {
        this.form.payAmount = parseFloat(payAmount).toFixed(2)
      }
      if (couponCode) {
        this.form.couponCode = couponCode
      }
      this.payType = payType
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      this.showFullLoading()
      await orderApi.confirmPay(this.form)
      this.hideFullLoading()
      this.dialogVisible = false
      this.$emit('submit-success', this.form)
      this.notifySuccess()
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ConfirmPayDialog {
  padding-bottom: 20px;

  .btn-A {
    background-color: #6750a4;
    color: #FFFFFF;
    border: 1px solid #6750a4;
    border-radius: 16px;
    margin-left: 0;
    margin-bottom: 10px;
  }

  .btn-B {
    background-color: #FFFFFF;
    border: 1px solid #d7d3db;
    color: #54515a;
    border-radius: 16px;
    margin-left: 0;
    margin-bottom: 10px;
  }
}
</style>
