<template>
  <div class="app-container training-page">
    <div class="page-head">
      <div>
        <h2>培训考核与达标进度</h2>
        <p>考核记录长期有效；下方累计进度按所选月份统计，通过考核次日起算对应项目有效订单。</p>
      </div>
      <div class="head-actions">
        <el-button
          v-if="teamCertEnabled && superAdmin"
          size="small"
          type="primary"
          plain
          icon="el-icon-plus"
          @click="manualVisible = true">人工特批</el-button>
        <el-button size="small" icon="el-icon-back" @click="$router.push('/incentive/board')">返回看板</el-button>
        <el-button size="small" icon="el-icon-setting" @click="$router.push('/incentive/settings')">奖励参数</el-button>
      </div>
    </div>

    <el-tabs v-model="tab" class="training-tabs">
      <el-tab-pane label="认证矩阵" name="matrix">
    <div class="filter-bar">
      <el-date-picker
        v-model="month"
        type="month"
        value-format="yyyy-MM"
        format="yyyy 年 MM 月"
        :clearable="false"
        :picker-options="monthOptions"
        placeholder="统计月份"
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
      <el-input
        v-model.trim="keyword"
        clearable
        placeholder="搜索疗愈师姓名"
        prefix-icon="el-icon-search"
        style="width: 210px"
        maxlength="100"
        aria-label="疗愈师姓名"
        @input="scheduleSearch"/>
      <el-button icon="el-icon-refresh" @click="loadData">刷新</el-button>
      <span class="filter-note">统计截止 {{ dashboard.cutoff || '—' }}</span>
    </div>

    <div class="training-summary">
      <div>
        <small>疗愈师</small>
        <strong>{{ total }}</strong>
        <span>当前筛选范围</span>
      </div>
      <div>
        <small>当前页已登记</small>
        <strong>{{ totalCerts }}</strong>
        <span>当前页全部项目累计</span>
      </div>
      <div>
        <small>当前页本月达标</small>
        <strong>{{ monthCompleted }}</strong>
        <span>按所选月份</span>
      </div>
      <div>
        <small>当前页培训奖励</small>
        <strong>¥{{ money(trainingTotal) }}</strong>
        <span>本月计入</span>
      </div>
    </div>

    <div v-if="!isGlobal" class="readonly-tip">
      <i class="el-icon-view"></i>
      当前账号仅可查看考核记录。登记、修改和撤销考核需要运营/财务角色。
    </div>

    <div class="table-card">
      <div class="table-head">
        <h3>项目考核矩阵</h3>
        <div class="legend">
          <span><i class="dot registered"></i>已登记</span>
          <span><i class="dot completed"></i>本月达标</span>
          <span><i class="dot pending"></i>未登记</span>
        </div>
      </div>
      <el-table
        v-loading="loading"
        :data="pagedRecords"
        border
        stripe
        style="width: 100%">
        <el-table-column label="疗愈师" width="170" fixed>
          <template slot-scope="scope">
            <div class="person-cell">
              <div class="avatar">{{ (scope.row.massagistName || '·').slice(0, 1) }}</div>
              <div>
                <b>{{ scope.row.massagistName }}</b>
                <small>{{ scope.row.shopName || '未分配门店' }} · {{ scope.row.cooperationStatus }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="已登记" width="86" align="center">
          <template slot-scope="scope">
            <span class="cert-count">{{ scope.row.certifiedCount || 0 }}/{{ projects.length }}</span>
          </template>
        </el-table-column>
        <el-table-column
          v-for="project in projects"
          :key="project.projectKey"
          :label="project.projectName"
          width="158"
          align="center">
          <template slot-scope="scope">
            <div
              :class="['cert-cell', cellClass(scope.row, project)]"
              @click="openCert(scope.row, project)">
              <template v-if="certOf(scope.row, project)">
                <b v-if="certOf(scope.row, project).passedAt">{{ certOf(scope.row, project).passedAt }}</b>
                <b v-else class="unregistered">待认证</b>
                <small v-if="progressOf(scope.row, project)">
                  {{ progressOf(scope.row, project).count }}/{{ progressOf(scope.row, project).target }}
                  · {{ statusOf(scope.row, project).text }}
                </small>
                <small v-else-if="attemptOf(scope.row, project)">{{ attemptOf(scope.row, project) }}</small>
                <small v-else>{{ teamCertEnabled ? '点击查看考核' : '已登记考核' }}</small>
              </template>
              <template v-else>
                <b class="unregistered">未登记</b>
                <small>{{ teamCertEnabled ? '点击查看考核' : '点击登记考核日' }}</small>
              </template>
              <span v-if="project.enabled === 0" class="disabled-mark">已停用</span>
            </div>
          </template>
        </el-table-column>
        <template slot="empty">
          <div class="table-empty">当前筛选条件下没有疗愈师</div>
        </template>
      </el-table>
      <p class="table-footnote">
        项目绑定线上项目 ID 后按项目精确匹配；未绑定时按订单部位/项目标题与时长匹配，多人多部位订单可能存在归属歧义。
      </p>
      <div class="pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :page-sizes="[20, 50, 100]"
          :page-size="size"
          :current-page="page"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"/>
      </div>
    </div>
      </el-tab-pane>

      <el-tab-pane label="考核记录" name="records" lazy>
        <assessment-records
          v-if="teamCertEnabled"
          :shops="shops"
          :projects="projects"
          :super-admin="superAdmin"/>
        <div v-else class="flag-off-tip">
          内训考核尚未开启。开启后可在此查看内训师提交的三人考核记录、作废异常票并导出明细。
        </div>
      </el-tab-pane>

      <el-tab-pane label="考核分析" name="analytics" lazy>
        <assessment-analytics v-if="teamCertEnabled" :shops="shops"/>
        <div v-else class="flag-off-tip">
          内训考核尚未开启。开启后可在此查看提交量、通过率、反复失败名单与未认证积压。
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      :visible.sync="dialogVisible"
      width="460px"
      :title="dialogTitle"
      :before-close="closeDialog"
      :close-on-click-modal="!saving"
      :close-on-press-escape="!saving"
      @closed="resetForm">
      <div v-if="certForm.massagistName" class="dialog-meta">
        <span>{{ certForm.massagistName }}</span>
        <span>{{ certForm.projectName }}</span>
      </div>
      <el-form label-width="92px" size="small" :disabled="saving">
        <el-form-item label="考核通过日" required>
          <el-date-picker
            v-model="certForm.passedAt"
            type="date"
            value-format="yyyy-MM-dd"
            format="yyyy 年 MM 月 dd 日"
            :picker-options="dateOptions"
            placeholder="选择考核通过日期"
            style="width: 100%"/>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="certForm.remark"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="可填写考核说明、登记依据等"/>
        </el-form-item>
      </el-form>
      <div v-if="progressPreview" class="dialog-preview">
        <div>
          <small>所选月份进度</small>
          <b>{{ progressPreview.count }}/{{ progressPreview.target }}</b>
        </div>
        <div>
          <small>状态</small>
          <b>{{ statusPreview.text }}</b>
        </div>
        <p>通过考核次日起累计对应项目有效订单，达标当月计入一次培训奖励。</p>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button
          v-if="certForm.certId"
          type="danger"
          plain
          size="small"
          :disabled="saving"
          @click="deleteCert">撤销考核</el-button>
        <span class="footer-spacer"></span>
        <el-button size="small" :disabled="saving" @click="dialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="saveCert">保存</el-button>
      </span>
    </el-dialog>

    <assessment-drawer
      v-if="teamCertEnabled"
      :visible.sync="drawerVisible"
      :massagist-id="drawerRowId"
      :project-key="drawerProjectKey"
      :super-admin="superAdmin"
      @changed="loadData"/>

    <manual-cert-dialog
      v-if="teamCertEnabled && superAdmin"
      :visible.sync="manualVisible"
      :projects="projects"
      @changed="loadData"/>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import incentiveApi from '@/api/incentive'
import {money, trainingStatus} from '@/views/incentive/format'
import AssessmentDrawer from './components/AssessmentDrawer'
import AssessmentRecords from './components/AssessmentRecords'
import AssessmentAnalytics from './components/AssessmentAnalytics'
import ManualCertDialog from './components/ManualCertDialog'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default {
  name: 'IncentiveTraining',
  components: {
    AssessmentDrawer,
    AssessmentRecords,
    AssessmentAnalytics,
    ManualCertDialog
  },
  data() {
    return {
      tab: 'matrix',
      teamCertEnabled: false,
      drawerVisible: false,
      drawerRowId: null,
      drawerProjectKey: '',
      manualVisible: false,
      month: currentMonth(),
      shopId: null,
      status: 1,
      page: 1,
      size: 20,
      shops: [],
      records: [],
      total: 0,
      requestSequence: 0,
      destroyed: false,
      searchTimer: null,
      dashboard: {cutoff: null},
      config: {trainingProjects: []},
      progressMap: {},
      keyword: '',
      loading: false,
      dialogVisible: false,
      saving: false,
      certForm: {
        certId: null,
        massagistId: null,
        massagistName: '',
        projectKey: '',
        projectName: '',
        passedAt: null,
        remark: ''
      },
      dateOptions: {
        disabledDate(date) {
          return date.getTime() > Date.now()
        }
      },
      monthOptions: {
        disabledDate(date) {
          return date.getTime() > Date.now()
        }
      }
    }
  },
  computed: {
    ...mapGetters(['roles', 'userId']),
    superAdmin() {
      // 只认角色：测试库里 1 号后台账号可能绑定疗愈师，按数字 ID 放权会误开超管按钮。
      return (this.roles || []).indexOf('超级管理员') >= 0
    },
    isGlobal() {
      const globalRoles = ['超级管理员', '总助', '运营', '财务', 'admin']
      return (this.roles || []).some(role => globalRoles.indexOf(role) >= 0)
    },
    projects() {
      return (this.config && this.config.trainingProjects) || []
    },
    pagedRecords() {
      return this.records
    },
    totalCerts() {
      return this.records.reduce((sum, row) => sum + (row.certifiedCount || 0), 0)
    },
    monthCompleted() {
      return this.records.reduce((sum, row) => sum + (row.progress || [])
        .filter(project => project.status === 'completed-this-month').length, 0)
    },
    trainingTotal() {
      return this.records.reduce((sum, row) => sum + (row.progress || [])
        .reduce((amount, project) => amount + Number(project.earnedAmount || 0), 0), 0)
    },
    dialogTitle() {
      return this.certForm.certId ? '修改考核记录' : '登记考核记录'
    },
    progressPreview() {
      if (!this.certForm.massagistId || !this.certForm.projectKey) {
        return null
      }
      return this.progressMap[this.certForm.massagistId + '|' + this.certForm.projectKey] || null
    },
    statusPreview() {
      return trainingStatus(this.progressPreview)
    }
  },
  created() {
    this.bootstrap()
  },
  beforeDestroy() {
    this.destroyed = true
    this.requestSequence++
    if (this.searchTimer) clearTimeout(this.searchTimer)
  },
  methods: {
    money,
    async bootstrap() {
      await this.loadShops()
      if (!this.destroyed) await this.loadData()
    },
    async loadShops() {
      const res = await incentiveApi.shops()
      if (this.destroyed) return
      this.shops = res.data || []
      if (!this.shopId && this.shops.length === 1) {
        this.shopId = this.shops[0].id
      }
    },
    async loadData() {
      if (this.destroyed) return
      const sequence = ++this.requestSequence
      const filters = {
        month: this.month,
        shopId: this.shopId || undefined,
        status: this.status,
        page: this.page,
        size: this.size,
        keyword: (this.keyword || '').trim() || undefined
      }
      this.loading = true
      try {
        const res = await incentiveApi.trainingRecords(filters)
        if (this.destroyed || sequence !== this.requestSequence) return
        const data = res.data || {}
        const total = Number(data.total) || 0
        const maxPage = Math.max(1, Math.ceil(total / filters.size))
        if (filters.page > maxPage) {
          this.page = maxPage
          return this.loadData()
        }
        this.records = data.list || []
        this.total = total
        this.dashboard = {cutoff: data.cutoff || null, shopId: data.shopId}
        this.config = {trainingProjects: data.trainingProjects || []}
        this.teamCertEnabled = !!data.teamCertEnabled
        if (!this.shopId && data.shopId) this.shopId = data.shopId
        this.buildProgressMap()
      } finally {
        if (!this.destroyed && sequence === this.requestSequence) this.loading = false
      }
    },
    scheduleSearch() {
      if (this.searchTimer) clearTimeout(this.searchTimer)
      // 立即使旧姓名响应失效，等待输入稳定后再查，避免每个字都访问数据库。
      this.requestSequence++
      this.searchTimer = setTimeout(() => {
        this.searchTimer = null
        this.resetAndLoad()
      }, 300)
    },
    resetAndLoad() {
      if (this.searchTimer) clearTimeout(this.searchTimer)
      this.searchTimer = null
      this.page = 1
      return this.loadData()
    },
    handleSizeChange(size) {
      this.size = size
      return this.resetAndLoad()
    },
    handlePageChange(page) {
      this.page = page
      return this.loadData()
    },
    buildProgressMap() {
      const map = {}
      this.records.forEach(row => {
        (row.progress || []).forEach(project => {
          map[row.massagistId + '|' + project.projectKey] = project
        })
      })
      this.progressMap = map
    },
    progressOf(row, project) {
      return this.progressMap[row.massagistId + '|' + project.projectKey] || null
    },
    statusOf(row, project) {
      return trainingStatus(this.progressOf(row, project))
    },
    certOf(row, project) {
      return (row.certs || []).find(cert => cert.projectKey === project.projectKey) || null
    },
    attemptOf(row, project) {
      const item = this.certOf(row, project)
      return item && item.attemptCount ? `考核 ${item.attemptCount} 次` : ''
    },
    cellClass(row, project) {
      const progress = this.progressOf(row, project)
      const item = this.certOf(row, project)
      if (progress && progress.status === 'completed-this-month') {
        return 'completed'
      }
      if (item && item.certId) {
        return 'registered'
      }
      if (item && item.attemptCount > 0) {
        return 'pending has-attempt'
      }
      return 'pending'
    },
    openCert(row, project) {
      if (this.destroyed || this.saving || this.loading) return
      if (this.teamCertEnabled) {
        this.drawerRowId = row.massagistId
        this.drawerProjectKey = project.projectKey
        this.drawerVisible = true
        return
      }
      if (!this.isGlobal) {
        this.notifyWarning('当前账号仅可查看项目认证与进度')
        return
      }
      const cert = (row.certs || [])
        .find(item => item.certId && item.projectKey === project.projectKey) || null
      this.certForm = {
        certId: cert ? cert.certId : null,
        massagistId: row.massagistId,
        massagistName: row.massagistName,
        projectKey: project.projectKey,
        projectName: project.projectName,
        passedAt: cert ? cert.passedAt : null,
        remark: cert ? (cert.remark || '') : ''
      }
      this.dialogVisible = true
    },
    async saveCert() {
      if (this.destroyed || this.saving) return
      if (!this.isGlobal) {
        this.notifyWarning('当前账号没有维护考核记录的权限')
        return
      }
      if (!this.certForm.passedAt) {
        this.notifyWarning('请选择考核通过日期')
        return
      }
      this.saving = true
      try {
        await incentiveApi.saveTrainingRecord({
          massagistId: this.certForm.massagistId,
          projectKey: this.certForm.projectKey,
          passedAt: this.certForm.passedAt,
          remark: this.certForm.remark
        })
        if (this.destroyed) return
        this.dialogVisible = false
        this.notifySuccess('考核记录已保存')
        await this.loadData()
      } finally {
        this.saving = false
      }
    },
    async deleteCert() {
      if (this.destroyed || this.saving || !this.certForm.certId) return
      if (!this.isGlobal) {
        this.notifyWarning('当前账号没有撤销考核记录的权限')
        return
      }
      const form = {...this.certForm}
      this.saving = true
      try {
        await this.notifyConfirm(
          `确定撤销「${form.massagistName} · ${form.projectName}」的考核记录吗？撤销后该项目将停止累计。`,
          '撤销考核'
        )
        if (this.destroyed) return
        await incentiveApi.deleteTrainingRecord(form.certId)
        if (this.destroyed) return
        this.dialogVisible = false
        this.notifySuccess('考核记录已撤销')
        await this.loadData()
      } finally {
        this.saving = false
      }
    },
    closeDialog(done) {
      if (!this.saving) done()
    },
    resetForm() {
      this.certForm = {
        certId: null,
        massagistId: null,
        massagistName: '',
        projectKey: '',
        projectName: '',
        passedAt: null,
        remark: ''
      }
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.training-page {
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
    max-width: 720px;
    line-height: 1.7;
  }
}

.head-actions {
  display: flex;
  gap: 8px;
}

.training-tabs {
  ::v-deep .el-tabs__header {
    background: #fff;
    border-radius: 10px;
    padding: 0 18px;
    margin-bottom: 14px;
  }

  ::v-deep .el-tabs__nav-wrap::after {
    height: 1px;
    background: #EDE8F2;
  }

  ::v-deep .el-tabs__item {
    height: 46px;
    line-height: 46px;
    font-size: 13px;
    color: #79747E;
  }

  ::v-deep .el-tabs__item.is-active {
    color: #6750A4;
  }

  ::v-deep .el-tabs__active-bar {
    background: #6750A4;
  }
}

.flag-off-tip {
  padding: 28px 22px;
  background: #fff;
  border: 1px dashed #DED4EE;
  border-radius: 10px;
  font-size: 12px;
  color: #79747E;
  line-height: 1.8;
}

.filter-bar {
  background: #fff;
  border-radius: 10px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.filter-note {
  margin-left: auto;
  font-size: 11px;
  color: #79747E;
}

.training-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;

  > div {
    background: #fff;
    border: 1px solid #E7E4EC;
    border-radius: 10px;
    padding: 16px 18px;
  }

  small {
    display: block;
    font-size: 11px;
    color: #79747E;
  }

  strong {
    display: block;
    margin: 6px 0 4px;
    font-size: 24px;
    color: #2B2930;
    font-weight: 600;
  }

  span {
    font-size: 10px;
    color: #9A96A2;
  }
}

.readonly-tip {
  background: #F4F0FA;
  border: 1px solid #DED4EE;
  border-radius: 9px;
  padding: 10px 16px;
  font-size: 12px;
  color: #5B4A73;
  margin-bottom: 14px;

  i {
    margin-right: 6px;
  }
}

.table-card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #E7E4EC;
  padding: 18px;
}

.table-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-size: 15px;
    color: #2B2930;
  }
}

.legend {
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: #79747E;

  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 5px;

    &.registered {
      background: #B9A9D6;
    }

    &.completed {
      background: #4C9A6A;
    }

    &.pending {
      background: #D9D4E0;
    }
  }
}

.person-cell {
  display: flex;
  align-items: center;
  gap: 9px;

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #F1EDF8;
    color: #6750A4;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  b {
    display: block;
    font-size: 12px;
    color: #2B2930;
  }

  small {
    display: block;
    margin-top: 2px;
    font-size: 10px;
    color: #79747E;
  }
}

.cert-count {
  font-size: 12px;
  color: #6750A4;
  font-weight: 600;
}

.cert-cell {
  position: relative;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 6px 4px;
  cursor: pointer;
  transition: all 0.16s ease;

  &:hover {
    background: #F7F4FC;
    border-color: #DED4EE;
  }

  b {
    display: block;
    font-size: 11px;
    color: #2B2930;
    font-weight: 500;
    white-space: nowrap;
  }

  small {
    display: block;
    margin-top: 2px;
    font-size: 10px;
    color: #79747E;
    white-space: nowrap;
  }

  .unregistered {
    color: #9A96A2;
    font-weight: 400;
  }

  &.registered {
    background: #F7F4FC;
    border-color: #EDE8F5;

    b {
      color: #5B4A73;
    }
  }

  &.completed {
    background: #F1F8F3;
    border-color: #D4E9DA;

    b, small {
      color: #3D7B55;
    }
  }

  &.has-attempt {
    background: #FBF8F1;
    border-color: #EFE3CD;

    b {
      color: #8A6B3A;
    }
  }

  .disabled-mark {
    position: absolute;
    top: 2px;
    right: 4px;
    font-size: 9px;
    color: #B0AAB8;
  }
}

.table-footnote {
  margin: 12px 0 0;
  font-size: 11px;
  color: #79747E;
  line-height: 1.7;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.table-empty {
  padding: 36px 0;
  color: #9A96A2;
  font-size: 12px;
}

.dialog-meta {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  font-size: 12px;
  color: #5B4A73;

  span {
    background: #F4F0FA;
    border-radius: 5px;
    padding: 4px 9px;
  }
}

.dialog-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  background: #FAF9FC;
  border: 1px solid #EDE8F2;
  border-radius: 9px;
  padding: 12px 14px;

  small {
    display: block;
    font-size: 10px;
    color: #79747E;
  }

  b {
    display: block;
    margin-top: 3px;
    font-size: 15px;
    color: #2B2930;
  }

  p {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 10px;
    color: #79747E;
    line-height: 1.7;
  }
}

.dialog-footer {
  display: flex;
  align-items: center;
  width: 100%;

  .footer-spacer {
    flex: 1;
  }
}

@media (max-width: 1200px) {
  .training-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
