<template>
  <div class="salary-record-detail" v-loading="loading">
    <div v-if="hasData" class="salary-cards">
      <div class="card card-purple">
        <div class="card-content">
          <div class="card-value">{{ formatCurrency(salaryData.actualIncome || 0) }}</div>
          <div class="card-label">预估税后收入（元）</div>
        </div>
      </div>
      <div class="card-operator">＝</div>
      <div class="card card-blue">
        <div class="card-left-bar"></div>
        <div class="card-content">
          <div class="card-value">{{ formatCurrency(salaryData.preTaxIncome || 0) }}</div>
          <div class="card-label">税前收入（元）</div>
        </div>
      </div>
      <div class="card-operator">－</div>
      <div class="card card-pink">
        <div class="card-left-bar"></div>
        <div class="card-content">
          <div class="card-value">{{ formatCurrency(salaryData.payableIncomeTax || 0) }}</div>
          <div class="card-label">本月应缴个人所得税（元）</div>
        </div>
      </div>
    </div>
    <div v-if="hasData" class="detail-body">
      <div class="monthly-salary">
        <span class="monthly-label">本月接单结算（元）</span>
        <span class="monthly-detail">
          <span>{{ formatNumber(salaryData.totalDuration || 0) }}分钟</span>
          <span>×</span>
          <span>{{ formatNumber(salaryData.coefficient || 0) }}</span>
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
            <span>{{ formatCurrency(salaryData.otherAmount > 0 ? salaryData.otherAmount : (salaryData.otherAmount * -1) || 0) }}</span>
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
          <el-tooltip v-if="salaryData.salary + salaryData.otherAmount >= 0" :content="jsMarks"
                      placement="bottom-start" effect="light">
            <i class="el-icon-warning-outline hover-click"></i>
          </el-tooltip>
          <el-tooltip v-else content="税前收入小于0元，请检查数据是否异常" placement="bottom-start" effect="light">
            <i class="el-icon-warning-outline hover-click"></i>
          </el-tooltip>
        </div>
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
          <span>{{ formatNumber(salaryData.taxRate || 0) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label-class-name="descriptions-label">
          <template slot="label">
            速算扣除数（元）
          </template>
          <span>{{ formatNumber(salaryData.quickDeduction || 0) }}</span>
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
</template>

<script>
export default {
  name: 'SalaryRecordDetail',
  props: {
    salaryData: {type: Object, default: () => ({})},
    loading: {type: Boolean, default: false},
    masked: {type: Boolean, default: false},
    jsCanshu: {type: String, default: '1.068'},
    jsMarks: {type: String, default: '扣除6.8%服务费，即（本月接单结算+其他调整）÷1.068'}
  },
  computed: {
    hasData() {
      return Object.keys(this.salaryData || {}).length > 0
    }
  },
  methods: {
    formatCurrency(value) {
      if (this.masked) return '*****'
      const num = Number(value) || 0
      return num.toLocaleString('zh-CN')
    },
    formatNumber(value) {
      if (this.masked) return '*****'
      const num = Number(value) || 0
      return num.toLocaleString('zh-CN')
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.salary-cards {
  display: flex;
  align-items: center;

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

.detail-body {
  padding: 10px;

  .monthly-salary {
    margin: 14px 0 24px;
    color: #303133;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;

    .monthly-label {
      font-weight: bold;
    }

    .monthly-detail {
      padding: 4px 15px;
      background-color: #f5f3ff;
      border-radius: 4px;
      font-size: 14px;

      span {
        margin-right: 16px;
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
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;

      .detail-operator {
        font-weight: bold;
        color: #6851a5;
        margin-right: 8px;
      }

      .monthly-detail {
        padding: 2px 10px;
        background-color: #f5f3ff;
        border-radius: 4px;
        font-weight: 500;

        span {
          margin-right: 12px;
        }

        span:last-child {
          margin-right: 0;
        }
      }
    }
  }

  /deep/ .descriptions-label {
    width: 220px;
    text-align: right;
  }
}
</style>