<template>
  <div class="aa-page">
    <div class="aa-filter">
      <el-date-picker
        v-model="month"
        type="month"
        value-format="yyyy-MM"
        format="yyyy 年 MM 月"
        :clearable="false"
        :picker-options="monthOptions"
        placeholder="统计月份"
        @change="load"/>
      <el-select
        v-model="shopId"
        clearable
        filterable
        placeholder="全部门店"
        style="width: 200px"
        @change="load">
        <el-option v-for="shop in shops" :key="shop.id" :label="shop.name" :value="shop.id"/>
      </el-select>
      <el-button icon="el-icon-refresh" @click="load">刷新</el-button>
      <div class="aa-export">
        <el-button size="small" icon="el-icon-download" :loading="exporting" @click="doExport('record')">
          导出考核明细
        </el-button>
        <el-button size="small" icon="el-icon-document" :loading="exporting" @click="doExport('cert')">
          导出认证台账
        </el-button>
      </div>
    </div>

    <div v-loading="loading" class="aa-body">
      <p v-if="error" class="aa-error">{{ error }}</p>

      <div class="aa-metrics">
        <div class="aa-metric">
          <small>提交数</small>
          <strong>{{ summary.total }}</strong>
          <span>本月有效票</span>
        </div>
        <div class="aa-metric">
          <small>通过率</small>
          <strong>{{ summary.passRate || '-' }}</strong>
          <span>通过 {{ summary.passCount }} · 不通过 {{ summary.failCount }}</span>
        </div>
        <div class="aa-metric">
          <small>已认证</small>
          <strong>{{ summary.certifiedCount }}</strong>
          <span>三人 {{ summary.teamCertifiedCount }} · 人工 {{ summary.manualCertifiedCount }} · 历史 {{ summary.legacyCertifiedCount }}</span>
        </div>
        <div class="aa-metric">
          <small>平均尝试次数</small>
          <strong>{{ summary.avgAttempts || '-' }}</strong>
          <span>每种项目认证前</span>
        </div>
        <div class="aa-metric">
          <small>平均认证天数</small>
          <strong>{{ summary.avgDaysToCert || '-' }}</strong>
          <span>首次考核到认证</span>
        </div>
        <div class="aa-metric">
          <small>反复失败人数</small>
          <strong>{{ summary.repeatedFailureCount }}</strong>
          <span>未认证且失败 ≥ 2 次</span>
        </div>
      </div>

      <div class="aa-card">
        <div class="aa-card-head">
          <h3>近 6 个月考核量</h3>
          <span>提交数 / 认证数</span>
        </div>
        <div class="aa-trend">
          <div v-for="item in summary.monthlyTrend" :key="item.month" class="aa-trend-col">
            <div class="aa-trend-value">{{ item.total }}</div>
            <div class="aa-trend-track">
              <div class="aa-trend-bar" :style="{height: trendHeight(item.total)}"></div>
            </div>
            <small>{{ item.month.slice(5) }} 月</small>
          </div>
          <p v-if="!summary.monthlyTrend.length" class="aa-empty">暂无趋势数据</p>
        </div>
      </div>

      <div class="aa-grid">
        <div class="aa-card">
          <div class="aa-card-head">
            <h3>项目分布</h3>
            <span>本月有效票</span>
          </div>
          <el-table :data="summary.byProject" size="mini" border>
            <el-table-column prop="projectName" label="项目" min-width="120"/>
            <el-table-column prop="total" label="提交" width="70" align="center"/>
            <el-table-column prop="pass" label="通过" width="70" align="center"/>
            <el-table-column prop="fail" label="不通过" width="80" align="center"/>
            <el-table-column prop="passRate" label="通过率" width="90" align="center"/>
            <template slot="empty">
              <div class="aa-empty">本月暂无考核</div>
            </template>
          </el-table>
        </div>

        <div class="aa-card">
          <div class="aa-card-head">
            <h3>内训师表现</h3>
            <span>失败率 ≥ 80% 且提交 ≥ 3 标红</span>
          </div>
          <el-table :data="summary.byTrainer" size="mini" border>
            <el-table-column prop="trainerName" label="内训师" min-width="100"/>
            <el-table-column prop="total" label="提交" width="70" align="center"/>
            <el-table-column prop="pass" label="通过" width="70" align="center"/>
            <el-table-column prop="fail" label="不通过" width="80" align="center"/>
            <el-table-column label="通过率" width="90" align="center">
              <template slot-scope="scope">
                <span :class="{'aa-warn-text': highFailure(scope.row)}">{{ scope.row.passRate }}</span>
              </template>
            </el-table-column>
            <el-table-column label="失败率" width="90" align="center">
              <template slot-scope="scope">
                <span :class="{'aa-warn-text': highFailure(scope.row)}">{{ scope.row.failRate }}</span>
              </template>
            </el-table-column>
            <template slot="empty">
              <div class="aa-empty">本月暂无内训师提交</div>
            </template>
          </el-table>
        </div>

        <div class="aa-card">
          <div class="aa-card-head">
            <h3>门店分布</h3>
            <span>提交与认证</span>
          </div>
          <el-table :data="summary.byShop" size="mini" border>
            <el-table-column prop="shopName" label="门店" min-width="140"/>
            <el-table-column prop="total" label="提交" width="80" align="center"/>
            <el-table-column prop="certified" label="已认证" width="90" align="center"/>
            <template slot="empty">
              <div class="aa-empty">本月暂无门店数据</div>
            </template>
          </el-table>
        </div>
      </div>

      <div class="aa-grid">
        <div class="aa-card">
          <div class="aa-card-head">
            <h3>反复失败名单</h3>
            <span>未认证且失败 ≥ 2 次，最多 50 人</span>
          </div>
          <el-table :data="summary.repeatedTargets" size="mini" border>
            <el-table-column prop="massagistName" label="疗愈师" min-width="90"/>
            <el-table-column prop="shopName" label="门店" min-width="110" show-overflow-tooltip/>
            <el-table-column prop="projectName" label="项目" min-width="100"/>
            <el-table-column prop="attemptCount" label="考核" width="70" align="center"/>
            <el-table-column prop="failCount" label="失败" width="70" align="center"/>
            <el-table-column prop="lastAssessDate" label="最后考核" width="110"/>
            <template slot="empty">
              <div class="aa-empty">没有反复失败的疗愈师</div>
            </template>
          </el-table>
        </div>

        <div class="aa-card">
          <div class="aa-card-head">
            <h3>未认证积压</h3>
            <span>有考核但尚未认证，最多 50 人</span>
          </div>
          <el-table :data="summary.backlogTargets" size="mini" border>
            <el-table-column prop="massagistName" label="疗愈师" min-width="90"/>
            <el-table-column prop="shopName" label="门店" min-width="110" show-overflow-tooltip/>
            <el-table-column prop="projectName" label="项目" min-width="100"/>
            <el-table-column prop="attemptCount" label="考核" width="70" align="center"/>
            <el-table-column prop="failCount" label="失败" width="70" align="center"/>
            <el-table-column prop="lastAssessDate" label="最后考核" width="110"/>
            <template slot="empty">
              <div class="aa-empty">没有未认证积压</div>
            </template>
          </el-table>
        </div>
      </div>

      <p class="aa-footnote">
        考核分析只做过程观察，不参与奖励计算。奖励仍按认证台账中的通过日期计算。
      </p>
    </div>
  </div>
</template>

<script>
import {saveAs} from 'file-saver'
import incentiveApi from '@/api/incentive'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function emptySummary() {
  return {
    total: 0,
    passCount: 0,
    failCount: 0,
    passRate: '',
    certifiedCount: 0,
    teamCertifiedCount: 0,
    manualCertifiedCount: 0,
    legacyCertifiedCount: 0,
    avgAttempts: '',
    avgDaysToCert: '',
    repeatedFailureCount: 0,
    backlogCount: 0,
    byProject: [],
    byTrainer: [],
    byShop: [],
    monthlyTrend: [],
    repeatedTargets: [],
    backlogTargets: []
  }
}

export default {
  name: 'AssessmentAnalytics',
  props: {
    shops: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      month: currentMonth(),
      shopId: null,
      summary: emptySummary(),
      loading: false,
      exporting: false,
      error: '',
      requestId: 0,
      destroyed: false,
      monthOptions: {
        disabledDate(date) {
          return date.getTime() > Date.now()
        }
      }
    }
  },
  created() {
    this.load()
  },
  beforeDestroy() {
    this.destroyed = true
    this.requestId++
  },
  methods: {
    async load() {
      if (this.destroyed) return
      const requestId = ++this.requestId
      this.loading = true
      this.error = ''
      try {
        const res = await incentiveApi.assessmentSummary({
          month: this.month,
          shopId: this.shopId || undefined
        })
        if (this.destroyed || requestId !== this.requestId) return
        this.summary = Object.assign(emptySummary(), res.data || {})
      } catch (e) {
        if (this.destroyed || requestId !== this.requestId) return
        this.summary = emptySummary()
        this.error = '考核分析暂时无法读取，请稍后重试。'
      } finally {
        if (!this.destroyed && requestId === this.requestId) this.loading = false
      }
    },
    async doExport(kind) {
      if (this.exporting) return
      this.exporting = true
      try {
        const res = kind === 'cert'
          ? await incentiveApi.exportCertifications({
            month: this.month,
            shopId: this.shopId || undefined
          })
          : await incentiveApi.exportAssessments({
            month: this.month,
            shopId: this.shopId || undefined
          })
        const filename = kind === 'cert'
          ? `培训认证台账-${this.month}.csv`
          : `内训考核明细-${this.month}.csv`
        saveAs(new Blob([res.data], {type: 'text/csv;charset=utf-8'}), filename)
      } finally {
        this.exporting = false
      }
    },
    trendHeight(value) {
      const values = (this.summary.monthlyTrend || []).map(item => Number(item.total) || 0)
      const max = Math.max.apply(null, [1].concat(values))
      const ratio = (Number(value) || 0) / max
      return `${Math.max(4, Math.round(ratio * 110))}px`
    },
    highFailure(row) {
      if (!row || Number(row.total) < 3) return false
      return parseFloat(String(row.failRate || '0')) >= 80
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.aa-page {
  padding-top: 14px;
}

.aa-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: #fff;
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 14px;

  .aa-export {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
}

.aa-body {
  min-height: 240px;
}

.aa-error {
  margin: 0 0 12px;
  padding: 10px 14px;
  background: #FBF1EE;
  border: 1px solid #EDD6CF;
  border-radius: 8px;
  font-size: 11px;
  color: #A35C4A;
}

.aa-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.aa-metric {
  background: #fff;
  border: 1px solid #E7E4EC;
  border-radius: 10px;
  padding: 14px 16px;

  small {
    display: block;
    font-size: 10px;
    color: #79747E;
  }

  strong {
    display: block;
    margin: 6px 0 4px;
    font-size: 22px;
    color: #2B2930;
    font-weight: 600;
  }

  span {
    display: block;
    font-size: 9px;
    color: #9A96A2;
    line-height: 1.5;
  }
}

.aa-card {
  background: #fff;
  border: 1px solid #E7E4EC;
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 14px;
}

.aa-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-size: 14px;
    color: #2B2930;
  }

  span {
    font-size: 10px;
    color: #9A96A2;
  }
}

.aa-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;

  .aa-card {
    margin-bottom: 14px;
  }
}

.aa-trend {
  display: flex;
  align-items: flex-end;
  gap: 18px;
  min-height: 150px;
  padding: 6px 4px 0;
}

.aa-trend-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  flex: 1;

  .aa-trend-value {
    font-size: 10px;
    color: #79747E;
  }

  .aa-trend-track {
    height: 112px;
    width: 100%;
    max-width: 46px;
    display: flex;
    align-items: flex-end;
    background: #F7F4FC;
    border-radius: 6px;
    overflow: hidden;
  }

  .aa-trend-bar {
    width: 100%;
    background: linear-gradient(180deg, #B9A9D6, #6750A4);
    border-radius: 6px 6px 0 0;
    transition: height 0.2s ease;
  }

  small {
    font-size: 10px;
    color: #79747E;
  }
}

.aa-warn-text {
  color: #C0432F;
  font-weight: 600;
}

.aa-empty {
  padding: 22px 0;
  text-align: center;
  font-size: 11px;
  color: #9A96A2;
}

.aa-footnote {
  margin: 2px 0 0;
  font-size: 11px;
  color: #79747E;
  line-height: 1.7;
}

@media (max-width: 1400px) {
  .aa-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .aa-grid {
    grid-template-columns: 1fr;
  }
}
</style>
