<template>
  <div>
    <el-drawer :show-close="true" :visible.sync="showDrawer" custom-class="PadReceptionOrderDetail" size="400px"
               title="接待详情"
               :before-close="close">
      <div style="padding: 0 24px;height: calc(100vh - 85px);" class="flex flex-column">
        <el-descriptions :column="1" labelClassName="c-c1c0c4" :colon="false" contentClassName="c-49454f"
                         style="padding: 28px 0;margin: 28px 0; border-bottom: 1px #E5E5E5 dashed;border-top: 1px #E5E5E5 dashed;">
          <el-descriptions-item label="接待状态"> <span class="status" :class="[
            orderDetail.state==0?'red':
            orderDetail.state==1?'green':
            orderDetail.state==2?'white':
            orderDetail.state==3?'yellow':
            'white'
          ]">{{ orderDetail.state | receptionStateFilter }} </span></el-descriptions-item>
          <el-descriptions-item label="接待时段">
            {{ orderDetail.startTime | formatDateTime }}-{{ orderDetail.endTime  | formatDateTime }}
          </el-descriptions-item>
          <el-descriptions-item label="接待时长"> {{ orderDetail.duration }} mins</el-descriptions-item>
          <el-descriptions-item label="接待人员">
            <div class="flex align-center justify-end">
              <el-avatar :src="orderDetail.massagist.avatarUrl"
                         style="width: 24px;height: 24px;margin-right: 8px"></el-avatar>
              {{ orderDetail.massagist.name }}
<!--              <img v-if="orderDetail.specifyType ==1" src="@/assets/images/specify-type-icon.png" height="10"-->
<!--                   style="margin-left: 2px" width="10"/>-->
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="接待备注">
            {{ orderDetail.comment }}
            <i class="el-icon-edit" style="cursor: pointer;padding: 0 4px" @click="updateComment(orderDetail)"></i>
          </el-descriptions-item>
        </el-descriptions>
        <div class="flex1 flex flex-column justify-end">
          <el-button @click="handleDoing(orderDetail)" class="btn-A"
                     v-if="(orderDetail.order.state==1 || orderDetail.order.state==2) &&orderDetail.state==0">开始接待
          </el-button>
          <el-button @click="updForm" class="btn-B">修改接待</el-button>
          <el-button
            class="btn-B"
            @click="cancelOrder(orderDetail)">取消接待
          </el-button>
        </div>
      </div>
    </el-drawer>
    <upd-reception-order-form ref="refUpdReceptionOrderForm" @submit-success="submitSuccess"></upd-reception-order-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import dateUtil from "@/utils/dateUtil";
import orderApi from "@/api/order/order";
import orderDetailApi from "@/api/order/orderDetail";
import CancelOrderDialog from "./CancelOrderDialog";
import UpdReceptionOrderForm from "./UpdReceptionOrderForm";

export default {
  name: 'PadReceptionOrderDetail',
  components: {
    UpdReceptionOrderForm,
    CancelOrderDialog,
  },
  props: {},
  data() {
    return {
      showDrawer: false,
      orderDetail: {massagist: {avatarUrl: ''}, order: {}}
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
  },
  methods: {
    async open(orderDetail = {massagist: {avatarUrl: ''}, order: {}}) {
      await this.initOrderDetail(orderDetail.id)
      this.showDrawer = true
      this.oldDetail = orderDetail
    },
    async initOrderDetail(id) {
      let res = await orderDetailApi.info(id);
      this.orderDetail = res.data || { massagist: {avatarUrl: ''}, order: {}}
    },
    submitSuccess() {
      this.$emit("submit-success")
      this.close()
    },
    close() {
      this.showDrawer = false
      this.orderDetail = {massagist: {}, order: {}}
    },
    updForm() {
      this.$refs.refUpdReceptionOrderForm.open(this.orderDetail.orderId)
    },
    async cancelOrder(row) {
      await this.notifyConfirm("此操作将要取消接待任务，确定要取消吗？")
      await orderApi.cancelOrder(row.orderId)
      this.notifySuccess()
      this.$emit("submit-success")
      this.close()
    },
    async updateComment(row) {
      this.$prompt('请输入备注内容', '更改备注', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputPattern: /^.+$/,
        inputValue: row.comment,
        inputErrorMessage: '备注内容不能为空'
      }).then(async ({value}) => {
        await orderDetailApi.updateComment(row.id, value)
        this.notifySuccess()
        row.comment = value
        if (this.oldDetail && this.oldDetail.order) {
          this.oldDetail.order.comment = value
        }
        this.$emit("submit-success")
      })
    },
    async handleDoing(row) {
      await this.notifyConfirm('确认开始接待吗？')
      this.showFullLoading()
      await orderDetailApi.doingService(row.id)
      this.hideFullLoading()
      row.state = 1
      this.notifySuccess()
      this.$emit("submit-success")
    },
  },
  filters: {
    formatDateTime(timeStr) {
      if (timeStr) {
        return dateUtil.format(timeStr, "HH:mm");
      }
      return ''
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less">
.PadReceptionOrderDetail {
  .el-drawer__header {
    margin-bottom: 0;
  }


  .c-c1c0c4 {
    color: #49454F73;
    font-size: 17px;
  }

  .c-49454f {
    display: block;
    width: 100%;
    text-align: right;
    color: #49454f;
    font-size: 17px;
  }

  .btn-A {
    background-color: #6750a4;
    color: #FFFFFF;
    width: 100%;
    border-radius: 12px;
    border: 1px solid #6750a4;
    margin-left: 0;
    margin-bottom: 10px;
  }

  .btn-B {
    background-color: #FFFFFF;
    border: 1px solid #d7d3db;
    width: 100%;
    color: #54515a;
    border-radius: 12px;
    margin-left: 0;
    margin-bottom: 10px;
  }

  .status {
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 14px;

    &.red {
      background-color: #FDD3D0;
      color: #900B09;
    }

    &.green {
      background-color: #CFF7D3;
      color: #02542D;
    }

    &.white {
      background-color: #F5F5F5;
      color: #1E1E1E;
    }

    &.yellow {
      background-color: #E8B931;
      color: #401B01;
    }
  }
}
</style>
