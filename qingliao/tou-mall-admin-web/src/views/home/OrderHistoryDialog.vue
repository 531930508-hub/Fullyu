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
        <el-table-column label="第几次（天）到店消费" width="140" show-overflow-tooltip>
          <template slot-scope="scope">
            <span v-if="scope.row.visitNo">第 {{ scope.row.visitNo }} 次</span>
            <span v-else class="c-info">—</span>
          </template>
        </el-table-column>
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
        <el-table-column label="审批" width="100" show-overflow-tooltip>
          <template slot-scope="scope">
            <el-button type="text" size="mini" @click="showOrderApprovals(scope.row)">查看审批</el-button>
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
    <!-- 订单可能有多条审批（改单/退款/送券），先列出来再点进完整流程 -->
    <el-dialog title="订单审批" :visible.sync="approvalDialogVisible" width="420px" append-to-body>
      <div v-loading="approvalLoading" style="min-height: 60px">
        <div v-for="item in approvalList" :key="item.id" class="approval-item"
             @click="openApprovalFlow(item.id)">
          <span>{{ item.categoryTitle || ('审批#' + item.id) }}</span>
          <el-tag size="mini" :type="approvalTagType(item.state)">{{ approvalStateText(item.state) }}</el-tag>
        </div>
        <div v-if="!approvalLoading && approvalList.length === 0" class="c-info">该订单暂无关联审批</div>
      </div>
    </el-dialog>
    <approval-progress ref="refApprovalProgress"></approval-progress>
  </el-dialog>
</template>

<script>
import orderApi from "../../api/order/order"
import dateUtil from "@/utils/dateUtil";
import OrderLabelDialog from "./OrderLabelDialog"
import ApprovalProgress from "@/views/order/approval/ApprovalProgress"
import approvalDetailApi from "@/api/approvalDetail"

export default {
  name: 'OrderHistoryDialog',
  components: {OrderLabelDialog, ApprovalProgress},
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
      title: '',
      approvalDialogVisible: false,
      approvalLoading: false,
      approvalList: []
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
    //按订单拉取关联审批；任何失败都只提示空列表，不影响消费记录
    async showOrderApprovals(row) {
      if (!row || !row.id) return
      this.approvalList = []
      this.approvalDialogVisible = true
      this.approvalLoading = true
      try {
        const res = await approvalDetailApi.byOrder(row.id)
        this.approvalList = res.data || []
      } catch (e) {
        this.approvalList = []
      } finally {
        this.approvalLoading = false
      }
    },
    approvalStateText(state) {
      const map = this.constant.approvalStateMap
      const textMap = {
        [map.rejected]: '已拒绝',
        [map.notSubmit]: '未提交',
        [map.approving]: '审批中',
        [map.passed]: '已通过',
        [map.withdraw]: '已撤回',
        [map.skipped]: '已跳过',
      }
      return textMap[state] || ''
    },
    approvalTagType(state) {
      const map = this.constant.approvalStateMap
      if (state === map.passed) return 'success'
      if (state === map.rejected) return 'danger'
      if (state === map.approving) return 'warning'
      return 'info'
    },
    openApprovalFlow(approvalId) {
      this.approvalDialogVisible = false
      if (approvalId) this.$refs.refApprovalProgress.openByApprovalId(approvalId)
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

  .approval-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    margin-bottom: 8px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      border-color: #1e6abc;
    }
  }

  // 手机上筛选行放不下 260 + 220 两个控件，改为各占一行
  @media (max-width: 767px) {
    > .el-date-editor,
    > .el-input {
      width: 100% !important;
      margin-right: 0 !important;
    }
  }

}
</style>
