<template>
  <div class="change-log-page">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <shop-selector v-model="query.shopId" style="width: 180px" class="m-r-10"
                       placeholder="请选择门店" :clearable="false" @change="handleShopChange"></shop-selector>
        <massagist-selector v-model="query.massagistId" style="width: 180px" class="m-r-10"
                            :shop-id="query.shopId" :filter-status="1" clearable
                            placeholder="请选择疗愈师"></massagist-selector>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          align="right"
          style="width: 240px"
          class="m-r-10"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="yyyy-MM-dd"
          @change="searchData">
        </el-date-picker>
        <el-button type="primary" icon="el-icon-search" size="medium" @click="searchData">查询</el-button>
        <el-button icon="el-icon-refresh-left" size="medium" @click="resetQuery">重置</el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table :data="dataList" v-loading="loading" style="width: 100%" border>
        <el-table-column type="expand">
          <template slot-scope="scope">
            <div class="snapshot-grid">
              <div><h4>修改前</h4><pre>{{ formatSnapshot(scope.row.before) }}</pre></div>
              <div><h4>修改后</h4><pre>{{ formatSnapshot(scope.row.after) }}</pre></div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作" min-width="200">
          <template slot-scope="scope">
            <span>{{ scope.row.action }}</span>
            <el-button v-if="approvalIdOf(scope.row)" type="text" size="mini"
                       @click="openApprovalFlow(scope.row)">查看审批流程</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="shopName" label="门店" min-width="140"></el-table-column>
        <el-table-column prop="massagistName" label="疗愈师" min-width="120">
          <template slot-scope="scope">{{ scope.row.massagistName || ('编号 ' + scope.row.massagistId) }}</template>
        </el-table-column>
        <el-table-column prop="operatorName" label="操作人" min-width="120"></el-table-column>
        <el-table-column prop="createTime" label="操作时间" min-width="180"></el-table-column>
      </el-table>
      <el-pagination
        background
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
        layout="total, sizes, prev, pager, next, jumper"
        :page-size="query.size"
        :page-sizes="[10,20,50]"
        hide-on-single-page
        :current-page.sync="query.page"
        :total="total">
      </el-pagination>
    </div>
    <approval-progress ref="refApprovalProgress"></approval-progress>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import massagistSchedulesApi from '@/api/massagistSchedules'
import ApprovalProgress from '@/views/order/approval/ApprovalProgress'

export default {
  name: 'boardChangeLogs',
  components: {ApprovalProgress},
  data() {
    return {
      query: {shopId: null, massagistId: null, page: 1, size: 10},
      dateRange: [],
      dataList: [],
      total: 0,
      loading: false,
      requestId: 0,
    }
  },
  computed: {
    ...mapGetters(['shopId'])
  },
  created() {
    this.$store.dispatch('setShopList')
    this.$store.dispatch('setShopAllList')
    this.query.shopId = this.shopId
    this.fetchData()
  },
  methods: {
    handleShopChange() {
      this.query.massagistId = null
      this.searchData()
    },
    searchData() {
      this.query.page = 1
      this.fetchData()
    },
    resetQuery() {
      this.query.massagistId = null
      this.dateRange = []
      this.searchData()
    },
    async fetchData() {
      if (!this.query.shopId) {
        this.dataList = []
        this.total = 0
        return
      }
      const requestId = ++this.requestId
      this.loading = true
      try {
        const params = {
          shopId: this.query.shopId,
          massagistId: this.query.massagistId || undefined,
          startDate: (this.dateRange && this.dateRange[0]) || undefined,
          endDate: (this.dateRange && this.dateRange[1]) || undefined,
          page: this.query.page,
          size: this.query.size,
        }
        const res = await massagistSchedulesApi.changeLogs(params)
        if (requestId !== this.requestId) return
        this.dataList = (res.data && res.data.list) || []
        this.total = (res.data && res.data.total) || 0
      } finally {
        if (requestId === this.requestId) this.loading = false
      }
    },
    handleSizeChange(size) {
      this.query.size = size
      this.query.page = 1
      this.fetchData()
    },
    handleCurrentChange(page) {
      this.query.page = page
      this.fetchData()
    },
    formatSnapshot(value) {
      return value == null ? '无排班记录' : JSON.stringify(value, null, 2)
    },
    //休息审批产生的排班变更带上审批 id（形如“休息审批#123”），可回溯完整审批流程
    approvalIdOf(row) {
      const action = row && row.action
      if (!action || action.indexOf('休息审批#') !== 0) return null
      const match = action.match(/#(\d+)/)
      return match ? Number(match[1]) : null
    },
    openApprovalFlow(row) {
      const approvalId = this.approvalIdOf(row)
      if (approvalId) this.$refs.refApprovalProgress.openByApprovalId(approvalId)
    },
  }
}
</script>

<style lang="scss" scoped>
.change-log-page {
  .operate-container {
    margin-bottom: 15px;
    align-items: center;
  }

  .snapshot-grid {
    display: flex;
    gap: 16px;
    padding: 8px 12px;

    > div {
      flex: 1;
      min-width: 0;
    }

    h4 {
      margin: 0 0 6px;
      font-size: 13px;
      color: #606266;
    }

    pre {
      margin: 0;
      max-height: 240px;
      overflow: auto;
      padding: 8px;
      background: #f7f8fa;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
    }
  }
}
</style>