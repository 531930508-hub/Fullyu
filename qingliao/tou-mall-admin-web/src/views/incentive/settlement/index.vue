<template>
  <div class="app-container incentive-page settlement-page">
    <div class="page-head">
      <div>
        <h2>月度结算单</h2>
        <p>生成后金额即冻结为快照，确认/发布不再随排班、考核与规则变化；发放仍以财务审批和打款为准。</p>
      </div>
      <div class="head-actions">
        <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="loadAll">刷新</el-button>
        <el-button v-if="canManage" size="small" type="primary" icon="el-icon-document-add"
                   :loading="generating" @click="generate">
          生成草稿
        </el-button>
        <el-button v-if="isGlobal" size="small" icon="el-icon-download" :loading="exporting"
                   :disabled="exporting" @click="exportCsv">
          导出结算单
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
        @change="reload"/>
      <el-select v-model="shopId" clearable filterable placeholder="全部门店" style="width: 200px" @change="reload">
        <el-option v-for="shop in shops" :key="shop.id" :label="shop.name" :value="shop.id"/>
      </el-select>
      <el-select v-model="status" clearable placeholder="全部状态" style="width: 150px" @change="reload">
        <el-option label="草稿" value="DRAFT"/>
        <el-option label="已确认" value="CONFIRMED"/>
        <el-option label="已发布" value="PUBLISHED"/>
      </el-select>
      <el-input v-model="keyword" clearable placeholder="搜索疗愈师 / 门店" style="width: 220px"
                @keyup.enter.native="reload" @clear="reload"/>
      <el-button icon="el-icon-search" @click="reload">查询</el-button>
      <span class="filter-note" v-if="overview.lastGeneratedTime">
        最近生成 {{ overview.lastGeneratedTime }}
      </span>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card primary">
        <small>结算应发合计</small>
        <strong>¥{{ money(overview.totalNet) }}</strong>
        <span>{{ overview.count || 0 }} 人 · 个税合计 ¥{{ money(overview.totalTax) }}</span>
      </div>
      <div class="kpi-card">
        <small>草稿待确认</small>
        <strong>{{ overview.draftCount || 0 }} 人</strong>
        <span>¥{{ money(overview.draftNet) }}</span>
      </div>
      <div class="kpi-card">
        <small>已确认待发布</small>
        <strong>{{ overview.confirmedCount || 0 }} 人</strong>
        <span>¥{{ money(overview.confirmedNet) }}</span>
      </div>
      <div class="kpi-card">
        <small>已发布</small>
        <strong>{{ overview.publishedCount || 0 }} 人</strong>
        <span>疗愈师可在「我的接单奖励」查看</span>
      </div>
      <div class="kpi-card">
        <small>复购待计入</small>
        <strong>¥{{ money(overview.totalPotential) }}</strong>
        <span>{{ overview.repurchasePending || 0 }} 人存在潜力差额</span>
      </div>
    </div>

    <div v-if="shopChips.length" class="shop-chips">
      <span class="chips-label">门店分布</span>
      <span v-for="shop in shopChips" :key="shop.key" class="shop-chip">
        {{ shop.shopName || '未分配门店' }}
        <b>¥{{ money(shop.net) }}</b>
        <em>{{ shop.count }} 人</em>
      </span>
    </div>

    <div class="table-card">
      <div class="table-toolbar">
        <div class="toolbar-left">
          <el-button size="mini" type="primary" plain :disabled="!selectedIds.length || !isGlobal"
                     @click="batchConfirm">
            批量确认（{{ selectedIds.length }}）
          </el-button>
          <el-button size="mini" type="success" plain :disabled="!selectedIds.length || !isGlobal"
                     @click="batchPublish">
            批量发布（{{ selectedIds.length }}）
          </el-button>
          <span v-if="overview.warningRows" class="toolbar-note">
            <i class="el-icon-warning-outline"></i>{{ overview.warningRows }} 人存在口径提醒，见明细
          </span>
        </div>
        <div class="toolbar-right">
          <span class="status-legend">
            <em class="dot draft"></em>草稿 <em class="dot confirmed"></em>已确认 <em class="dot published"></em>已发布
          </span>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        size="small"
        border
        @selection-change="handleSelection">
        <el-table-column type="selection" width="42" align="center"/>
        <el-table-column type="expand" width="38">
          <template slot-scope="scope">
            <div class="snapshot-panel">
              <div class="snapshot-head">
                <div>
                  <b>快照信息 · {{ scope.row.monthCode }}</b>
                  <small>金额与构成在生成时固化，之后排班、考核与规则变化不再回写；完整明细见「明细」抽屉。</small>
                </div>
                <el-button type="text" size="mini" @click.stop="openDetail(scope.row)">查看完整快照</el-button>
              </div>
              <div class="snapshot-grid">
                <div class="snapshot-block">
                  <span class="block-title">流转记录</span>
                  <div class="kv"><span>当前状态</span><b>{{ statusMeta(scope.row.status).text }}</b></div>
                  <div class="kv">
                    <span>生成</span>
                    <b>{{ scope.row.generatedBy || '—' }} · {{ shortTime(scope.row.generatedTime) }}</b>
                  </div>
                  <div v-if="scope.row.confirmedTime" class="kv">
                    <span>确认</span>
                    <b>{{ scope.row.confirmedBy || '—' }} · {{ shortTime(scope.row.confirmedTime) }}</b>
                  </div>
                  <div v-if="scope.row.publishedTime" class="kv">
                    <span>发布</span>
                    <b>{{ scope.row.publishedBy || '—' }} · {{ shortTime(scope.row.publishedTime) }}</b>
                  </div>
                  <div class="kv">
                    <span>参数版本</span>
                    <b>
                      {{ scope.row.configRevision ? 'v' + scope.row.configRevision : '—' }}
                      <em v-if="scope.row.usingDefaultConfig" class="kv-warn">（系统默认参数）</em>
                    </b>
                  </div>
                  <div v-if="scope.row.remark" class="kv">
                    <span>财务备注</span>
                    <b>{{ scope.row.remark }}</b>
                  </div>
                </div>

                <div class="snapshot-block">
                  <span class="block-title">快照金额链路</span>
                  <div class="kv"><span>基础 + 店长 + 培训 + 复购</span>
                    <b>{{ cashFlow(scope.row) }}</b>
                  </div>
                  <div class="kv"><span>其他调整</span><b>{{ signedMoney(scope.row.adjustmentAmount) }}</b></div>
                  <div class="kv"><span>小计</span><b>¥{{ money(scope.row.subtotal) }}</b></div>
                  <div class="kv"><span>含服务费金额</span><b>¥{{ money(scope.row.gross) }}</b></div>
                  <div class="kv"><span>税前应得</span><b>¥{{ money(scope.row.preTax) }}</b></div>
                  <div class="kv"><span>个税</span><b>−¥{{ money(scope.row.tax) }}</b></div>
                  <div class="kv total"><span>应发</span><b>¥{{ money(scope.row.net) }}</b></div>
                </div>

                <div class="snapshot-block">
                  <span class="block-title">口径提醒（{{ rowWarnings(scope.row).length }}）</span>
                  <template v-if="rowWarnings(scope.row).length">
                    <p v-for="(warning, index) in rowWarnings(scope.row)" :key="index" class="warning-line">
                      {{ warning }}
                    </p>
                  </template>
                  <p v-else class="warning-line none">快照生成时无口径提醒</p>
                  <p v-if="repurchaseGap(scope.row) > 0" class="warning-line potential">
                    复购未达门槛潜力 ¥{{ money(repurchaseGap(scope.row)) }}，未计入本月应发。
                  </p>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="疗愈师" min-width="140">
          <template slot-scope="scope">
            <div class="name-cell">
              <b>{{ scope.row.massagistName || '疗愈师' + scope.row.massagistId }}</b>
              <small>{{ scope.row.shopName || '未分配门店' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="合作状态" width="96" align="center">
          <template slot-scope="scope">
            <el-tag size="mini" effect="plain">{{ scope.row.cooperationStatus || '—' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="折算时长" width="100" align="right">
          <template slot-scope="scope">{{ money(scope.row.countedMinutes, 0) }} 分</template>
        </el-table-column>
        <el-table-column label="基础薪资" width="110" align="right">
          <template slot-scope="scope">¥{{ money(scope.row.baseAmount) }}</template>
        </el-table-column>
        <el-table-column label="培训" width="96" align="right">
          <template slot-scope="scope">¥{{ money(scope.row.trainingAmount) }}</template>
        </el-table-column>
        <el-table-column label="复购" width="110" align="right">
          <template slot-scope="scope">
            ¥{{ money(scope.row.repurchaseAmount) }}
            <div v-if="numberValue(scope.row.repurchasePotential) > numberValue(scope.row.repurchaseAmount)"
                 class="cell-hint">
              潜力 ¥{{ money(scope.row.repurchasePotential) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="店长奖励" width="100" align="right">
          <template slot-scope="scope">¥{{ money(scope.row.managerAmount) }}</template>
        </el-table-column>
        <el-table-column label="调整" width="90" align="right">
          <template slot-scope="scope">{{ signedMoney(scope.row.adjustmentAmount) }}</template>
        </el-table-column>
        <el-table-column label="小计" width="110" align="right">
          <template slot-scope="scope"><b>¥{{ money(scope.row.subtotal) }}</b></template>
        </el-table-column>
        <el-table-column label="个税" width="96" align="right">
          <template slot-scope="scope">¥{{ money(scope.row.tax) }}</template>
        </el-table-column>
        <el-table-column label="应发" width="120" align="right">
          <template slot-scope="scope"><span class="net-amount">¥{{ money(scope.row.net) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="150">
          <template slot-scope="scope">
            <el-tag size="mini" :type="statusMeta(scope.row.status).type" effect="plain">
              {{ statusMeta(scope.row.status).text }}
            </el-tag>
            <div class="cell-hint">
              <template v-if="scope.row.status === 'DRAFT'">
                {{ scope.row.generatedBy || '—' }} · {{ shortTime(scope.row.generatedTime) }}
              </template>
              <template v-else-if="scope.row.status === 'CONFIRMED'">
                {{ scope.row.confirmedBy || '—' }} · {{ shortTime(scope.row.confirmedTime) }}
              </template>
              <template v-else>
                {{ scope.row.publishedBy || '—' }} · {{ shortTime(scope.row.publishedTime) }}
              </template>
            </div>
            <div v-if="scope.row.usingDefaultConfig" class="cell-hint warn">系统默认参数</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center" fixed="right">
          <template slot-scope="scope">
            <el-button type="text" size="mini" @click.stop="openDetail(scope.row)">明细</el-button>
            <el-button v-if="canManage" type="text" size="mini" @click.stop="openRemark(scope.row)">备注</el-button>
            <el-button v-if="isGlobal && scope.row.status === 'DRAFT'" type="text" size="mini"
                       @click.stop="confirmRow(scope.row)">确认</el-button>
            <el-button v-if="isGlobal && scope.row.status === 'CONFIRMED'" type="text" size="mini"
                       @click.stop="publishRow(scope.row)">发布</el-button>
            <el-button v-if="isSuperAdmin && scope.row.status === 'CONFIRMED'" type="text" size="mini"
                       @click.stop="reopenRow(scope.row)">撤销</el-button>
          </template>
        </el-table-column>
        <template slot="empty">
          <div class="table-empty">
            当前月份还没有结算单，点击右上角「生成草稿」从经营看板落快照
          </div>
        </template>
      </el-table>

      <div class="pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[20, 50, 100]"
          :page-size="size"
          :current-page="page"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"/>
      </div>
    </div>

    <board-drawer
      :visible.sync="drawerVisible"
      :board="selectedBoard"
      :config="config"
      :meta="selectedMeta"
      :loading="drawerLoading"/>

    <el-dialog title="财务备注" :visible.sync="remarkVisible" width="420px">
      <el-input v-model="remarkText" type="textarea" :rows="4" maxlength="255" show-word-limit
                placeholder="例如：本月含 3 天年假补贴，按店长确认口径发放"/>
      <span slot="footer">
        <el-button size="small" @click="remarkVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="remarkSaving" @click="saveRemark">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import {saveAs} from 'file-saver'
import incentiveApi from '@/api/incentive'
import BoardDrawer from '@/views/incentive/dashboard/BoardDrawer'
import {money, numberValue} from '@/views/incentive/format'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const GLOBAL_ROLES = ['超级管理员', '总助', '运营', '财务', 'admin']

export default {
  name: 'IncentiveSettlement',
  components: {BoardDrawer},
  data() {
    return {
      month: currentMonth(),
      shopId: null,
      status: null,
      keyword: '',
      shops: [],
      rows: [],
      total: 0,
      page: 1,
      size: 20,
      overview: {},
      config: null,
      loading: false,
      generating: false,
      exporting: false,
      requestSequence: 0,
      detailSequence: 0,
      selectedIds: [],
      drawerVisible: false,
      drawerLoading: false,
      selectedBoard: null,
      selectedMeta: null,
      remarkVisible: false,
      remarkSaving: false,
      remarkText: '',
      remarkRow: null,
      monthOptions: {
        disabledDate(date) {
          // 2026-11 之前的薪资在旧版工资系统，避免两套数字并存
          return date.getTime() > Date.now() || date.getTime() < new Date(2026, 10, 1).getTime()
        }
      }
    }
  },
  computed: {
    ...mapGetters(['roles']),
    isGlobal() {
      return (this.roles || []).some(role => GLOBAL_ROLES.indexOf(role) >= 0)
    },
    isSuperAdmin() {
      return (this.roles || []).indexOf('超级管理员') >= 0
    },
    canManage() {
      // 店长可生成本店草稿，全局面板可见导出与确认发布
      return this.isGlobal || (this.roles || []).some(role => role === '店长')
    },
    shopChips() {
      return (this.overview.shops || []).map(shop => Object.assign({key: shop.shopId || 'none'}, shop))
    }
  },
  watch: {
    // 站内消息深链带 month/shopId：页面已打开时再点另一条消息也要切过去，
    // 不能只依赖 created（tab 页签被 keep-alive 缓存，created 只跑一次）
    '$route.query.month'(value) {
      if (!/^\d{4}-\d{2}$/.test(value || '') || value === this.month) return
      this.month = value
      this.reload()
    },
    '$route.query.shopId'(value) {
      const next = value || null
      if (String(next || '') === String(this.shopId || '')) return
      this.shopId = next
      this.reload()
    }
  },
  created() {
    this.applyRouteQuery()
    this.bootstrap()
  },
  beforeDestroy() {
    this.requestSequence++
  },
  methods: {
    money,
    numberValue,
    /** 消息里的链接形如 /salary/incentive?tab=settlement&month=2026-11&shopId=3 */
    applyRouteQuery() {
      const query = (this.$route && this.$route.query) || {}
      const month = typeof query.month === 'string' ? query.month : ''
      if (/^\d{4}-\d{2}$/.test(month)) {
        this.month = month
      }
      const shopId = typeof query.shopId === 'string' ? query.shopId : ''
      if (/^\d+$/.test(shopId)) {
        this.shopId = shopId
      }
    },
    async bootstrap() {
      await this.loadShops()
      await this.loadAll()
    },
    async loadShops() {
      try {
        const res = await incentiveApi.shops()
        this.shops = res.data || []
        if (!this.shopId && this.shops.length === 1) {
          this.shopId = this.shops[0].id
        }
      } catch (e) {
        this.shops = []
      }
    },
    reload() {
      this.page = 1
      this.loadAll()
    },
    async loadAll() {
      const seq = ++this.requestSequence
      this.loading = true
      try {
        const [overview, pageData, config] = await Promise.all([
          incentiveApi.settlementOverview(this.query()),
          incentiveApi.settlementPage(this.query()),
          incentiveApi.config({month: this.month}).catch(() => null)
        ])
        if (seq !== this.requestSequence) return
        this.overview = overview.data || {}
        this.rows = (pageData.data && pageData.data.list) || []
        this.total = (pageData.data && pageData.data.total) || 0
        this.config = config && config.data ? config.data : null
        this.selectedIds = []
      } catch (e) {
        if (seq === this.requestSequence) {
          this.rows = []
          this.total = 0
        }
      } finally {
        if (seq === this.requestSequence) {
          this.loading = false
        }
      }
    },
    query() {
      return {
        month: this.month,
        shopId: this.shopId || undefined,
        status: this.status || undefined,
        keyword: this.keyword || undefined,
        page: this.page,
        size: this.size
      }
    },
    handleSizeChange(value) {
      this.size = value
      this.page = 1
      this.loadAll()
    },
    handlePageChange(value) {
      this.page = value
      this.loadAll()
    },
    handleSelection(selection) {
      this.selectedIds = selection.map(row => row.id)
    },
    async generate() {
      const scopeText = this.shopId
        ? (this.shopLabel(this.shopId) + ' ')
        : (this.isGlobal ? '全部门店 ' : '')
      try {
        await this.$confirm(
          `将按 ${this.month} 经营看板口径为${scopeText}生成结算草稿，已确认/已发布的记录不会被覆盖。`,
          '生成结算草稿', {type: 'warning'}
        )
      } catch (e) {
        return
      }
      this.generating = true
      try {
        const res = await incentiveApi.generateSettlement({month: this.month, shopId: this.shopId || undefined})
        const data = res.data || {}
        let message = `新增 ${data.generated || 0} 人，刷新 ${data.refreshed || 0} 人`
        if (data.skippedFrozen) {
          message += `，跳过已冻结 ${data.skippedFrozen} 人`
        }
        if (data.skippedEmpty) {
          message += `，跳过无数据 ${data.skippedEmpty} 人`
        }
        this.$message.success(message)
        await this.loadAll()
      } finally {
        this.generating = false
      }
    },
    shopLabel(shopId) {
      const shop = this.shops.find(item => Number(item.id) === Number(shopId))
      return shop ? shop.name : ''
    },
    async batchConfirm() {
      if (!this.selectedIds.length) return
      try {
        await this.$confirm(`确认后 ${this.selectedIds.length} 张结算单金额将冻结，不再随规则变化。`, '确认结算单',
          {type: 'warning'})
      } catch (e) {
        return
      }
      const res = await incentiveApi.confirmSettlement({ids: this.selectedIds})
      this.$message.success(`已确认 ${(res.data && res.data.confirmed) || 0} 张，合计 ¥${this.money(res.data && res.data.totalNet)}`)
      await this.loadAll()
    },
    async batchPublish() {
      if (!this.selectedIds.length) return
      try {
        await this.$confirm(`发布后疗愈师会收到站内消息，并可在「我的接单奖励」查看金额。`, '发布结算单',
          {type: 'warning'})
      } catch (e) {
        return
      }
      const res = await incentiveApi.publishSettlement({ids: this.selectedIds})
      this.$message.success(`已发布 ${(res.data && res.data.published) || 0} 张`)
      await this.loadAll()
    },
    async confirmRow(row) {
      try {
        await this.$confirm(`确认 ${row.massagistName} 的 ${row.monthCode} 结算单？确认后金额冻结。`, '确认结算单',
          {type: 'warning'})
      } catch (e) {
        return
      }
      await incentiveApi.confirmSettlement({ids: [row.id]})
      this.$message.success('已确认')
      await this.loadAll()
    },
    async publishRow(row) {
      try {
        await this.$confirm(`发布后 ${row.massagistName} 将收到通知并可查看金额。`, '发布结算单',
          {type: 'warning'})
      } catch (e) {
        return
      }
      await incentiveApi.publishSettlement({ids: [row.id]})
      this.$message.success('已发布')
      await this.loadAll()
    },
    async reopenRow(row) {
      try {
        await this.$confirm('撤销后结算单回到草稿状态，可重新生成覆盖。仅用于口径错误需要更正。', '撤销确认',
          {type: 'warning'})
      } catch (e) {
        return
      }
      await incentiveApi.reopenSettlement(row.id)
      this.$message.success('已撤销')
      await this.loadAll()
    },
    async openDetail(row) {
      this.drawerVisible = true
      this.drawerLoading = true
      this.selectedBoard = null
      const seq = ++this.detailSequence
      try {
        const res = await incentiveApi.settlementDetail(row.id)
        if (seq !== this.detailSequence) return
        const data = res.data || {}
        this.selectedBoard = data.board
        this.selectedMeta = this.buildMeta(data.settlement || row)
      } finally {
        if (seq === this.detailSequence) {
          this.drawerLoading = false
        }
      }
    },
    buildMeta(settlement) {
      return {
        snapshot: true,
        statusLabel: this.statusMeta(settlement.status).text,
        generatedBy: settlement.generatedBy,
        generatedTime: settlement.generatedTime,
        confirmedBy: settlement.confirmedBy,
        confirmedTime: settlement.confirmedTime,
        publishedBy: settlement.publishedBy,
        publishedTime: settlement.publishedTime,
        configRevision: settlement.configRevision,
        usingDefaultConfig: settlement.usingDefaultConfig,
        remark: settlement.remark,
        frozen: settlement.status !== 'DRAFT'
      }
    },
    openRemark(row) {
      this.remarkRow = row
      this.remarkText = row.remark || ''
      this.remarkVisible = true
    },
    async saveRemark() {
      if (!this.remarkRow) return
      this.remarkSaving = true
      try {
        await incentiveApi.settlementRemark(this.remarkRow.id, {remark: this.remarkText})
        this.$message.success('备注已保存')
        this.remarkVisible = false
        await this.loadAll()
      } finally {
        this.remarkSaving = false
      }
    },
    async exportCsv() {
      this.exporting = true
      try {
        const blob = await incentiveApi.exportSettlement({
          month: this.month,
          shopId: this.shopId || undefined,
          status: this.status || undefined
        })
        saveAs(blob, `月度结算单-${this.month}.csv`)
      } finally {
        this.exporting = false
      }
    },
    statusMeta(status) {
      if (status === 'CONFIRMED') return {text: '已确认', type: 'warning'}
      if (status === 'PUBLISHED') return {text: '已发布', type: 'success'}
      return {text: '草稿', type: 'info'}
    },
    signedMoney(value) {
      const num = numberValue(value)
      if (num === 0) return '—'
      return (num > 0 ? '+' : '-') + '¥' + this.money(Math.abs(num))
    },
    shortTime(value) {
      if (!value) return '—'
      return String(value).replace('T', ' ').slice(0, 16)
    },
    /** 行内 warnings 是生成时落库的 JSON 字符串，解析失败时按无提醒处理。 */
    rowWarnings(row) {
      if (!row || !row.warnings) return []
      try {
        const parsed = JSON.parse(row.warnings)
        return Array.isArray(parsed) ? parsed.filter(item => item) : []
      } catch (e) {
        return []
      }
    },
    cashFlow(row) {
      const total = numberValue(row.baseAmount) + numberValue(row.managerAmount)
        + numberValue(row.trainingAmount) + numberValue(row.repurchaseAmount)
      return '¥' + this.money(total)
    },
    repurchaseGap(row) {
      return Math.max(numberValue(row.repurchasePotential) - numberValue(row.repurchaseAmount), 0)
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.settlement-page ::v-deep .el-table .cell {
  line-height: 1.5;
}

.filter-note {
  font-size: 12px;
  color: #8C8797;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.kpi-card {
  background: #fff;
  border: 1px solid #EFEBF3;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  small {
    font-size: 12px;
    color: #79747E;
  }

  strong {
    font-size: 22px;
    font-weight: 600;
    color: #2B2930;
  }

  span {
    font-size: 11px;
    color: #9A94A3;
  }

  &.primary {
    background: linear-gradient(135deg, #4A3B63 0%, #6750A4 100%);
    border-color: transparent;

    small, span {
      color: rgba(255, 255, 255, 0.82);
    }

    strong {
      color: #fff;
    }
  }
}

.shop-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;

  .chips-label {
    font-size: 12px;
    color: #79747E;
  }

  .shop-chip {
    background: #F4F0FA;
    border: 1px solid #E3DCEC;
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 12px;
    color: #4A3B63;

    b {
      margin-left: 6px;
      font-weight: 600;
    }

    em {
      margin-left: 4px;
      font-style: normal;
      color: #9A94A3;
    }
  }
}

.table-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  border: 1px solid #EFEBF3;
}

.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;

  .toolbar-note {
    margin-left: 10px;
    font-size: 12px;
    color: #B07A17;

    i {
      margin-right: 4px;
    }
  }

  .status-legend {
    font-size: 12px;
    color: #79747E;

    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin: 0 4px 0 10px;

      &.draft {
        background: #C4BED0;
      }

      &.confirmed {
        background: #E6A23C;
      }

      &.published {
        background: #6750A4;
      }
    }
  }
}

.name-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;

  b {
    font-size: 13px;
    color: #2B2930;
  }

  small {
    font-size: 11px;
    color: #9A94A3;
  }
}

.cell-hint {
  font-size: 10px;
  color: #9A94A3;
  line-height: 1.5;

  &.warn {
    color: #B07A17;
  }
}

.net-amount {
  font-weight: 600;
  color: #4A3B63;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.table-empty {
  padding: 30px 0;
  color: #9A94A3;
  font-size: 13px;
}

/* 展开行：结算单快照 */
.snapshot-panel {
  background: #FAF7FD;
  border-radius: 8px;
  padding: 12px 16px;

  .snapshot-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;

    b {
      font-size: 13px;
      color: #4A3B63;
    }

    small {
      display: block;
      margin-top: 2px;
      font-size: 11px;
      color: #9A94A3;
      line-height: 1.6;
    }
  }

  .snapshot-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .snapshot-block {
    background: #fff;
    border: 1px solid #EFEBF3;
    border-radius: 8px;
    padding: 10px 12px;
    min-width: 0;

    .block-title {
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #6750A4;
    }

    .kv {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      line-height: 1.8;

      span {
        color: #79747E;
        flex-shrink: 0;
      }

      b {
        font-weight: 500;
        color: #2B2930;
        text-align: right;
        word-break: break-all;
      }

      .kv-warn {
        font-style: normal;
        font-size: 11px;
        color: #B07A17;
      }

      &.total b {
        font-weight: 600;
        color: #4A3B63;
      }
    }

    .warning-line {
      margin: 0 0 4px;
      font-size: 11px;
      line-height: 1.6;
      color: #B07A17;

      &.none {
        color: #9A94A3;
      }

      &.potential {
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px dashed #EFEBF3;
      }
    }
  }
}

@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .snapshot-panel .snapshot-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>