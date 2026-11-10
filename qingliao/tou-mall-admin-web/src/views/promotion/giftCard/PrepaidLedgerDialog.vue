<template>
  <el-dialog title="礼品卡预收台账" :visible.sync="visible" width="1100px" append-to-body>
    <div class="ledger-tip">
      发放（含导入即发放）按面值记正向预收；已发放未领取的卡作废时记负向冲减；同一张卡同一事件只记一次。客户领取不再入账。
    </div>
    <div class="flex flex-wrap ledger-filter">
      <el-date-picker v-model="range" type="daterange" value-format="yyyy-MM-dd" range-separator="-"
                      start-placeholder="入账日期起" end-placeholder="入账日期止" style="width: 260px"
                      @change="handleRange"></el-date-picker>
      <el-select v-model="query.eventType" placeholder="入账类型" clearable style="width: 130px" @change="search">
        <el-option label="发放（正向）" value="DISTRIBUTE"></el-option>
        <el-option label="作废（冲减）" value="VOID"></el-option>
      </el-select>
      <el-input v-model.trim="query.code" placeholder="礼品卡编码" clearable style="width: 160px"
                @clear="search" @keyup.enter.native="search">
        <el-button slot="append" icon="el-icon-search" @click="search"></el-button>
      </el-input>
    </div>
    <div class="ledger-summary">
      <div class="ledger-summary__item">
        <span class="ledger-summary__label">发放预收</span>
        <span class="ledger-summary__value">¥{{ formatAmount(summary.distributeAmount) }}</span>
      </div>
      <div class="ledger-summary__item">
        <span class="ledger-summary__label">作废冲减</span>
        <span class="ledger-summary__value is-negative">¥{{ formatAmount(summary.voidAmount) }}</span>
      </div>
      <div class="ledger-summary__item">
        <span class="ledger-summary__label">预收净额</span>
        <span class="ledger-summary__value is-strong">¥{{ formatAmount(summary.netAmount) }}</span>
      </div>
      <div class="ledger-summary__item">
        <span class="ledger-summary__label">记录数</span>
        <span class="ledger-summary__value">{{ total }}</span>
      </div>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="ledger-error"></el-alert>
    <el-table v-loading="loading" :data="list" border size="small" max-height="420">
      <el-table-column label="入账时间" prop="createTime" width="160"></el-table-column>
      <el-table-column label="类型" prop="eventType" width="110">
        <template slot-scope="scope">{{ scope.row.eventType === 'VOID' ? '作废冲减' : '发放预收' }}</template>
      </el-table-column>
      <el-table-column label="礼品卡编码" prop="code" min-width="120" show-overflow-tooltip></el-table-column>
      <el-table-column label="用途/活动" prop="activityName" min-width="140" show-overflow-tooltip></el-table-column>
      <el-table-column label="金额" prop="amount" width="120" align="right">
        <template slot-scope="scope">
          <span :class="{'is-negative': Number(scope.row.amount) < 0}">¥{{ formatAmount(scope.row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作人" prop="operatorName" width="120" show-overflow-tooltip>
        <template slot-scope="scope">{{ scope.row.operatorName || '—' }}</template>
      </el-table-column>
    </el-table>
    <div class="pagination-container">
      <el-pagination background layout="total, sizes, prev, pager, next" :total="total"
                     :page-size="query.pageSize" :page-sizes="[20, 50, 100]" :current-page="query.pageNum"
                     @size-change="handleSizeChange" @current-change="handlePage"></el-pagination>
    </div>
  </el-dialog>
</template>

<script>
import giftCardApi from '@/api/promotion/giftCard'

export default {
  name: 'PrepaidLedgerDialog',
  data() {
    return {
      visible: false,
      loading: false,
      error: '',
      range: [],
      query: {pageNum: 1, pageSize: 20, eventType: '', code: '', startTime: '', endTime: ''},
      list: [],
      total: 0,
      summary: {},
      requestSeq: 0
    }
  },
  methods: {
    open() {
      this.range = []
      this.query = {pageNum: 1, pageSize: 20, eventType: '', code: '', startTime: '', endTime: ''}
      this.list = []
      this.total = 0
      this.summary = {}
      this.visible = true
      return this.fetch()
    },
    search() {
      this.query.pageNum = 1
      return this.fetch()
    },
    handleRange(value) {
      this.query.startTime = value && value.length ? value[0] + ' 00:00:00' : ''
      this.query.endTime = value && value.length ? value[1] + ' 23:59:59' : ''
      return this.search()
    },
    handlePage(page) {
      this.query.pageNum = page
      return this.fetch()
    },
    handleSizeChange(size) {
      this.query.pageSize = size
      return this.search()
    },
    async fetch() {
      const seq = ++this.requestSeq
      this.loading = true
      this.error = ''
      try {
        const res = await giftCardApi.prepaidPage({...this.query})
        if (seq !== this.requestSeq) return
        const data = (res && res.data) || {}
        this.list = data.list || []
        this.total = Number(data.total) || 0
        this.summary = data.summary || {}
      } catch (e) {
        if (seq !== this.requestSeq) return
        this.error = '预收台账加载失败，请稍后重试'
      } finally {
        if (seq === this.requestSeq) this.loading = false
      }
    },
    formatAmount(value) {
      const n = Number(value)
      return (Number.isFinite(n) ? n : 0).toFixed(2)
    }
  }
}
</script>

<style lang="less" scoped>
.ledger-tip {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 4px;
  background: #f4f7fb;
  color: #606266;
  font-size: 13px;
  line-height: 1.6;
}

.ledger-filter {
  gap: 10px;
  margin-bottom: 12px;
}

.ledger-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.ledger-summary__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.ledger-summary__label {
  color: #909399;
  font-size: 12px;
}

.ledger-summary__value {
  color: #303133;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.ledger-summary__value.is-strong {
  font-weight: 600;
}

.is-negative {
  color: #f56c6c;
}

.ledger-error {
  margin-bottom: 12px;
}
</style>
