<template>
  <div class="salary-detail">
    <div class="salary-body">
      <div class="detail-top">
        <div class="top-selector">
          <div v-if="viewer" class="filter-field">
            <span class="filter-label">疗愈师</span>
            <el-select v-model="viewPersonId" size="small" filterable remote clearable
                       placeholder="输入姓名搜索" aria-label="疗愈师"
                       class="person-selector" :disabled="loading"
                       :remote-method="searchPeople" :loading="peopleLoading"
                       @change="handlePersonChange">
              <el-option v-for="item in people" :key="item.id" :label="item.name" :value="item.id"/>
            </el-select>
          </div>
          <div v-if="viewer" class="filter-field">
            <span class="filter-label">合作状态</span>
            <el-select v-model="massagistStatus" size="small" class="status-selector" aria-label="合作状态"
                       :disabled="loading" @change="searchPeople(peopleKeyword)">
              <el-option label="合作中" :value="1"/>
              <el-option label="暂停合作" :value="2"/>
              <el-option label="已结束合作" :value="0"/>
              <el-option label="全部合作状态" :value="-1"/>
            </el-select>
          </div>
          <div class="filter-field">
            <span class="filter-label">结算月份</span>
            <el-select v-model="selectedMonth" size="small" placeholder="选择月份" aria-label="结算月份"
                       class="month-selector-input" :disabled="loading || (viewer && !viewPersonId)"
                       @change="handleMonthChange">
              <el-option v-for="item in monthOptions" :key="item" :label="item" :value="item"/>
            </el-select>
          </div>
          <template v-if="manager">
            <div class="filter-field">
              <span class="filter-label">合作状态</span>
              <el-select v-model="massagistStatus" size="small" class="status-selector" aria-label="合作状态"
                         :disabled="loading" @change="handleFilterChange">
                <el-option label="合作中" :value="1"/>
                <el-option label="暂停合作" :value="2"/>
                <el-option label="已结束合作" :value="0"/>
                <el-option label="全部合作状态" :value="-1"/>
              </el-select>
            </div>
            <div class="filter-field">
              <span class="filter-label">疗愈师姓名</span>
              <el-input v-model="massagistKeyword" size="small" clearable placeholder="输入姓名"
                        aria-label="疗愈师姓名" maxlength="100" class="name-search" :disabled="loading"
                        @clear="handleFilterChange" @keyup.enter.native="handleFilterChange"/>
            </div>
            <el-button size="small" :disabled="loading" @click="handleFilterChange">查询</el-button>
            <el-button size="small" :disabled="loading" @click="resetFilters">重置</el-button>
          </template>
          <span v-else-if="!viewer" class="user-selector">{{ massagistId | massagistNameFilter }}</span>
        </div>

        <div v-if="manager && selectedMonth" class="month-summary" v-loading="summaryLoading">
          <div class="month-summary__head">
            <div>
              <div class="month-summary__title">{{ selectedMonth }} 劳务服务费合计</div>
              <div class="month-summary__sub">按当前合作状态、姓名筛选，汇总全部疗愈师</div>
            </div>
            <el-button type="text" size="small" :loading="summaryLoading" @click="fetchMonthSummary">刷新</el-button>
          </div>
          <div class="month-summary__grid">
            <div class="summary-item">
              <span class="summary-label">结算人数</span>
              <span class="summary-value">{{ (summaryData.peopleCount || 0) }}<em>人</em></span>
            </div>
            <div class="summary-item">
              <span class="summary-label">接单结算（元）</span>
              <span class="summary-value">{{ formatCurrency(summaryData.salary || 0) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">税前收入（元）</span>
              <span class="summary-value">{{ formatCurrency(summaryData.preTaxIncome || 0) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">本月应缴个人所得税（元）</span>
              <span class="summary-value">{{ formatCurrency(summaryData.payableIncomeTax || 0) }}</span>
            </div>
            <div class="summary-item summary-item--strong">
              <span class="summary-label">预估税后收入（元）</span>
              <span class="summary-value">{{ formatCurrency(summaryData.actualIncome || 0) }}</span>
            </div>
          </div>
          <div v-if="summaryError" class="summary-error">
            {{ summaryError }}
            <el-button type="text" size="mini" @click="fetchMonthSummary">重试</el-button>
          </div>
        </div>
      </div>

      <el-alert v-if="rowsError || monthsError" class="load-error" type="error" :closable="false"
                :title="rowsError || monthsError" show-icon>
        <el-button size="mini" @click="retryLoad">重试</el-button>
      </el-alert>

      <!-- 管理端：当月全员劳务服务费，一屏全列，不分页 -->
      <template v-if="manager">
        <div class="rows-head">
          <span class="rows-title">{{ selectedMonth || '未选择月份' }} 全员劳务服务费明细</span>
          <span class="rows-count">共 {{ rows.length }} 人</span>
        </div>
        <el-table v-loading="rowsLoading" :data="rows" border stripe class="rows-table" empty-text="当月暂无结算记录"
                  :summary-method="summaryMethod" show-summary>
          <el-table-column label="门店" prop="shopName" min-width="140" show-overflow-tooltip>
            <template slot-scope="scope">{{ scope.row.shopName || '—' }}</template>
          </el-table-column>
          <el-table-column label="疗愈师" prop="name" min-width="110" show-overflow-tooltip/>
          <el-table-column label="合作状态" prop="status" width="110">
            <template slot-scope="scope">{{ scope.row.status | jobStatusFilter }}</template>
          </el-table-column>
          <el-table-column label="接单时长（分钟）" prop="totalDuration" width="140" align="right">
            <template slot-scope="scope">{{ formatNumber(scope.row.totalDuration) }}</template>
          </el-table-column>
          <el-table-column label="系数" prop="coefficient" width="90" align="right">
            <template slot-scope="scope">{{ formatNumber(scope.row.coefficient) }}</template>
          </el-table-column>
          <el-table-column label="接单结算（元）" prop="salary" min-width="130" align="right">
            <template slot-scope="scope">{{ formatCurrency(scope.row.salary) }}</template>
          </el-table-column>
          <el-table-column label="税前收入（元）" prop="preTaxIncome" min-width="130" align="right">
            <template slot-scope="scope">{{ formatCurrency(scope.row.preTaxIncome) }}</template>
          </el-table-column>
          <el-table-column label="本月个税（元）" prop="payableIncomeTax" min-width="130" align="right">
            <template slot-scope="scope">{{ formatCurrency(scope.row.payableIncomeTax) }}</template>
          </el-table-column>
          <el-table-column label="税后收入（元）" prop="actualIncome" min-width="130" align="right">
            <template slot-scope="scope"><b>{{ formatCurrency(scope.row.actualIncome) }}</b></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template slot-scope="scope">
              <el-button type="text" size="small" @click="openDetail(scope.row)">明细</el-button>
              <el-button type="text" size="small" :loading="resettingId === scope.row.massagistId"
                         @click="resetRow(scope.row)">重新结算</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 疗愈师本人 / 店长等非技师账号自选疗愈师：单人按月明细 -->
      <template v-else>
        <el-empty v-if="viewer && !viewPersonId" description="请先选择要查看的疗愈师"/>
        <el-empty v-else-if="!monthsLoading && !detailLoading && !currentPersonId" description="账号未关联疗愈师档案"/>
        <el-empty v-else-if="!monthsLoading && currentPersonId && !monthOptions.length" description="暂无结算月份"/>
        <el-empty v-else-if="!monthsLoading && currentPersonId && selectedMonth && !monthOptions.includes(selectedMonth)"
                  :description="`${selectedMonth} 暂无结算记录`"/>
        <salary-record-detail v-else :salary-data="salaryData" :loading="detailLoading"
                              :masked="maskSelfRecord" :js-canshu="jsCanshu" :js-marks="jsMarks"/>
      </template>
    </div>

    <el-drawer :visible.sync="detailVisible" size="640px" :destroy-on-close="true">
      <div slot="title" class="drawer-title">
        {{ detailPerson.name || '' }}
        <span class="drawer-sub">{{ detailPerson.shopName || '' }} · {{ selectedMonth }}</span>
      </div>
      <div v-loading="detailLoading" class="drawer-body">
        <salary-record-detail :salary-data="detailData" :loading="false"/>
      </div>
    </el-drawer>
    <salary-other-amount-dialog ref="refSalaryOtherAmountDialog"></salary-other-amount-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import salaryRecordApi from "../../../api/salaryRecord"
import SalaryRecordDetail from "./SalaryRecordDetail"
import SalaryOtherAmountDialog from "./SalaryOtherAmountDialog"

export default {
  name: 'index',
  components: {SalaryRecordDetail, SalaryOtherAmountDialog},
  data() {
    return {
      selectedMonth: '',
      salaryData: {},
      massagistStatus: 1,
      massagistKeyword: '',
      monthCodeList: [],
      rows: [],
      rowsLoading: false,
      rowsError: '',
      monthsLoading: false,
      detailLoading: false,
      resettingId: null,
      resetPending: false,
      monthsError: '',
      summaryData: {},
      summaryLoading: false,
      summaryError: '',
      globalMonthCodes: [],
      detailVisible: false,
      detailPerson: {},
      detailData: {},
      detailSequence: 0,
      monthsSequence: 0,
      peopleSequence: 0,
      rowsSequence: 0,
      summarySequence: 0,
      destroyed: false,
      isBefore11th: false,
      lastMonthCode: '',
      people: [],
      peopleLoading: false,
      peopleKeyword: '',
      viewPersonId: null,
      jsCanshu: '1.068',
      jsMarks: '扣除6.8%服务费，即（本月接单结算+其他调整）÷1.068'
    }
  },
  computed: {
    ...mapGetters(['roles', 'massagistId', 'trainer']),
    manager() {
      return (this.roles || []).some(role => ['超级管理员', '总助', '财务'].includes(role))
    },
    loading() {
      return this.rowsLoading || this.monthsLoading
    },
    // 店长、内训师、未关联档案的管理账号：自选疗愈师查看单人明细；
    // 纯疗愈师继续保持“仅本人”
    viewer() {
      if (this.manager) return false
      const shopManager = (this.roles || []).includes('店长')
      return !!this.trainer || shopManager || !this.massagistId
    },
    currentPersonId() {
      if (this.manager) return null
      return this.viewer ? this.viewPersonId : this.massagistId
    },
    monthOptions() {
      return this.manager ? this.mergeMonthCodes(this.globalMonthCodes) : this.monthCodeList
    },
    maskSelfRecord() {
      // 仅“疗愈师本人”视图做收入脱敏；管理侧查看不脱敏
      return !this.viewer && this.checkHideData()
    }
  },
  created() {
    this.checkIsBefore11th()
    this.getLastMonthCode()
    if (this.manager) {
      this.globalMonthCodes = this.fallbackMonthCodes()
      this.selectedMonth = this.globalMonthCodes[0]
      this.fetchGlobalMonthCodes()
      // 首屏同时拉月度合计，避免合计卡显示全 0 直到手动刷新
      this.fetchMonthSummary()
      return this.fetchRows()
    }
    if (this.massagistId) return this.fetchMonthCodeData()
    if (this.viewer) return this.fetchPeople()
  },
  beforeDestroy() {
    this.destroyed = true
    this.monthsSequence++
    this.detailSequence++
    this.peopleSequence++
    this.rowsSequence++
    this.summarySequence++
  },
  methods: {
    currentMonthCode() {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    },
    fallbackMonthCodes() {
      const result = []
      const cursor = new Date()
      cursor.setDate(1)
      for (let i = 0; i < 24; i++) {
        result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
        cursor.setMonth(cursor.getMonth() - 1)
      }
      return result
    },
    mergeMonthCodes(remote) {
      const codes = new Set([this.currentMonthCode(), ...(remote || [])])
      return Array.from(codes).filter(Boolean).sort().reverse()
    },
    async fetchGlobalMonthCodes() {
      if (this.destroyed || !this.manager) return
      try {
        const {data} = await salaryRecordApi.monthCodes()
        if (this.destroyed) return
        this.globalMonthCodes = this.mergeMonthCodes(data)
      } catch (error) {
        // 月份接口失败时保留本地近24个月，避免筛选器不可用。
      }
    },
    async fetchRows() {
      if (this.destroyed || !this.manager) return
      if (!this.selectedMonth) {
        this.rows = []
        return
      }
      const sequence = ++this.rowsSequence
      const monthCode = this.selectedMonth
      this.rowsError = ''
      this.rowsLoading = true
      try {
        const {data} = await salaryRecordApi.monthRows({
          monthCode,
          status: this.massagistStatus,
          name: (this.massagistKeyword || '').trim() || undefined
        })
        if (this.destroyed || sequence !== this.rowsSequence || monthCode !== this.selectedMonth) return
        this.rows = data || []
      } catch (error) {
        if (!this.destroyed && sequence === this.rowsSequence) {
          // 失败时清空旧月份明细，避免上月金额挂在新月份标题下
          this.rows = []
          this.rowsError = '全员明细加载失败，请重试'
        }
      } finally {
        if (!this.destroyed && sequence === this.rowsSequence) this.rowsLoading = false
      }
    },
    async fetchMonthSummary() {
      if (this.destroyed || !this.manager || !this.selectedMonth) {
        this.summaryData = {}
        return
      }
      const sequence = ++this.summarySequence
      const monthCode = this.selectedMonth
      this.summaryError = ''
      this.summaryLoading = true
      try {
        const {data} = await salaryRecordApi.monthSummary({
          monthCode,
          status: this.massagistStatus,
          name: (this.massagistKeyword || '').trim() || undefined
        })
        if (this.destroyed || sequence !== this.summarySequence || monthCode !== this.selectedMonth) return
        this.summaryData = data || {}
      } catch (error) {
        if (!this.destroyed && sequence === this.summarySequence) {
          this.summaryData = {}
          this.summaryError = '本月合计加载失败，请重试'
        }
      } finally {
        if (!this.destroyed && sequence === this.summarySequence) this.summaryLoading = false
      }
    },
    handleFilterChange() {
      if (!this.manager) return
      this.fetchMonthSummary()
      return this.fetchRows()
    },
    handleMonthChange() {
      if (!this.manager) return this.fetchData()
      this.fetchMonthSummary()
      return this.fetchRows()
    },
    resetFilters() {
      if (!this.manager) return
      this.massagistStatus = 1
      this.massagistKeyword = ''
      this.selectedMonth = this.monthOptions[0] || this.currentMonthCode()
      this.fetchMonthSummary()
      return this.fetchRows()
    },
    async openDetail(row) {
      if (!row || !this.selectedMonth) return
      this.detailPerson = row
      this.detailData = {}
      this.detailVisible = true
      const sequence = ++this.detailSequence
      this.detailLoading = true
      try {
        const {data} = await salaryRecordApi.info({massagistId: row.massagistId, monthCode: this.selectedMonth})
        if (this.destroyed || sequence !== this.detailSequence) return
        this.detailData = data || {}
      } catch (error) {
        if (!this.destroyed && sequence === this.detailSequence) {
          this.detailVisible = false
          this.$message.error('结算明细加载失败，请重试')
        }
      } finally {
        if (!this.destroyed && sequence === this.detailSequence) this.detailLoading = false
      }
    },
    async fetchPeople(keyword) {
      if (this.destroyed || !this.viewer) return
      const sequence = ++this.peopleSequence
      this.peopleLoading = true
      try {
        const {data} = await salaryRecordApi.people({
          status: this.massagistStatus,
          page: 1,
          size: 50,
          name: (keyword || '').trim() || undefined
        })
        if (this.destroyed || sequence !== this.peopleSequence) return
        this.people = (data && data.list) || []
        if (this.viewPersonId && !this.people.some(person => person.id === this.viewPersonId)) {
          // 筛选后当前选中的人不在列表里，清空避免展示无权限范围的数据
          this.handlePersonChange(null)
        }
        // 首次进入默认选中首位疗愈师，避免空白页
        if (!this.viewPersonId && this.people.length) {
          this.handlePersonChange(this.people[0].id)
        }
      } catch (error) {
        if (!this.destroyed && sequence === this.peopleSequence) {
          this.people = []
          this.monthsError = '疗愈师列表加载失败，请重试'
        }
      } finally {
        if (!this.destroyed && sequence === this.peopleSequence) this.peopleLoading = false
      }
    },
    searchPeople(keyword) {
      this.peopleKeyword = keyword || ''
      return this.fetchPeople(this.peopleKeyword)
    },
    handlePersonChange(personId) {
      if (!personId) {
        this.viewPersonId = null
        this.monthCodeList = []
        this.salaryData = {}
        this.selectedMonth = ''
        this.monthsError = ''
        return
      }
      this.viewPersonId = personId
      this.monthCodeList = []
      this.salaryData = {}
      this.selectedMonth = ''
      this.monthsError = ''
      return this.fetchMonthCodeData()
    },
    async fetchData() {
      if (this.destroyed || this.manager) return
      const sequence = ++this.detailSequence
      const params = {massagistId: this.currentPersonId, monthCode: this.selectedMonth}
      this.salaryData = {}
      this.monthsError = ''
      if (!params.massagistId || !params.monthCode) {
        this.detailLoading = false
        return
      }
      this.detailLoading = true
      try {
        const {data} = await salaryRecordApi.info(params)
        if (!this.destroyed && sequence === this.detailSequence && params.monthCode === this.selectedMonth) {
          this.salaryData = data || {}
        }
      } catch (error) {
        if (!this.destroyed && sequence === this.detailSequence) this.monthsError = '结算详情加载失败，请重试'
      } finally {
        if (!this.destroyed && sequence === this.detailSequence) this.detailLoading = false
      }
    },
    async fetchMonthCodeData() {
      if (this.destroyed || this.manager || !this.currentPersonId) return
      const sequence = ++this.monthsSequence
      const personId = this.currentPersonId
      this.monthCodeList = []
      this.salaryData = {}
      this.monthsError = ''
      this.monthsLoading = true
      try {
        const {data} = await salaryRecordApi.findMassagistAllMonthCode(personId)
        if (this.destroyed || sequence !== this.monthsSequence || personId !== this.currentPersonId) return
        this.monthCodeList = data || []
        if (this.monthCodeList.length) {
          if (!this.selectedMonth || !this.monthCodeList.includes(this.selectedMonth)) {
            this.selectedMonth = this.monthCodeList[0]
          }
          await this.fetchData()
        }
      } catch (error) {
        if (!this.destroyed && sequence === this.monthsSequence) this.monthsError = '结算月份加载失败，请重试'
      } finally {
        if (!this.destroyed && sequence === this.monthsSequence) this.monthsLoading = false
      }
    },
    retryLoad() {
      if (this.rowsError) return this.fetchRows()
      if (this.viewer && !this.viewPersonId) return this.fetchPeople(this.peopleKeyword)
      return this.fetchMonthCodeData()
    },
    async resetRow(row) {
      if (this.destroyed || !this.manager || this.resettingId || this.resetPending || !row || !this.selectedMonth) return
      const params = {massagistId: row.massagistId, monthCode: this.selectedMonth}
      let loadingShown = false
      // 确认框期间也占锁，避免连点触发两次重算
      this.resetPending = true
      try {
        await this.notifyConfirm(`将重新结算【${row.name}】${this.selectedMonth} 及之后的记录，确定要提交吗？`)
        if (this.destroyed) return
        this.resettingId = row.massagistId
        this.showFullLoading()
        loadingShown = true
        await salaryRecordApi.reset(params)
        if (!this.destroyed) {
          await this.fetchRows()
          this.fetchMonthSummary()
        }
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.resettingId = null
        this.resetPending = false
      }
    },
    summaryMethod({columns, data}) {
      const sums = []
      const numericProps = ['totalDuration', 'coefficient', 'salary', 'preTaxIncome', 'payableIncomeTax', 'actualIncome']
      columns.forEach((column, index) => {
        if (index === 0) {
          sums[index] = '合计'
          return
        }
        if (!numericProps.includes(column.property)) {
          sums[index] = ''
          return
        }
        const total = data.reduce((acc, row) => acc + (Number(row[column.property]) || 0), 0)
        sums[index] = this.formatNumber(total)
      })
      return sums
    },
    formatNumber(value) {
      const num = Number(value) || 0
      return num.toLocaleString('zh-CN')
    },
    formatCurrency(value) {
      const num = Number(value) || 0
      return num.toLocaleString('zh-CN')
    },
    showSalaryOtherAmountDialog() {
      this.$refs.refSalaryOtherAmountDialog.open()
    },
    checkIsBefore11th() {
      const today = new Date()
      this.isBefore11th = today.getDate() < 11
    },
    getLastMonthCode() {
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth()
      let lastMonth, lastYear
      if (currentMonth === 0) {
        lastMonth = 12
        lastYear = currentYear - 1
      } else {
        lastMonth = currentMonth
        lastYear = currentYear
      }
      this.lastMonthCode = `${lastYear}-${String(lastMonth).padStart(2, '0')}`
    },
    checkHideData() {
      return this.isBefore11th && this.lastMonthCode == this.selectedMonth && !this.manager
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.salary-detail {
  padding: 20px;
  background-color: #f9f7fd;
  height: 100%;
  overflow-y: auto;

  .salary-body {
    background-color: #fff;
    padding: 14px;
    border-radius: 10px;

    .detail-top {
      background-color: #f7f5f7;
      padding: 16px 20px;
      border-radius: 10px;

      .top-selector {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 16px;

        .filter-field {
          display: flex;
          align-items: center;
          gap: 8px;

          .filter-label {
            font-size: 13px;
            color: #606266;
            white-space: nowrap;
          }
        }

        .person-selector { width: 180px; }
        .month-selector-input { width: 150px; }
        .status-selector { width: 150px; }
        .name-search { width: 170px; }

        .user-selector {
          display: flex;
          align-items: center;
          background-color: #e8def8;
          color: #303133;
          font-weight: bold;
          padding: 10px 18px;
          border-radius: 20px;
        }
      }

      .month-summary {
        background-color: #fff;
        border-radius: 10px;
        padding: 14px 18px;
        border: 1px solid #ece8f2;

        &__head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        &__title {
          font-size: 15px;
          font-weight: 600;
          color: #303133;
        }

        &__sub {
          font-size: 12px;
          color: #909399;
          margin-top: 2px;
        }

        &__grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }

        .summary-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 12px;
          border-radius: 8px;
          background-color: #f8f6fb;
        }

        .summary-label {
          font-size: 12px;
          color: #909399;
        }

        .summary-value {
          font-size: 18px;
          font-weight: 600;
          color: #303133;

          em {
            font-size: 12px;
            font-style: normal;
            margin-left: 2px;
            color: #909399;
          }
        }

        .summary-item--strong {
          background-color: #f2eefb;

          .summary-value { color: #6b4d9a; }
        }

        .summary-error {
          margin-top: 8px;
          font-size: 12px;
          color: #f56c6c;
        }
      }
    }

    .load-error { margin: 12px 0; }

    .rows-head {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 16px 4px 10px;

      .rows-title { font-size: 15px; font-weight: 600; color: #303133; }
      .rows-count { font-size: 13px; color: #909399; }
    }

    .rows-table {
      /deep/ .el-table__footer-wrapper td { background: #f7f5f7; font-weight: 600; }
    }
  }
}

.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;

  .drawer-sub {
    margin-left: 10px;
    font-size: 13px;
    font-weight: 400;
    color: #909399;
  }
}

.drawer-body { padding: 0 20px 20px; }
</style>