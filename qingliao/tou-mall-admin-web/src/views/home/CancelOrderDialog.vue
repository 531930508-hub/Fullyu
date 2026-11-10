<template>
  <el-dialog title="取消订单" :visible.sync="dialogVisible" width="450px" modal-append-to-body
             append-to-body :close-on-click-modal="false">
    <div class="CancelOrderDialog">
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">
        <el-form-item label="取消原因" prop="refundReason"
                      :rules="[{required: true, message: '请输入取消原因', trigger: ['blur', 'change']}]">
          <el-input v-model="form.refundReason" placeholder="取消原因" clearable></el-input>
          <el-radio-group v-model="form.refundReason" size="mini" class="radio">
            <el-radio-button v-for="item in reasonList || []" :key="item" :label="item">
              {{ item }}
            </el-radio-button>
          </el-radio-group>
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
import refundApplyApi from "../../api/order/refundApply"
import {mapGetters} from "vuex"

export default {
  name: 'CancelOrderDialog',
  components: {},
  props: {},
  data() {
    return {
      dialogVisible: false,
      form: {},
      order: {},
      reasonList: ['建错了', '不接电话', '改变计划']
    }
  },
  computed: {
    ...mapGetters(['shopId','userId'])
  },
  methods: {
    open(order) {
      this.form = {order}
      this.order = order
      this.dialogVisible = true
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      let submitForm = {
        orderId: this.order.id,
        type: 0,
        shopId: this.order.shopId ? this.order.shopId : this.shopId,
        createUser: this.userId,
        refundReason: this.form.refundReason,
        cancelOrderType:2//取消订单类型：0用户取消，1超时取消，2管理员取消
      }
      await this.notifyConfirm("此操作将要取消此订单所有关联服务项目？确定要取消吗？")
      this.showFullLoading()
      await refundApplyApi.add(submitForm)
      this.hideFullLoading()
      this.$emit("submit-success")
      this.notifySuccess()
      this.dialogVisible = false
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.CancelOrderDialog {
  padding-bottom: 20px;

  .radio {
    margin-top: 5px;

    /deep/ .el-radio-button:not(:first-child) .el-radio-button__inner {
      border-left: 1px solid #DCDFE6 !important;
    }

    /deep/ .el-radio-button__inner {
      border-radius: 6px;
      color: #49454f;
    }

    /deep/ .el-radio-button + .is-active:not(:first-child) .el-radio-button__inner {
      border-left: 1px solid #e8def8 !important;
    }

    /deep/ .el-radio-button__orig-radio:disabled + .el-radio-button__inner {
      color: #c0c4cc;
      cursor: not-allowed;
      background-image: none;
      background-color: #fff;
      border-color: #ebeef5;
      box-shadow: none;
    }

    /deep/ .el-radio-button .el-radio-button__inner {
      margin-right: 6px;
      margin-bottom: 6px;
    }

    /deep/ .el-radio-button__orig-radio:checked + .el-radio-button__inner {
      background-color: #e8def8;
      border-color: #e8def8;
      box-shadow: -1px 0 0 0 #e8def8;
      color: #4a4459;

      &::before {
        content: "";
        display: inline-block;
        width: 10px;
        position: relative;
        height: 6px;
        top: -2px;
        border-left: 2px solid #4a4459;
        border-bottom: 2px solid #4a4459;
        transform: rotate(-45deg);
        margin-right: 5px;
      }
    }
  }

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
