<template>
  <div class="OrderDetail">
    <el-drawer :show-close="true" :visible.sync="showDrawer" :z-index="108" append-to-body size="61%" title="订单详情"
               :before-close="close"
               z-index="1000"
    >
      <div style="padding: 0 20px">
        <div>
          <description-title>订单信息</description-title>
          <el-card style="margin: 16px 0">
            <el-descriptions title="">
              <!--           todo -->

              <el-descriptions-item label="所属门店">{{ order.shopId | shopNameFilter }}</el-descriptions-item>
              <el-descriptions-item label="订单编号">{{ order.code }}</el-descriptions-item>
              <el-descriptions-item label="产品名称">{{ order.productTitle }}</el-descriptions-item>
              <el-descriptions-item label="客户称呼">{{ order.customerNickname }}</el-descriptions-item>
              <el-descriptions-item label="总金额">{{ order.totalAmount }}元</el-descriptions-item>
              <el-descriptions-item label="实付金额">
                <span v-if="order.state==0 || order.state==3 || order.state==4">0</span>
                <span v-else-if="order.couponPayAmount">{{ order.couponPayAmount }}</span>
                <span v-else> {{ order.payAmount }}</span>
                元
              </el-descriptions-item>
              <el-descriptions-item label="用券数量" v-if="order.type==0">{{ order.couponAmount }}张</el-descriptions-item>
              <el-descriptions-item label="支付状态">{{ order.state | orderStateFilter }}</el-descriptions-item>
              <el-descriptions-item label="支付时间">{{ order.payTime }}</el-descriptions-item>
              <el-descriptions-item label="积分抵扣金额" >{{ order.integrationAmount }}元  <!--v-if="order.type==1"-->
              </el-descriptions-item>
              <el-descriptions-item label="预约类型" v-if="order.type==0">
                {{ order.appointmentType | appointmentTypeFilter }}
              </el-descriptions-item>
              <el-descriptions-item label="预约人数" v-if="order.type==0"> {{ order.orderDetailList.length }}位</el-descriptions-item>
              <!--              <el-descriptions-item label="预约状态"  v-if="order.type==0">{{ order.appointmentState | appointmentStateFilter }}
                            </el-descriptions-item>-->
              <el-descriptions-item label="订单备注">{{ order.comment }}</el-descriptions-item>
              <el-descriptions-item label="取消原因" v-if="order.state==4">{{ order.cancelReason }}</el-descriptions-item>
            </el-descriptions>
          </el-card>
        </div>
        <description-title>订单详情</description-title>
        <el-card style="margin-top: 16px" v-for="(item,index) in order.orderDetailList || []" :key="index">
          <el-descriptions title="">
            <!--           todo -->
            <el-descriptions-item label="项目">{{ item.projectTitle }}</el-descriptions-item>
            <el-descriptions-item label="床位">{{ item.bedName }}</el-descriptions-item>
            <el-descriptions-item label="疗愈师">{{ item.massagistId | massagistNameFilter }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ item.state | appointmentStateFilter }} &nbsp;&nbsp; {{order.cancelOrderType | ordercancelOrderTypeFilter}}</el-descriptions-item>
            <el-descriptions-item label="预约开始时间">{{ item.startTime }}</el-descriptions-item>
            <el-descriptions-item label="预约结束时间">{{ item.endTime }}</el-descriptions-item>
            <el-descriptions-item label="预计服务时长">{{ item.duration }}min</el-descriptions-item>
            <el-descriptions-item v-if="item.comment" label="服务备注">{{ item.comment }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
        <el-card style="margin-top: 16px" v-for="(item,index) in order.customerCouponList || []" :key="index">
          <el-descriptions title="">
            <!--           todo -->
            <el-descriptions-item label="卡券名称">{{ item.coupon.title }}</el-descriptions-item>
            <el-descriptions-item label="code">{{ item.code }}</el-descriptions-item>
            <!--            <el-descriptions-item label="优惠抵扣金额">{{ item.coupon.amount }}</el-descriptions-item>-->
            <!--            <el-descriptions-item label="可使用次数">{{ item.count }}</el-descriptions-item>-->
            <el-descriptions-item label="卡券类型">{{ item.coupon.useType | couponUseTypeFilter }}</el-descriptions-item>
            <el-descriptions-item label="使用状态">{{ item.state | customerCouponStateFilter }}</el-descriptions-item>
            <el-descriptions-item label="有效期起">{{ item.startTime }}</el-descriptions-item>
            <el-descriptions-item label="有效期止">
              {{ !item.endTime || (item.endTime && item.endTime.startsWith('2')) ? item.endTime : '永久有效' }}
            </el-descriptions-item>
            <el-descriptions-item label="是否可以赠送">{{ item.isCanGift ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="使用的订单" v-if="item.useOrder">
              <div class="c-primary" @click="showOrderDetail(item.useOrder)">查看详情</div>
            </el-descriptions-item>
            <!--            <el-descriptions-item label="使用时间" v-if="item.state==1">{{ item.useTime }}</el-descriptions-item>-->
          </el-descriptions>
        </el-card>
      </div>


    </el-drawer>
    <!--    <order-detail ref="refOrderDetail"></order-detail>-->
    <component :is="activeName" ref="refComponent"></component>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import DescriptionTitle from "@/views/order/approval/DescriptionTitle";
import orderApi from "@/api/order/order";

export default {
  name: 'OrderDetail',
  components: {DescriptionTitle},
  props: {},
  data() {
    return {
      showDrawer: false,
      activeName: '',
      order: {},
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
  },
  methods: {
    open(order) {
      this.order = {...order}
      this.initData()
      this.showDrawer = true
    },
    showOrderDetail(id) {
      this.activeName = 'OrderDetail'
      this.$refs.refComponent.open({id})
    },
    async initData() {
      let res = await orderApi.info(this.order.id)
      this.order = res.data || this.order
    },
    close() {
      this.showDrawer = false
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.OrderDetail {
}
</style>
