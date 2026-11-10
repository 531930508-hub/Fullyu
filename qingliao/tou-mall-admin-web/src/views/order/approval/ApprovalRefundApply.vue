<template>
  <div class="ApprovalRefundApply">
    <el-descriptions style="margin-top: 10px;padding-left: 10px">
      <el-descriptions-item label="订单编号">{{detailData.orderCode}}</el-descriptions-item>
      <el-descriptions-item label="退款金额">{{detailData.refundAmount}}</el-descriptions-item>
      <el-descriptions-item label="退款原因">{{detailData.refundReason}}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  name: 'ApprovalRefundApply',
  props: {
    detailData: {
      default: null,
      type: Number
    },
  },
  data() {
    return {}
  },
  computed: {
    ...mapGetters([])
  },
  created() {
  },
  methods: {}
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ApprovalRefundApply {
}
</style>
