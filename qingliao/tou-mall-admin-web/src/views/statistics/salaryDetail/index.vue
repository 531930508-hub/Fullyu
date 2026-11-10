<template>
  <div class="salary-detail">
    <div class="salary-body" v-loading="peopleLoading || monthsLoading || detailLoading">
      <div class="detail-top">
        <div class="top-selector">
          <template v-if="manager">
            <el-select v-model="massagistStatus" size="small" class="status-selector" aria-label="合作状态"
                       :disabled="resetting" @change="handleStatusChange">
              <el-option label="合作中" :value="1"/>
              <el-option label="暂停合作" :value="2"/>
              <el-option label="已结束合作" :value="0"/>
              <el-option label="全部合作状态" :value="-1"/>
            </el-select>
            <el-input v-model="massagistKeyword" size="small" clearable placeholder="搜索疗愈师姓名"
                      aria-label="疗愈师姓名" maxlength="100" class="name-search" :disabled="resetting"
                      @clear="handleStatusChange" @keyup.enter.native="handleStatusChange"/>
            <el-button size="small" :disabled="resetting" @click="handleStatusChange">查询</el-button>
            <el-select v-model="currentMassagistId" size="small" placeholder="选择当前页疗愈师" aria-label="疗愈师"
                       class="person-selector" :disabled="resetting || peopleLoading" @change="handleUserSelect">
              <el-option v-for="item in people" :key="item.id" :label="item.name" :value="item.id"/>
            </el-select>
          </template>
          <span v-else class="user-selector">{{ currentMassagistId | massagistNameFilter }}</span>
          <div class="month-selector">
            <label>结算月份：</label>
            <el-select v-model="selectedMonth" size="small" placeholder="选择月份" aria-label="结算月份"
                       :disabled="resetting || monthsLoading || !currentMassagistId" @change="fetchData">
              <el-option v-for="item in monthCodeList" :key="item" :label="item" :value="item"/>
            </el-select>
            <el-button v-if="manager && selectedMonth" size="small" type="primary" :loading="resetting"
                       :disabled="monthsLoading || detailLoading || !!detailError" @click="resetRecord">重新结算</el-button>
          </div>
        </div>
        <el-pagination v-if="manager" class="people-pagination" background :disabled="resetting || peopleLoading"
                       :total="peopleTotal" :current-page="peoplePage" :page-size="peopleSize" :page-sizes="[20,50,100]"
                       layout="total, sizes, prev, pager, next" @current-change="handlePeoplePageChange"
                       @size-change="handlePeopleSizeChange"/>
        <el-alert v-if="peopleError || monthsError || detailError" class="load-error" type="error" :closable="false"
                  :title="peopleError || monthsError || detailError" show-icon>
          <el-button size="mini" :disabled="resetting" @click="retryLoad">重试</el-button>
        </el-alert>
        <el-empty v-else-if="!peopleLoading && !monthsLoading && !detailLoading && !currentMassagistId"
                  :description="manager ? '暂无符合筛选条件的疗愈师' : '账号未关联疗愈师档案'"/>
        <el-empty v-else-if="!monthsLoading && currentMassagistId && !selectedMonth" description="暂无结算月份"/>
        <div v-if="hasSalaryData" class="salary-cards">
          <div class="card card-purple">
            <div class="card-content">
              <div class="card-value">{{ formatCurrency(salaryData.actualIncome || 0) }}</div>
              <div class="card-label">预估税后收入</div>
            </div>
          </div>
          <div class="card-operator">＝</div>
          <div class="card card-blue">
            <div class="card-left-bar"></div>
            <div class="card-content">
              <div class="card-value">{{ formatCurrency(salaryData.preTaxIncome || 0) }}</div>
              <div class="card-label">税前收入</div>
            </div>
          </div>
<!--          <div class="card-operator">－</div>
          <div class="card card-orange">
            <div class="card-left-bar"></div>
            <div class="card-content">
              <div class="card-value">{{ formatCurrency(salaryData.preDeduction || 0) }}</div>
              <div class="card-label">本月预扣除</div>
            </div>
          </div>
          <div class="card-operator">＋</div>-->
<!--          <div class="card card-green">
            <div class="card-left-bar"></div>
            <div class="card-content">
              <div class="card-value">{{ formatCurrency(salaryData.preDeductionReturned || 0) }}</div>
              <div class="card-label">上月退回</div>
            </div>
          </div>-->
          <div class="card-operator">－</div>
          <div class="card card-pink">
            <div class="card-left-bar"></div>
            <div class="card-content">
              <div class="card-value">{{ formatCurrency(salaryData.payableIncomeTax || 0) }}</div>
              <div class="card-label">本月应缴个人所得税</div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="hasSalaryData" class="detail-body">
        <div class="monthly-salary">
          <span class="monthly-label">本月接单结算</span>
          <span class="monthly-detail">
            <span>{{ formatCurrency(salaryData.totalDuration || 0) }}分钟</span>
            <span>×</span>
            <span>{{ formatCurrency(salaryData.coefficient || 0) }}</span>
            <span>=</span>
            <span>{{ formatCurrency(salaryData.salary || 0) }}元</span>
          </span>
        </div>
        <div v-if="salaryData.receptionCapApplied" class="reception-cap-note">
          本月接待 {{ salaryData.receptionDuration || 0 }} 分钟，按接单排班封顶计入
          {{ salaryData.receptionCountedDuration || 0 }} 分钟
          <span v-if="salaryData.receptionExcessDuration > 0">
            （超出 {{ salaryData.receptionExcessDuration }} 分钟不计工时）
          </span>
        </div>

        <div class="pre-tax-detail">
          <div class="detail-item">
            <span>税前收入（元）：</span>
            <span v-if="salaryData.otherAmount" class="monthly-detail">
              <span>(</span>
              <span>{{ formatCurrency(salaryData.salary || 0) }}</span>
              <span>{{ salaryData.otherAmount > 0 ? '＋' : '－' }}</span>
              <span>{{
                  formatCurrency(salaryData.otherAmount > 0 ? salaryData.otherAmount : (salaryData.otherAmount * -1) || 0)
                }}</span>
              <span>)</span>
            </span>
            <span v-else class="monthly-detail">
              <span>{{ formatCurrency(salaryData.salary || 0) }}</span>
            </span>
            <span>
              <span>÷</span>
              <span>{{ jsCanshu }}</span>
              <span>=</span>
              {{ formatCurrency(salaryData.preTaxIncome || 0) }}
            </span>
            <el-tooltip v-if="salaryData.salary + salaryData.otherAmount >=0"  :content="jsMarks"
                        placement="bottom-start" effect="light">
              <i class="el-icon-warning-outline hover-click"></i>
            </el-tooltip>
            <el-tooltip v-else content="税前收入小于0元，请检查数据是否异常" placement="bottom-start" effect="light">
              <i class="el-icon-warning-outline hover-click"></i>
            </el-tooltip>
          </div>
<!--          <div class="detail-item">
            <span class="detail-operator">－</span>
            <span>本月预扣除（元）：</span>
            <span>{{ formatCurrency(salaryData.preDeduction || 0) }}</span>
            <el-tooltip placement="bottom-start"effect="light">
              <div slot="content" style="white-space: pre-line; font-size: 12px; line-height: 1.6; color: #333; padding: 8px 0;">
                <span style="color: #409EFF; font-weight: 600;">预扣除税费计算规则</span>
                <el-descriptions :column="1" border>
                  <el-descriptions-item label-class-name="descriptions-label">
                    <template slot="label">
                      <el-tooltip content="不含增值税收入=ROUND(税前收入÷1.01,2)" placement="bottom-start" effect="light">
                        <i class="el-icon-warning-outline hover-click m-r-4"></i>
                      </el-tooltip>增值税
                    </template>
                    <span>ROUND(不含增值税收入 × 0.03, 2) － FLOOR(不含增值税收入 × 0.02, 0.01)</span>
                  </el-descriptions-item>
                  <el-descriptions-item label-class-name="descriptions-label">
                    <template slot="label">城建税</template>
                    <span>ROUND(增值税 × 0.07, 2) － FLOOR(ROUND值 × 0.5, 0.01)</span>
                  </el-descriptions-item>
                  <el-descriptions-item label-class-name="descriptions-label">
                    <template slot="label">教育附加税</template>
                    <span>ROUND(增值税 × 0.03, 2) － FLOOR(ROUND值 × 0.5, 0.01)</span>
                  </el-descriptions-item>
                  <el-descriptions-item label-class-name="descriptions-label">
                    <template slot="label">地方教育附加税</template>
                    <span>ROUND(增值税 × 0.02, 2) － FLOOR(ROUND值 × 0.5, 0.01)</span>
                  </el-descriptions-item>
                  <el-descriptions-item label-class-name="descriptions-label">
                    <template slot="label">总税费</template>
                    <span>增值税 ＋ 城建税 ＋ 教育附加税 ＋ 地方教育附加税</span>
                  </el-descriptions-item>
                </el-descriptions>
                <span style="color: #909399; font-size: 11px; margin-top: 4px; display: block;">说明：ROUND=四舍五入(保留2位)；FLOOR=向下取整(保留2位)，若本月总收入不超过10万则次月退回</span>
              </div>
              <i class="el-icon-warning-outline hover-click"></i>
            </el-tooltip>
          </div>-->
<!--          <div class="detail-item">
            <span class="detail-operator">＋</span>
            <span>上月退回（元）：</span>
            <span>{{ formatCurrency(salaryData.preDeductionReturned || 0) }}</span>
            <el-tooltip content="上月的预扣除" placement="bottom-start" effect="light">
              <i class="el-icon-warning-outline hover-click"></i>
            </el-tooltip>
          </div>-->
          <div class="detail-item">
            <span class="detail-operator">－</span>
            <span>本月应缴个人所得税（元）：</span>
            <span>{{ formatCurrency(salaryData.payableIncomeTax || 0) }}</span>
            <el-tooltip content="年度应纳税所得额*预扣税率-速算扣除数-已缴纳税额" placement="bottom-start" effect="light">
              <i class="el-icon-warning-outline hover-click"></i>
            </el-tooltip>
          </div>
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label-class-name="descriptions-label">
            <template slot="label">
              <el-tooltip content="sum连续月份（若中间月份有中断则重算）的应发税前收入" placement="bottom-start" effect="light">
                <i class="el-icon-warning-outline hover-click m-r-4"></i>
              </el-tooltip>
              年度累计劳务报酬（元）
            </template>
            <span>{{ formatCurrency(salaryData.totalSalary || 0) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label-class-name="descriptions-label">
            <template slot="label">
              <el-tooltip content="年度累计劳务报酬的80%，减去累计月数*5000" placement="bottom-start" effect="light">
                <i class="el-icon-warning-outline hover-click m-r-4"></i>
              </el-tooltip>
              年度应纳税所得额（元）
            </template>
            <span>{{ formatCurrency(salaryData.totalAnnualTaxableIncome || 0) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label-class-name="descriptions-label">
            <template slot="label">
              <el-tooltip content="按照年度应纳税所得额匹配阶梯税率" placement="bottom-start" effect="light">
                <i class="el-icon-warning-outline hover-click m-r-4"></i>
              </el-tooltip>
              预扣税率（%）
            </template>
            <span>{{ formatCurrency(salaryData.taxRate || 0) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label-class-name="descriptions-label">
            <template slot="label">
              速算扣除数（元）
            </template>
            <span>{{ formatCurrency(salaryData.quickDeduction || 0) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label-class-name="descriptions-label">
            <template slot="label">
              <el-tooltip content="sum连续月份的各月已缴纳税额" placement="bottom-start" effect="light">
                <i class="el-icon-warning-outline hover-click m-r-4"></i>
              </el-tooltip>
              本年已缴纳税额（元）
            </template>
            <span>{{ formatCurrency(salaryData.totalPaidTax || 0) }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </div>
    <salary-other-amount-dialog ref="refSalaryOtherAmountDialog"></salary-other-amount-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import salaryRecordApi from "../../../api/salaryRecord"
import SalaryOtherAmountDialog from "./SalaryOtherAmountDialog"

export default {
  name: 'index',
  components: {SalaryOtherAmountDialog},
  data() {
    return {
      selectedMonth: '',
      salaryData: {},
      currentMassagistId: '',
      massagistStatus: 1,
      massagistKeyword: '',
      monthCodeList: [],
      people: [],
      peopleTotal: 0,
      peoplePage: 1,
      peopleSize: 20,
      peopleLoading: false,
      monthsLoading: false,
      detailLoading: false,
      resetting: false,
      peopleError: '',
      monthsError: '',
      detailError: '',
      peopleSequence: 0,
      monthsSequence: 0,
      detailSequence: 0,
      destroyed: false,
      isBefore11th: false,
      lastMonthCode: '',
      jsCanshu:'1.062',
      jsMarks:'',
    }
  },
  computed: {
    ...mapGetters(['roles', 'massagistId']),
    manager() {
      return (this.roles || []).some(role => ['超级管理员', '总助', '财务'].includes(role))
    },
    hasSalaryData() {
      return !this.detailError && !this.monthsError && !this.detailLoading && !this.monthsLoading &&
        !!this.currentMassagistId && !!this.selectedMonth && Object.keys(this.salaryData).length > 0
    }
  },
  created() {
    this.checkIsBefore11th()
    this.getLastMonthCode()
    if (this.manager) return this.fetchPeoplePage()
    if (this.massagistId) return this.handleUserSelect(this.massagistId)
  },
  beforeDestroy() {
    this.destroyed = true
    this.peopleSequence++
    this.monthsSequence++
    this.detailSequence++
  },
  methods: {
    clearSelection() {
      this.monthsSequence++
      this.detailSequence++
      this.currentMassagistId = ''
      this.selectedMonth = ''
      this.monthCodeList = []
      this.salaryData = {}
      this.monthsError = ''
      this.detailError = ''
      this.monthsLoading = false
      this.detailLoading = false
    },
    async fetchPeoplePage() {
      if (this.destroyed || !this.manager || this.resetting) return
      const sequence = ++this.peopleSequence
      const params = {page: this.peoplePage, size: this.peopleSize, order: 'name,id',
        status: this.massagistStatus < 0 ? undefined : this.massagistStatus,
        name: (this.massagistKeyword || '').trim() || undefined}
      this.clearSelection()
      this.people = []
      this.peopleTotal = 0
      this.peopleError = ''
      this.peopleLoading = true
      try {
        const {data} = await salaryRecordApi.people(params)
        if (this.destroyed || sequence !== this.peopleSequence) return
        const total = Number((data || {}).total) || 0
        const maxPage = Math.max(1, Math.ceil(total / params.size))
        if (params.page > maxPage) {
          this.peoplePage = maxPage
          return this.fetchPeoplePage()
        }
        this.people = (data || {}).list || []
        this.peopleTotal = total
        if (this.people.length) await this.handleUserSelect(this.people[0].id)
      } catch (error) {
        if (!this.destroyed && sequence === this.peopleSequence && !this.monthsError && !this.detailError) {
          this.peopleError = '疗愈师列表加载失败，请重试'
        }
        throw error
      } finally {
        if (!this.destroyed && sequence === this.peopleSequence) this.peopleLoading = false
      }
    },
    handlePeoplePageChange(page) {
      if (this.resetting) return
      this.peoplePage = page
      return this.fetchPeoplePage()
    },
    handlePeopleSizeChange(size) {
      if (this.resetting) return
      this.peopleSize = size
      return this.handleStatusChange()
    },
    handleStatusChange() {
      if (!this.manager || this.resetting) return
      this.peoplePage = 1
      return this.fetchPeoplePage()
    },
    handleUserSelect(command) {
      if (this.destroyed || this.resetting) return
      if (this.manager ? !this.people.some(person => person.id == command) : command != this.massagistId) return
      this.clearSelection()
      this.currentMassagistId = command
      return this.fetchMonthCodeData()
    },
    async fetchData() {
      if (this.destroyed) return
      const sequence = ++this.detailSequence
      const params = {massagistId: this.currentMassagistId, monthCode: this.selectedMonth}
      this.salaryData = {}
      this.detailError = ''
      if (!params.massagistId || !params.monthCode) {
        this.detailLoading = false
        return
      }
      this.jsCanshu = '1.068'
      this.jsMarks = '扣除6.8%服务费，即（本月接单结算+其他调整）÷1.068'
      this.detailLoading = true
      try {
        const {data} = await salaryRecordApi.info(params)
        if (!this.destroyed && sequence === this.detailSequence &&
            params.massagistId == this.currentMassagistId && params.monthCode === this.selectedMonth) {
          this.salaryData = data || {}
        }
      } catch (error) {
        if (!this.destroyed && sequence === this.detailSequence) this.detailError = '结算详情加载失败，请重试'
        throw error
      } finally {
        if (!this.destroyed && sequence === this.detailSequence) this.detailLoading = false
      }
    },
    async fetchMonthCodeData() {
      if (this.destroyed || !this.currentMassagistId) return
      const sequence = ++this.monthsSequence
      const massagistId = this.currentMassagistId
      this.monthCodeList = []
      this.selectedMonth = ''
      this.salaryData = {}
      this.monthsError = ''
      this.detailSequence++
      this.detailLoading = false
      this.monthsLoading = true
      try {
        const {data} = await salaryRecordApi.findMassagistAllMonthCode(massagistId)
        if (this.destroyed || sequence !== this.monthsSequence || massagistId != this.currentMassagistId) return
        this.monthCodeList = data || []
        if (this.monthCodeList.length) {
          this.selectedMonth = this.monthCodeList[0]
          await this.fetchData()
        }
      } catch (error) {
        if (!this.destroyed && sequence === this.monthsSequence && !this.detailError) {
          this.monthsError = '结算月份加载失败，请重试'
        }
        throw error
      } finally {
        if (!this.destroyed && sequence === this.monthsSequence) this.monthsLoading = false
      }
    },
    retryLoad() {
      if (this.peopleError) return this.fetchPeoplePage()
      if (this.monthsError) return this.fetchMonthCodeData()
      return this.fetchData()
    },
    async resetRecord() {
      if (this.destroyed || !this.manager || this.resetting || !this.currentMassagistId || !this.selectedMonth) return
      const params = {massagistId: this.currentMassagistId, monthCode: this.selectedMonth}
      this.resetting = true
      let loadingShown = false
      try {
        await this.notifyConfirm('此操作将重新结算所选疗愈师指定月份及之后的记录，确定要提交吗？')
        if (this.destroyed) return
        this.showFullLoading()
        loadingShown = true
        await salaryRecordApi.reset(params)
        if (!this.destroyed && params.massagistId == this.currentMassagistId && params.monthCode === this.selectedMonth) {
          await this.fetchData()
        }
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.resetting = false
      }
    },
    async resetRecordNew(){
      await salaryRecordApi.resetRecordNew()
    },
    formatCurrency(value) {
      if (this.checkHideData()) {
        return '*****'
      }
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
  },
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.el-dropdown-menu {
  max-height: 700px; /* 根据需求调整高度 */
  overflow-y: auto;
}
.salary-detail {
  padding: 20px;
  background-color: #f9f7fd;
  height: 100%;

  .salary-body {
    background-color: #fff;
    padding: 10px;
    border-radius: 10px;

    .detail-top {
      background-color: #f7f5f7;
      padding: 20px;
      border-radius: 10px;

      .top-selector {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 24px;

        .status-selector { width: 170px; }
        .name-search { width: 180px; }
        .person-selector { width: 200px; }

        .user-selector {
          display: flex;
          align-items: center;
          background-color: #e8def8;
          color: #303133;
          font-weight: bold;
          padding: 12px 20px;
          border-radius: 20px;
          margin-right: 30px;
          cursor: pointer;
        }

        .month-selector {
          display: flex;
          align-items: center;
          font-weight: bold;
          flex-wrap: wrap;
          gap: 12px;

          .el-select { width: 170px; }
          label { white-space: nowrap; }
        }

      }

      .people-pagination { margin-bottom: 24px; }
      .load-error { margin-bottom: 24px; }

      .salary-cards {
        display: flex;
        align-items: center;
        //justify-content: space-between;

        .card {
          display: flex;
          align-items: center;
          border-radius: 8px;
          flex: 1;
          min-width: 0;
          height: 100px;
          overflow: hidden;
        }

        .card-purple {
          background-color: #865ca6;
          color: #fff;
        }

        .card-blue {
          background-color: #fff;
          color: #303133;
          border: 1px solid #e3e2f1;

          .card-left-bar {
            width: 4px;
            background-color: #aab4f6;
            height: 40px;
            border-radius: 10px;
            margin-left: -1px;
          }
        }

        .card-orange {
          background-color: #fff;
          color: #303133;
          border: 1px solid #eddfdb;

          .card-left-bar {
            width: 4px;
            background-color: #f8b256;
            height: 40px;
            border-radius: 10px;
            margin-left: -1px;
          }
        }

        .card-green {
          background-color: #fff;
          color: #303133;
          border: 1px solid #d9eede;

          .card-left-bar {
            width: 4px;
            background-color: #4acc90;
            height: 40px;
            border-radius: 10px;
            margin-left: -1px;
          }
        }

        .card-pink {
          background-color: #fff;
          color: #303133;
          border: 1px solid #e9deef;

          .card-left-bar {
            width: 4px;
            background-color: #cc8cf6;
            height: 40px;
            border-radius: 10px;
            margin-left: -1px;
          }
        }

        .card-content {
          margin: 0 20px;

          .card-value {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 10px;
          }

          .card-label {
            font-size: 14px;
          }
        }

        .card-operator {
          font-size: 24px;
          font-weight: bold;
        }

      }
    }

    .detail-body {
      padding: 10px;

      .monthly-salary {
        margin: 14px 0 24px;
        color: #303133;

        .monthly-label {
          font-weight: bold;
        }

        .monthly-detail {
          margin-left: 15px;
          padding: 4px 15px;
          background-color: #f5f3ff;
          border-radius: 4px;
          font-size: 14px;

          span {
            margin-right: 20px;
            font-weight: 500;
            color: #606266;
          }

          span:last-child {
            margin-right: 0;
          }
        }
      }

      .reception-cap-note {
        margin: -14px 0 24px;
        padding: 8px 12px;
        border-radius: 6px;
        background-color: #FDF6EC;
        color: #A06A1F;
        font-size: 13px;
        line-height: 1.6;
      }

      .pre-tax-detail {
        margin-bottom: 24px;
        font-weight: bold;
        color: #303133;

        .detail-item {
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;

          .detail-operator {
            font-weight: bold;
            color: #6851a5;
            margin-right: 15px;
          }

          span {
            margin-right: 6px;
          }
        }
      }

      /deep/ .descriptions-label {
        width: 220px;
        text-align: right;
      }
    }
  }
}
</style>
