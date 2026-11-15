<template>
  <div class="pay-group">
    <div class="summary-strip">
      <div class="summary-item">
        <span class="label">已收款笔数</span>
        <span class="value">{{ summary.paidCount || 0 }}</span>
      </div>
      <div class="summary-item">
        <span class="label">合并收款合计</span>
        <span class="value">¥{{ money(summary.paidAmount) }}</span>
      </div>
      <div class="summary-item">
        <span class="label">其中预约单</span>
        <span class="value">¥{{ money(summary.orderAmount) }}</span>
      </div>
      <div class="summary-item">
        <span class="label">其中会员卡</span>
        <span class="value">¥{{ money(summary.cardAmount) }}</span>
      </div>
      <div class="summary-item warn">
        <span class="label">待分账</span>
        <span class="value">{{ summary.splitPendingCount || 0 }}</span>
      </div>
      <div class="summary-item danger">
        <span class="label">重复收款待退</span>
        <span class="value">{{ summary.duplicatePaidCount || 0 }}</span>
      </div>
    </div>

    <el-form :inline="true" :model="searchForm" size="small" class="search-bar">
      <el-form-item label="支付单号">
        <el-input v-model="searchForm.payNo" placeholder="合并支付单号" clearable style="width: 200px"
                  @keyup.enter.native="handleSearch"/>
      </el-form-item>
      <el-form-item label="预约单号">
        <el-input v-model="searchForm.orderCode" placeholder="订单编号" clearable style="width: 180px"
                  @keyup.enter.native="handleSearch"/>
      </el-form-item>
      <el-form-item label="支付状态">
        <el-select v-model="searchForm.state" clearable placeholder="全部" style="width: 140px">
          <el-option label="待支付" :value="0"/>
          <el-option label="已支付" :value="1"/>
          <el-option label="已关闭" :value="2"/>
          <el-option label="重复收款" :value="3"/>
        </el-select>
      </el-form-item>
      <el-form-item label="分账状态">
        <el-select v-model="searchForm.splitState" clearable placeholder="全部" style="width: 140px">
          <el-option label="待分账" :value="0"/>
          <el-option label="已分账" :value="1"/>
          <el-option label="分账失败" :value="2"/>
          <el-option label="无需分账" :value="3"/>
        </el-select>
      </el-form-item>
      <el-form-item label="下单时间">
        <el-date-picker v-model="searchForm.timeRange" type="daterange" value-format="yyyy-MM-dd"
                        start-placeholder="开始日期" end-placeholder="结束日期" style="width: 240px"/>
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="searchForm.withCard">只看含会员卡</el-checkbox>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleSearch">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="dataList" v-loading="listLoading" border size="small" style="width: 100%">
      <el-table-column label="支付单号" prop="payNo" min-width="180"/>
      <el-table-column label="预约单号" prop="orderCode" min-width="150"/>
      <el-table-column label="合并收款" width="110" align="right">
        <template slot-scope="scope">¥{{ money(scope.row.totalAmount) }}</template>
      </el-table-column>
      <el-table-column label="预约单" width="100" align="right">
        <template slot-scope="scope">¥{{ money(scope.row.orderAmount) }}</template>
      </el-table-column>
      <el-table-column label="会员卡" width="100" align="right">
        <template slot-scope="scope">
          <span v-if="!scope.row.cardOrderSn">-</span>
          <span v-else>¥{{ money(scope.row.cardAmount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="支付状态" width="100">
        <template slot-scope="scope">
          <el-tag size="mini" :type="stateTagType(scope.row.state)">{{ stateText(scope.row.state) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="分账状态" width="110">
        <template slot-scope="scope">
          <el-tooltip :content="scope.row.splitError || ''" :disabled="!scope.row.splitError" placement="top">
            <el-tag size="mini" :type="splitTagType(scope.row.splitState)">{{ splitText(scope.row.splitState) }}</el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="门店应分" width="100" align="right">
        <template slot-scope="scope">¥{{ money(scope.row.splitAmount) }}</template>
      </el-table-column>
      <el-table-column label="分账流水号" prop="splitPayNo" min-width="140">
        <template slot-scope="scope">{{ scope.row.splitPayNo || '-' }}</template>
      </el-table-column>
      <el-table-column label="支付时间" prop="paidTime" min-width="150">
        <template slot-scope="scope">{{ scope.row.paidTime || '-' }}</template>
      </el-table-column>
      <el-table-column label="创建时间" prop="createTime" min-width="150"/>
      <el-table-column label="操作" width="110" fixed="right">
        <template slot-scope="scope">
          <el-button type="text" size="mini" v-if="canConfirmSplit(scope.row)"
                     @click="handleConfirmSplit(scope.row)">确认分账
          </el-button>
          <span v-else>-</span>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination class="pager" background layout="total, sizes, prev, pager, next"
                   :current-page="pageNum" :page-size="pageSize" :page-sizes="[20, 50, 100]"
                   :total="total"
                   @current-change="handlePageChange" @size-change="handleSizeChange"/>
  </div>
</template>

<script>
import {fetchPayGroupPage, confirmPayGroupSplit} from '@/api/payGroup'

export default {
  name: 'PayGroupLedger',
  data() {
    return {
      listLoading: false,
      dataList: [],
      total: 0,
      pageNum: 1,
      pageSize: 20,
      summary: {},
      searchForm: {
        payNo: '',
        orderCode: '',
        state: '',
        splitState: '',
        timeRange: [],
        withCard: false
      }
    }
  },
  created() {
    this.getList()
  },
  methods: {
    money(value) {
      const number = Number(value || 0)
      return number.toFixed(2)
    },
    stateText(state) {
      return {0: '待支付', 1: '已支付', 2: '已关闭', 3: '重复收款'}[state] || '-'
    },
    stateTagType(state) {
      if (state === 1) return 'success'
      if (state === 3) return 'danger'
      if (state === 0) return 'warning'
      return 'info'
    },
    splitText(splitState) {
      return {0: '待分账', 1: '已分账', 2: '分账失败', 3: '无需分账'}[splitState] || '-'
    },
    splitTagType(splitState) {
      if (splitState === 1) return 'success'
      if (splitState === 2) return 'danger'
      if (splitState === 0) return 'warning'
      return 'info'
    },
    canConfirmSplit(row) {
      return row.state === 1 && (row.splitState === 0 || row.splitState === 2)
    },
    buildParams() {
      const range = this.searchForm.timeRange || []
      return {
        pageNum: this.pageNum,
        pageSize: this.pageSize,
        payNo: this.searchForm.payNo || undefined,
        orderCode: this.searchForm.orderCode || undefined,
        state: this.searchForm.state === '' ? undefined : this.searchForm.state,
        splitState: this.searchForm.splitState === '' ? undefined : this.searchForm.splitState,
        withCard: this.searchForm.withCard ? 'true' : undefined,
        startTime: range[0] || undefined,
        endTime: range[1] || undefined
      }
    },
    getList() {
      this.listLoading = true
      fetchPayGroupPage(this.buildParams()).then(res => {
        this.dataList = res.data.list || []
        this.total = res.data.total || 0
        this.summary = res.data.summary || {}
      }).finally(() => {
        this.listLoading = false
      })
    },
    handleSearch() {
      this.pageNum = 1
      this.getList()
    },
    handleReset() {
      this.searchForm = {payNo: '', orderCode: '', state: '', splitState: '', timeRange: [], withCard: false}
      this.handleSearch()
    },
    handlePageChange(page) {
      this.pageNum = page
      this.getList()
    },
    handleSizeChange(size) {
      this.pageSize = size
      this.pageNum = 1
      this.getList()
    },
    handleConfirmSplit(row) {
      this.$prompt('可填写门店分账流水号（线下走账时可留空）', '确认分账完成 · ' + row.payNo, {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        inputPlaceholder: '分账流水号'
      }).then(({value}) => {
        return confirmPayGroupSplit({id: row.id, splitPayNo: value})
      }).then(() => {
        this.$message.success('已确认分账')
        this.getList()
      }).catch(() => {
        // 取消或失败：request 拦截器已提示错误
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.pay-group {
  padding: 16px;
}

.summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;

  .summary-item {
    flex: 1 1 150px;
    padding: 12px 16px;
    border-radius: 8px;
    background: #f5f7fa;

    .label {
      display: block;
      font-size: 12px;
      color: #909399;
    }

    .value {
      font-size: 20px;
      font-weight: 600;
      color: #303133;
    }

    &.warn .value {
      color: #e6a23c;
    }

    &.danger .value {
      color: #f56c6c;
    }
  }
}

.search-bar {
  margin-bottom: 8px;
}

.pager {
  margin-top: 16px;
  text-align: right;
}
</style>