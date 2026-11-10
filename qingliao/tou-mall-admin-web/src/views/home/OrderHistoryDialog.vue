<template>
  <el-dialog :title="title" :visible.sync="dialogVisible" width="1000px" modal-append-to-body
             append-to-body>
    <div class="OrderHistoryDialog">
      <el-date-picker
        v-model="appointmentRange" style="width: 260px;margin-bottom: 10px;margin-right: 10px"
        type="daterange" @change="appointmentRangeChange"
        range-separator="-"
        value-format="yyyy-MM-dd HH:mm:ss"
        start-placeholder="预约时间" :default-time="['00:00:00','23:59:59']"
        end-placeholder="范围">
      </el-date-picker>
      <el-input placeholder="备注" v-model.trim="searchForm.comment" clearable
                @clear="searchData" @change="searchData"
                style="width: 220px">
      </el-input>
      <el-table :data="dataList" style="width: 100%;" :row-style="getOrderLabelStyle">
        <el-table-column label="所属门店" prop="shopId" show-overflow-tooltip width="150">
          <template slot-scope="scope">
            {{ scope.row.shopId | shopNameFilter }}
          </template>
        </el-table-column>
        <el-table-column label="预约时间" prop="startTime" width="140px" show-overflow-tooltip>
          <template slot-scope="scope">
            <div>{{ scope.row.startTime | formatYYYYMMDDHHmm }}</div>
          </template>
        </el-table-column>
        <el-table-column label="产品名称" prop="productTitle" width="90" show-overflow-tooltip></el-table-column>
        <el-table-column label="实付金额" prop="payAmount" width="100px">
          <template slot-scope="scope">
            <span v-if="scope.row.state==0 || scope.row.state==3 || scope.row.state==4">0 元</span>
            <span v-else-if="scope.row.couponPayAmount">
                <span v-if="scope.row.payAmount && (scope.row.payType==3 || scope.row.payType==4)">
                  {{ scope.row.couponPayAmount }}元
                </span>
                <span v-else>{{ scope.row.couponPayAmount }}元</span>
              </span>
            <span v-else>{{ scope.row.payAmount }}元</span>
          </template>
        </el-table-column>
        <el-table-column label="支付方式" prop="payType" width="100px" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.payType | orderPayTypeFilter }}
          </template>
        </el-table-column>
        <el-table-column label="疗愈时长" prop="duration" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.duration }} mins
          </template>
        </el-table-column>
        <el-table-column label="预约人数" show-overflow-tooltip>
          <template slot-scope="scope">
            <span v-if="scope.row.orderDetailList">{{ scope.row.orderDetailList.length }}</span>
            <span v-else>1</span>
          </template>
        </el-table-column>
        <el-table-column label="疗愈师" width="120" show-overflow-tooltip>
          <template slot-scope="scope">
            <span v-for="(orderDetail,index) in scope.row.orderDetailList" :key="index">
              {{orderDetail.massagist!=null?orderDetail.massagist.name:'' }}
              <span v-if="index!=(scope.row.orderDetailList.length-1)" style="margin:0 2px">|</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="部位" prop="parts" width="150" show-overflow-tooltip>
          <template slot-scope="scope">
            <el-tag v-if="scope.row.parts && scope.row.parts.length" type="warning" :style="getOrderLabelStyle(scope)">
              <span v-for="(item,index) in scope.row.parts" :key="index">
                <span v-if="index!=0" style="margin:0 2px">|</span>
                {{ item }}
              </span>
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="comment" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.comment }}
            <span v-for="(item,index) in scope.row.orderDetailList" :key="index">
              <span v-if="(scope.row.comment != null || index !=0) && item.comment != null"> </span>{{ item.comment }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top: 20px;">
        <el-pagination
          background
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          layout="total, sizes,prev, pager, next,jumper"
          :page-size="searchForm.size"
          :page-sizes="[5,10,15]"
          hide-on-single-page
          :current-page.sync="searchForm.page"
          :total="total">
        </el-pagination>
      </div>
    </div>
    <order-label-dialog ref="refOrderLabelDialog" @submit-success="fetchData"></order-label-dialog>
  </el-dialog>
</template>

<script>
import orderApi from "../../api/order/order"
import dateUtil from "@/utils/dateUtil";
import OrderLabelDialog from "./OrderLabelDialog"

export default {
  name: 'OrderHistoryDialog',
  components: {OrderLabelDialog},
  props: {},
  data() {
    return {
      dialogVisible: false,
      customerId: '',
      searchForm: {
        page: 1,
        size: 10,
        order: '-id',
        appointmentState: '0,1,2',
        type: 0
      },
      dataList: [],
      total: 0,
      appointmentRange: [],
      title: ''
    }
  },
  methods: {
    open(customerId, title) {
      this.customerId = customerId
      this.title = title
      this.dialogVisible = true
      this.searchData()
    },
    async fetchData() {
      if (!this.customerId) {
        this.dataList = []
        this.total = 0
        return
      }
      let res = await orderApi.page({...this.searchForm, customerId: this.customerId})
      let {list, total} = res.data
      this.dataList = list || []
      this.total = total || 0
      console.log(this.dataList)
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    handleSizeChange(val) {
      this.searchForm.size = val
      this.searchData()
    },
    handleCurrentChange(val) {
      this.searchForm.page = val
      this.fetchData()
    },
    appointmentRangeChange(value) {
      if (value && value.length > 0) {
        this.$set(this.searchForm, 'startAppointmentTime', value[0])
        this.$set(this.searchForm, 'endAppointmentTime', value[1])
      } else {
        this.$set(this.searchForm, 'startAppointmentTime', null)
        this.$set(this.searchForm, 'endAppointmentTime', null)
      }
      this.searchData()
    },
    showAddOrderLabel(order) {
      this.$refs.refOrderLabelDialog.open({orderId: order.id, oil: order.oil, parts: order.parts})
    },
    getOrderLabelStyle(data) {
      const order = data.row
      if (!order.id) {
        return
      }
      let bgColor = ''
      let color = '#fff'
      if (order.oil == '花') {
        bgColor = 'linear-gradient(to right, #9d8bb6, #f2d8de)'
      } else if (order.oil == '柚') {
        bgColor = 'linear-gradient(to right, #eeb046, #faedc7)'
      } else if (order.oil == '竺') {
        bgColor = 'linear-gradient(to right, #b1d02a, #e5efcb)'
      } else if (order.oil == '森') {
        bgColor = 'linear-gradient(to right, #2a4824, #5c411f)'
      } else if (order.oil == '无') {
        bgColor = 'linear-gradient(to right, #a6a6a6, #ffffff)'
      }else if (order.oil == '花*') {
        bgColor = 'linear-gradient(to right, #f2d8de, #9d8bb6)'
      }else if (order.oil == '果*') {
        bgColor = 'linear-gradient(to right, #faedc7, #eeb046)'
      }else if (order.oil == '草*') {
        bgColor = 'linear-gradient(to right, #e5efcb, #b1d02a)'
      }else if (order.oil == '木*') {
        bgColor = 'linear-gradient(to right, #5c411f, #2a4824)'
      }else if (order.oil == '茶*') {
        bgColor = 'linear-gradient(to right, #6C8149, #D3D3D3)'
      } else {
        color = '#303133'
      }
      return {
        background: bgColor,
        color: color
      }
    }
  },
  filters: {
    formatYYYYMMDDHHmm(timeStr) {
      if (timeStr) {
        return dateUtil.format(timeStr, 'YYYY-MM-DD HH:mm');
      }
      return ''
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.OrderHistoryDialog {

  /deep/ .el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell {
    background: none;
  }

}
</style>
