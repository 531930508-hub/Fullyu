<template>
  <div class="export-record">
    <div class="flex justify-between operate-container">
      <div class="flex filters">
        <el-select v-model="searchForm.module" placeholder="导出模块" clearable size="small" class="m-r-10 module-selector"
                   @change="searchData">
          <el-option v-for="item in moduleOptions" :key="item.module"
                     :label="item.moduleName || item.module" :value="item.module"/>
        </el-select>
        <el-input v-model="searchForm.operator" placeholder="操作人姓名 / 账号" clearable size="small"
                  class="m-r-10 operator-input" @keyup.enter.native="searchData" @clear="searchData"/>
        <el-date-picker v-model="dateRange" type="daterange" size="small" unlink-panels
                        value-format="yyyy-MM-dd" range-separator="至"
                        start-placeholder="导出起始日" end-placeholder="导出截止日"
                        class="date-range" @change="searchData"/>
      </div>
      <div class="flex actions">
        <el-button icon="el-icon-search" type="primary" size="small" @click="searchData">查询</el-button>
        <el-button icon="el-icon-refresh" size="small" @click="resetSearch">重置</el-button>
      </div>
    </div>

    <div class="page-tip">
      记录每次导出的操作人、时间、筛选条件与下载文件名，只增不改；仅超级管理员可查看。
    </div>

    <div class="table-container">
      <el-table v-loading="listLoading" :data="dataList" style="width: 100%;" border
                empty-text="暂无导出记录">
        <el-table-column label="导出时间" prop="exportTime" width="170" header-align="center" align="center"/>
        <el-table-column label="模块" prop="moduleName" min-width="150" header-align="center" align="left"
                         show-overflow-tooltip>
          <template slot-scope="scope">
            <span>{{ scope.row.moduleName || scope.row.module }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作人" min-width="150" header-align="center" align="left" show-overflow-tooltip>
          <template slot-scope="scope">
            <div class="operator-cell">
              <span>{{ scope.row.operatorName || '未识别' }}</span>
              <span v-if="scope.row.operatorAccount" class="operator-account">{{ scope.row.operatorAccount }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="文件名" prop="fileName" min-width="260" header-align="center" align="left"
                         show-overflow-tooltip/>
        <el-table-column label="筛选条件" min-width="260" header-align="center" align="left">
          <template slot-scope="scope">
            <span v-if="!filterItems(scope.row).length" class="filter-empty">全部数据（无筛选）</span>
            <span v-else class="filter-summary" :title="filterSummary(scope.row)">{{ filterSummary(scope.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" header-align="center" align="center">
          <template slot-scope="scope">
            <el-button type="text" icon="el-icon-view" @click="openDetail(scope.row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="pagination-container">
      <el-pagination
        background
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
        layout="total, sizes, prev, pager, next, jumper"
        :page-size="searchForm.size"
        :page-sizes="[10, 20, 50]"
        hide-on-single-page
        :current-page.sync="searchForm.page"
        :total="total">
      </el-pagination>
    </div>

    <el-drawer :visible.sync="detailVisible" size="560px" :destroy-on-close="true">
      <div slot="title" class="drawer-title">导出记录详情</div>
      <div v-loading="detailLoading" class="drawer-body">
        <el-descriptions v-if="detail.id" :column="1" border size="small">
          <el-descriptions-item label="导出时间">{{ detail.exportTime || '—' }}</el-descriptions-item>
          <el-descriptions-item label="模块">
            {{ detail.moduleName || '—' }}
            <span v-if="detail.module" class="module-code">{{ detail.module }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="操作人">{{ detail.operatorName || '未识别' }}</el-descriptions-item>
          <el-descriptions-item label="登录账号">{{ detail.operatorAccount || '—' }}</el-descriptions-item>
          <el-descriptions-item label="文件名">
            <span class="file-name">{{ detail.fileName || '—' }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <div class="filter-block">
          <div class="filter-block__title">筛选条件</div>
          <div v-if="!detailFilterItems.length" class="filter-block__empty">导出时未传筛选条件，即导出全部数据</div>
          <div v-else class="filter-block__rows">
            <div v-for="item in detailFilterItems" :key="item.key" class="filter-row">
              <span class="filter-key">{{ item.key }}</span>
              <span class="filter-value">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import exportRecordApi from '@/api/exportRecord'

export default {
  name: 'exportRecord',
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        module: '',
        operator: '',
        startTime: '',
        endTime: ''
      },
      dateRange: [],
      moduleOptions: [],
      dataList: [],
      listLoading: false,
      total: 0,
      detailVisible: false,
      detailLoading: false,
      detail: {}
    }
  },
  computed: {
    detailFilterItems() {
      return this.filterItems(this.detail)
    }
  },
  created() {
    this.fetchModules()
    this.fetchData()
  },
  methods: {
    async fetchModules() {
      try {
        let res = await exportRecordApi.modules()
        this.moduleOptions = res.data || []
      } catch (e) {
        this.moduleOptions = []
      }
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.searchForm.startTime = this.dateRange && this.dateRange[0] ? this.dateRange[0] : ''
      this.searchForm.endTime = this.dateRange && this.dateRange[1] ? this.dateRange[1] : ''
      this.listLoading = true
      try {
        let res = await exportRecordApi.page(this.searchForm)
        let {list, total} = res.data || {}
        this.dataList = list || []
        this.total = total || 0
      } catch (e) {
        this.dataList = []
        this.total = 0
      } finally {
        this.listLoading = false
      }
    },
    resetSearch() {
      this.searchForm.module = ''
      this.searchForm.operator = ''
      this.dateRange = []
      this.searchData()
    },
    handleSizeChange(val) {
      this.searchForm.size = val
      this.searchData()
    },
    handleCurrentChange(val) {
      this.searchForm.page = val
      this.fetchData()
    },
    async openDetail(row) {
      this.detail = row
      this.detailVisible = true
      this.detailLoading = true
      try {
        let res = await exportRecordApi.detail(row.id)
        this.detail = res.data || row
      } catch (e) {
        // 详情失败时保留列表里的快照数据，避免抽屉空白
        this.detail = row
      } finally {
        this.detailLoading = false
      }
    },
    // 台账存的是导出接口的原始参数（JSON），这里原样展开，不做二次解释
    filterItems(record) {
      const raw = record && record.filterCondition
      if (!raw) return []
      try {
        const parsed = JSON.parse(raw)
        if (parsed && parsed._truncated) {
          return [{key: '_truncated', value: '筛选条件过长，已截断未保存'}]
        }
        return Object.keys(parsed).map(key => ({
          key,
          value: parsed[key] === null || parsed[key] === '' ? '（空）' : String(parsed[key])
        }))
      } catch (e) {
        return [{key: '原始内容', value: raw}]
      }
    },
    filterSummary(record) {
      return this.filterItems(record)
        .map(item => `${item.key}=${item.value}`)
        .join('，')
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.export-record {
  padding: 20px;
}

.filters {
  flex: 1;
  flex-wrap: wrap;
  gap: 8px 0;
}

.module-selector {
  width: 180px;
}

.operator-input {
  width: 200px;
}

.date-range {
  width: 280px;
}

.actions {
  flex-shrink: 0;
  margin-left: 12px;
}

.page-tip {
  margin-top: 12px;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}

.operator-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}

.operator-account {
  font-size: 12px;
  color: #909399;
}

.filter-summary {
  display: inline-block;
  color: #606266;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.filter-empty {
  color: #c0c4cc;
  font-size: 12px;
}

.drawer-title {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}

.drawer-body {
  padding: 0 20px 24px;
}

.module-code {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}

.file-name {
  word-break: break-all;
}

.filter-block {
  margin-top: 20px;
}

.filter-block__title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.filter-block__empty {
  padding: 12px;
  font-size: 12px;
  color: #909399;
  background: #f5f7fa;
  border-radius: 4px;
}

.filter-block__rows {
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.filter-row {
  display: flex;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.6;
  border-bottom: 1px solid #ebeef5;
}

.filter-row:last-child {
  border-bottom: none;
}

.filter-key {
  flex: 0 0 140px;
  color: #606266;
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}

.filter-value {
  flex: 1;
  color: #303133;
  word-break: break-all;
}
</style>