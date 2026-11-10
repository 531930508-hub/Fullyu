<template>
  <div class="app-container incentive-page">
    <div class="page-head">
      <div>
        <h2>接单奖励经营看板</h2>
        <p>按自然月统计，历史月份数据截至月末；当前月份截至今天。</p>
      </div>
      <div class="head-actions">
        <el-button size="small" icon="el-icon-setting" @click="$router.push('/incentive/settings')">
          奖励参数
        </el-button>
        <el-button size="small" icon="el-icon-edit-outline" @click="$router.push('/incentive/training')">
          培训考核
        </el-button>
        <el-button v-if="isGlobal" size="small" type="primary" icon="el-icon-download" :loading="exporting" :disabled="exporting" @click="exportCsv">
          导出全部明细
        </el-button>
      </div>
    </div>

    <div class="filter-bar">
      <el-date-picker
        v-model="month"
        type="month"
        value-format="yyyy-MM"
        format="yyyy 年 MM 月"
        :clearable="false"
        :picker-options="monthOptions"
        placeholder="选择月份"
        @change="resetAndLoad"/>
      <el-select
        v-model="shopId"
        clearable
        filterable
        placeholder="全部门店"
        style="width: 200px"
        @change="resetAndLoad">
        <el-option v-for="shop in shops" :key="shop.id" :label="shop.name" :value="shop.id"/>
      </el-select>
      <el-select
        v-model="status"
        style="width: 170px"
        aria-label="合作状态"
        @change="resetAndLoad">
        <el-option label="合作中" :value="1"/>
        <el-option label="暂停合作" :value="2"/>
        <el-option label="已结束合作" :value="0"/>
        <el-option label="全部合作状态" :value="-1"/>
      </el-select>
      <el-button icon="el-icon-refresh" @click="loadData">刷新</el-button>
      <span class="filter-note">
        数据截止 {{ dashboard.cutoff || '—' }}
        <template v-if="dashboard.usingDefaultConfig"> · 当前使用系统默认参数</template>
      </span>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card primary">
        <small>合作结算预估合计</small>
        <strong>¥{{ money(dashboard.totalSettlement) }}</strong>
        <span>{{ dashboard.therapistCount || 0 }} 位疗愈师 · 预估口径</span>
      </div>
      <div class="kpi-card">
        <small>基础接单奖励</small>
        <strong>¥{{ money(dashboard.totalBase) }}</strong>
        <span>按折算分钟 × 对应档位系数</span>
      </div>
      <div class="kpi-card">
        <small>培训 + 复购奖励</small>
        <strong>¥{{ money(numberValue(dashboard.totalTraining) + numberValue(dashboard.totalRepurchase)) }}</strong>
        <span>培训 {{ money(dashboard.totalTraining) }} · 复购 {{ money(dashboard.totalRepurchase) }}</span>
      </div>
      <div class="kpi-card">
        <small>店长奖励</small>
        <strong>¥{{ money(dashboard.totalManager) }}</strong>
        <span>整店目标达成后按实收提点</span>
      </div>
    </div>

    <div v-if="dashboard.shopId" class="target-strip">
      <div class="target-title">
        <span>门店业绩目标</span>
        <b>{{ dashboard.shopName }}</b>
      </div>
      <div class="target-metric">
        <small>目标</small>
        <span>¥{{ money(dashboard.targetRevenue) }}</span>
      </div>
      <div class="target-metric">
        <small>实际实收</small>
        <span>¥{{ money(dashboard.actualRevenue) }}</span>
      </div>
      <div class="target-metric">
        <small>达成率</small>
        <span>{{ percent(dashboard.achievementRate) }}</span>
      </div>
      <div class="target-metric">
        <small>店长奖励</small>
        <span>¥{{ money(dashboard.managerAmount) }}<em v-if="dashboard.managerName"> · {{ dashboard.managerName }}</em></span>
      </div>
      <el-progress
        :percentage="Math.min(100, numberValue(dashboard.achievementRate))"
        :stroke-width="8"
        :show-text="false"
        color="#6750A4"
        class="target-progress"/>
    </div>

    <div v-if="dashboard.warnings && dashboard.warnings.length" class="warning-panel">
      <div class="warning-head">
        <span><i class="el-icon-warning-outline"></i> 结算前请核对</span>
        <el-button type="text" size="mini" @click="warningsOpen = !warningsOpen">
          {{ warningsOpen ? '收起' : '展开全部' }}
        </el-button>
      </div>
      <ul v-show="warningsOpen">
        <li v-for="(warning, index) in dashboard.warnings" :key="index">{{ warning }}</li>
      </ul>
    </div>

    <div class="table-card">
      <div class="table-head">
        <div>
          <h3>疗愈师明细</h3>
          <p>按激励合计从高到低排序，点击“明细”查看档位与构成。</p>
        </div>
        <span class="table-note">复购奖励需老客 60 天留存率达标后计入</span>
      </div>
      <el-table
        v-loading="loading"
        :data="dashboard.therapists"
        border
        stripe
        style="width: 100%"
        @row-click="openBoard">
        <el-table-column label="疗愈师" min-width="150" fixed>
          <template slot-scope="scope">
            <div class="person-cell">
              <div class="avatar">{{ (scope.row.massagistName || '·').slice(0, 1) }}</div>
              <div>
                <b>{{ scope.row.massagistName }}</b>
                <small>{{ scope.row.cooperationStatus }} · {{ scope.row.shopName || '未分配门店' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="折算时长" width="110" align="right">
          <template slot-scope="scope">{{ money(scope.row.base.minutes, 0) }} 分</template>
        </el-table-column>
        <el-table-column label="系数" width="80" align="center">
          <template slot-scope="scope">
            <el-tag size="mini" effect="plain">{{ decimal(scope.row.base.coefficient) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="基础奖励" width="120" align="right">
          <template slot-scope="scope">¥{{ money(scope.row.base.amount) }}</template>
        </el-table-column>
        <el-table-column label="培训奖励" width="110" align="right">
          <template slot-scope="scope">¥{{ money(scope.row.training.earnedAmount) }}</template>
        </el-table-column>
        <el-table-column label="复购奖励" width="110" align="right">
          <template slot-scope="scope">¥{{ money(scope.row.repurchase.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="店长奖励" width="110" align="right">
          <template slot-scope="scope">¥{{ money(scope.row.manager.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="其他调整" width="110" align="right">
          <template slot-scope="scope">¥{{ money(scope.row.settlement.adjustment) }}</template>
        </el-table-column>
        <el-table-column label="激励合计" width="120" align="right">
          <template slot-scope="scope">
            <b>¥{{ money(scope.row.settlement.subtotal) }}</b>
          </template>
        </el-table-column>
        <el-table-column label="个税预估" width="110" align="right">
          <template slot-scope="scope">¥{{ money(scope.row.settlement.tax) }}</template>
        </el-table-column>
        <el-table-column label="结算预估" width="125" align="right">
          <template slot-scope="scope">
            <span class="net-amount">¥{{ money(scope.row.settlement.net) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center" fixed="right">
          <template slot-scope="scope">
            <el-button type="text" @click.stop="openBoard(scope.row)">明细</el-button>
          </template>
        </el-table-column>
        <template slot="empty">
          <div class="table-empty">当前筛选条件下没有疗愈师数据</div>
        </template>
      </el-table>
      <div class="pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[20, 50, 100]"
          :page-size="size"
          :current-page="page"
          :total="dashboard.therapistCount || 0"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"/>
      </div>
    </div>

    <board-drawer
      :visible.sync="drawerVisible"
      :board="selectedBoard"
      :config="config"
      :loading="drawerLoading"/>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import {saveAs} from 'file-saver'
import incentiveApi from '@/api/incentive'
import BoardDrawer from '@/views/incentive/dashboard/BoardDrawer'
import {decimal, money, numberValue, percent} from '@/views/incentive/format'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default {
  name: 'IncentiveDashboard',
  components: {BoardDrawer},
  data() {
    return {
      month: currentMonth(),
      shopId: null,
      status: 1,
      page: 1,
      size: 20,
      shops: [],
      dashboard: {
        therapists: [],
        warnings: []
      },
      config: null,
      loading: false,
      exporting: false,
      requestSequence: 0,
      drawerSequence: 0,
      destroyed: false,
      drawerVisible: false,
      drawerLoading: false,
      selectedBoard: null,
      warningsOpen: true,
      monthOptions: {
        disabledDate(date) {
          return date.getTime() > Date.now()
        }
      }
    }
  },
  computed: {
    ...mapGetters(['roles']),
    isGlobal() {
      // 导出接口在服务端要求运营/财务类角色，非全局账号不展示导出入口。
      const globalRoles = ['超级管理员', '总助', '运营', '财务', 'admin']
      return (this.roles || []).some(role => globalRoles.indexOf(role) >= 0)
    }
  },
  created() {
    this.bootstrap()
  },
  beforeDestroy() {
    this.destroyed = true
    this.requestSequence++
    this.drawerSequence++
  },
  watch: {
    drawerVisible(visible) {
      if (!visible) {
        this.drawerSequence++
        this.drawerLoading = false
      }
    }
  },
  methods: {
    async bootstrap() {
      await this.loadShops()
      if (!this.destroyed) await this.loadData()
    },
    money,
    decimal,
    percent,
    numberValue,
    async loadShops() {
      const res = await incentiveApi.shops()
      if (this.destroyed) return
      this.shops = res.data || []
      if (!this.shopId && this.shops.length === 1) {
        this.shopId = this.shops[0].id
      }
    },
    resetAndLoad() {
      this.page = 1
      this.loadData()
    },
    handleSizeChange(size) {
      this.size = size
      this.page = 1
      this.loadData()
    },
    handlePageChange(page) {
      this.page = page
      this.loadData()
    },
    async loadData() {
      if (this.destroyed) return
      const sequence = ++this.requestSequence
      const filters = {
        month: this.month,
        shopId: this.shopId || undefined,
        status: this.status,
        page: this.page,
        size: this.size
      }
      this.drawerVisible = false
      this.drawerSequence++
      this.drawerLoading = false
      this.loading = true
      try {
        const [dashboardRes, configRes] = await Promise.all([
          incentiveApi.dashboard(filters),
          incentiveApi.config({month: filters.month})
        ])
        if (this.destroyed || sequence !== this.requestSequence) return
        this.dashboard = dashboardRes.data || {therapists: [], warnings: []}
        this.config = configRes.data || null
        // 非全局角色由后端收敛到授权门店，前端同步显示真实取数门店。
        if (!this.shopId && this.dashboard.shopId) {
          this.shopId = this.dashboard.shopId
        }
      } finally {
        if (!this.destroyed && sequence === this.requestSequence) this.loading = false
      }
    },
    async openBoard(row) {
      if (this.destroyed || this.loading || !row || !row.massagistId) return
      const sequence = ++this.drawerSequence
      this.selectedBoard = row
      this.drawerVisible = true
      this.drawerLoading = true
      try {
        const res = await incentiveApi.board({
          massagistId: row.massagistId,
          month: this.month,
          shopId: this.dashboard.shopId || undefined
        })
        if (this.destroyed || !this.drawerVisible || sequence !== this.drawerSequence) return
        this.selectedBoard = res.data
      } finally {
        if (!this.destroyed && sequence === this.drawerSequence) this.drawerLoading = false
      }
    },
    async exportCsv() {
      if (this.destroyed || this.exporting) return
      const filters = {month: this.month, shopId: this.shopId || undefined, status: this.status}
      this.exporting = true
      let loadingShown = false
      try {
        await this.notifyConfirm('将导出当前月份、门店和合作状态筛选下的全部明细，是否继续？', '导出确认')
        if (this.destroyed) return
        this.showFullLoading('正在生成明细')
        loadingShown = true
        const res = await incentiveApi.exportCsv(filters)
        if (this.destroyed) return
        const blob = new Blob([res.data], {type: 'text/csv;charset=utf-8'})
        saveAs(blob, `接单奖励明细-${filters.month}.csv`)
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.exporting = false
      }
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.incentive-page {
  background: #EEF0F3;
  min-height: calc(100vh - 50px);
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    font-size: 22px;
    color: #2B2930;
    letter-spacing: -0.5px;
  }

  p {
    margin: 6px 0 0;
    font-size: 12px;
    color: #79747E;
  }
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-bar {
  background: #fff;
  border-radius: 10px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.filter-note {
  margin-left: auto;
  font-size: 11px;
  color: #79747E;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.kpi-card {
  background: #fff;
  border-radius: 10px;
  padding: 18px 20px;
  border: 1px solid #E7E4EC;

  small {
    display: block;
    font-size: 12px;
    color: #79747E;
  }

  strong {
    display: block;
    margin: 8px 0 5px;
    font-size: 27px;
    font-weight: 600;
    color: #2B2930;
    letter-spacing: -0.8px;
  }

  span {
    font-size: 11px;
    color: #9A96A2;
  }

  &.primary {
    background: linear-gradient(135deg, #4A3B63 0%, #6750A4 100%);
    border-color: transparent;

    small, span {
      color: rgba(255, 255, 255, 0.76);
    }

    strong {
      color: #fff;
    }
  }
}

.target-strip {
  display: flex;
  align-items: center;
  gap: 28px;
  background: #fff;
  border-radius: 10px;
  padding: 14px 20px;
  margin-top: 14px;
  border: 1px solid #E7E4EC;
  flex-wrap: wrap;
}

.target-title {
  display: flex;
  flex-direction: column;
  gap: 3px;

  span {
    font-size: 11px;
    color: #79747E;
  }

  b {
    font-size: 14px;
    color: #2B2930;
  }
}

.target-metric {
  small {
    display: block;
    font-size: 11px;
    color: #79747E;
  }

  span {
    display: block;
    margin-top: 4px;
    font-size: 15px;
    color: #2B2930;
    font-weight: 500;
  }

  em {
    font-style: normal;
    font-size: 11px;
    color: #79747E;
    font-weight: 400;
  }
}

.target-progress {
  flex: 1;
  min-width: 180px;
  margin-left: auto;
}

.warning-panel {
  background: #FFF8E8;
  border: 1px solid #F0DFB6;
  border-radius: 10px;
  padding: 12px 18px;
  margin-top: 14px;
  color: #8A6A23;

  .warning-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
  }

  ul {
    margin: 8px 0 0;
    padding-left: 18px;
  }

  li {
    font-size: 12px;
    line-height: 1.9;
    color: #8A6A23;
  }
}

.table-card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #E7E4EC;
  padding: 18px;
  margin-top: 16px;
}

.table-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-size: 15px;
    color: #2B2930;
  }

  p {
    margin: 5px 0 0;
    font-size: 11px;
    color: #79747E;
  }
}

.table-note {
  font-size: 11px;
  color: #79747E;
}

.person-cell {
  display: flex;
  align-items: center;
  gap: 10px;

  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #F1EDF8;
    color: #6750A4;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }

  b {
    display: block;
    font-size: 13px;
    color: #2B2930;
  }

  small {
    display: block;
    margin-top: 2px;
    font-size: 10px;
    color: #79747E;
  }
}

.net-amount {
  color: #6750A4;
  font-weight: 600;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.table-empty {
  padding: 40px 0;
  color: #9A96A2;
  font-size: 12px;
}

@media (max-width: 1280px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
