<template>
  <div class="ar-page">
    <div class="ar-filter">
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
        style="width: 180px"
        @change="onShopChange">
        <el-option v-for="shop in shops" :key="shop.id" :label="shop.name" :value="shop.id"/>
      </el-select>
      <el-select
        v-model="projectKey"
        clearable
        placeholder="全部项目"
        style="width: 170px"
        @change="resetAndLoad">
        <el-option
          v-for="project in projects"
          :key="project.projectKey"
          :label="project.projectName"
          :value="project.projectKey"/>
      </el-select>
      <el-select
        v-model="result"
        style="width: 130px"
        @change="resetAndLoad">
        <el-option label="全部结果" value=""/>
        <el-option label="通过" :value="1"/>
        <el-option label="不通过" :value="0"/>
      </el-select>
      <el-select
        v-model="voided"
        style="width: 130px"
        @change="resetAndLoad">
        <el-option label="有效考核" :value="0"/>
        <el-option label="已作废" :value="1"/>
      </el-select>
      <el-select
        v-model="trainerId"
        clearable
        filterable
        placeholder="全部内训师"
        style="width: 170px"
        @change="resetAndLoad">
        <el-option
          v-for="trainer in trainerChoices"
          :key="trainer.id"
          :label="trainerLabel(trainer)"
          :value="trainer.id"/>
      </el-select>
      <el-select
        v-model="massagistId"
        clearable
        filterable
        placeholder="全部疗愈师"
        style="width: 170px"
        @change="resetAndLoad">
        <el-option
          v-for="item in therapistChoices"
          :key="item.id"
          :label="item.name"
          :value="item.id"/>
      </el-select>
      <el-button icon="el-icon-refresh" @click="resetAndLoad">刷新</el-button>
      <div class="ar-export">
        <el-button size="small" icon="el-icon-download" :loading="exporting" @click="doExport('record')">
          导出明细
        </el-button>
        <el-button size="small" icon="el-icon-document" :loading="exporting" @click="doExport('cert')">
          导出认证台账
        </el-button>
      </div>
    </div>

    <div class="ar-card">
      <el-table
        v-loading="loading"
        :data="rows"
        :row-class-name="rowClass"
        border
        stripe
        style="width: 100%">
        <el-table-column prop="assessDate" label="考核日期" width="110" fixed/>
        <el-table-column prop="shopName" label="门店" min-width="120" show-overflow-tooltip/>
        <el-table-column prop="massagistName" label="疗愈师" width="110"/>
        <el-table-column prop="projectName" label="项目" min-width="130" show-overflow-tooltip/>
        <el-table-column label="结果" width="90" align="center">
          <template slot-scope="scope">
            <el-tag
              size="mini"
              :type="scope.row.voided ? 'info' : (scope.row.result === 1 ? 'success' : 'danger')">
              {{ scope.row.result === 1 ? '通过' : '不通过' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="trainerName" label="内训师" width="110"/>
        <el-table-column prop="trainerShopName" label="内训师门店" min-width="120" show-overflow-tooltip/>
        <el-table-column label="提交时间" width="150">
          <template slot-scope="scope">{{ formatTime(scope.row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip/>
        <el-table-column label="状态" width="90" align="center">
          <template slot-scope="scope">
            <span v-if="scope.row.voided" class="ar-void">已作废</span>
            <span v-else class="ar-valid">有效</span>
          </template>
        </el-table-column>
        <el-table-column v-if="superAdmin" label="操作" width="90" align="center" fixed="right">
          <template slot-scope="scope">
            <el-button
              v-if="!scope.row.voided"
              type="text"
              size="mini"
              @click="doVoid(scope.row)">作废</el-button>
            <span v-else class="ar-muted">—</span>
          </template>
        </el-table-column>
        <template slot="empty">
          <div class="ar-empty">当前筛选条件下没有考核记录</div>
        </template>
      </el-table>
      <div class="ar-pager">
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

    <p class="ar-footnote">
      作废票不参与三人认证；认证后再次提交的失败记录不会撤销既有认证。
    </p>
  </div>
</template>

<script>
import {saveAs} from 'file-saver'
import incentiveApi from '@/api/incentive'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default {
  name: 'AssessmentRecords',
  props: {
    shops: {
      type: Array,
      default: () => []
    },
    projects: {
      type: Array,
      default: () => []
    },
    superAdmin: Boolean
  },
  data() {
    return {
      month: currentMonth(),
      shopId: null,
      projectKey: '',
      result: '',
      voided: 0,
      trainerId: null,
      massagistId: null,
      page: 1,
      size: 20,
      rows: [],
      total: 0,
      loading: false,
      exporting: false,
      requestId: 0,
      destroyed: false,
      trainerList: [],
      therapistList: [],
      monthOptions: {
        disabledDate(date) {
          return date.getTime() > Date.now()
        }
      }
    }
  },
  computed: {
    trainerChoices() {
      if (!this.shopId) return this.trainerList
      return this.trainerList.filter(item => item.shopId === this.shopId)
    },
    therapistChoices() {
      return this.therapistList
    }
  },
  created() {
    this.loadOptions()
    this.load(1)
  },
  beforeDestroy() {
    this.destroyed = true
    this.requestId++
  },
  methods: {
    async loadOptions() {
      const shopId = this.shopId || undefined
      try {
        const [trainers, therapists] = await Promise.all([
          incentiveApi.assessmentTrainers(),
          incentiveApi.massagists({shopId})
        ])
        if (this.destroyed) return
        this.trainerList = trainers.data || []
        this.therapistList = therapists.data || []
      } catch (e) {
        if (this.destroyed) return
        this.trainerList = []
        this.therapistList = []
      }
    },
    onShopChange() {
      this.trainerId = null
      this.massagistId = null
      this.loadOptions()
      return this.resetAndLoad()
    },
    filterParams() {
      const params = {month: this.month}
      if (this.shopId) params.shopId = this.shopId
      if (this.projectKey) params.projectKey = this.projectKey
      if (this.trainerId) params.trainerId = this.trainerId
      if (this.massagistId) params.massagistId = this.massagistId
      if (this.result !== '' && this.result !== null) params.result = this.result
      if (this.voided !== '' && this.voided !== null) params.voided = this.voided
      return params
    },
    async load(page = 1) {
      if (this.destroyed) return
      const requestId = ++this.requestId
      const targetPage = page < 1 ? 1 : page
      this.loading = true
      try {
        const res = await incentiveApi.assessmentRecords({
          ...this.filterParams(),
          page: targetPage,
          size: this.size
        })
        if (this.destroyed || requestId !== this.requestId) return
        const data = res.data || {}
        this.rows = data.list || []
        this.total = Number(data.total) || 0
        this.page = targetPage
        const maxPage = Math.max(1, Math.ceil(this.total / this.size))
        if (targetPage > maxPage) {
          return this.load(maxPage)
        }
      } finally {
        if (!this.destroyed && requestId === this.requestId) this.loading = false
      }
    },
    resetAndLoad() {
      return this.load(1)
    },
    handleSizeChange(size) {
      this.size = size
      return this.load(1)
    },
    handlePageChange(page) {
      return this.load(page)
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
          : await incentiveApi.exportAssessments(this.filterParams())
        const filename = kind === 'cert'
          ? `培训认证台账-${this.month}.csv`
          : `内训考核明细-${this.month}.csv`
        saveAs(new Blob([res.data], {type: 'text/csv;charset=utf-8'}), filename)
      } finally {
        this.exporting = false
      }
    },
    async doVoid(row) {
      if (!this.superAdmin || !row || row.voided) return
      const reason = await this.promptReason('作废后该票不参与三人认证，已有认证不会被撤销。')
      if (!reason) return
      await incentiveApi.voidAssessment(row.id, {reason})
      if (this.$message) this.$message.success('考核记录已作废')
      await this.load(this.page)
    },
    promptReason(tip) {
      return this.$prompt(tip, '请填写原因', {
        inputType: 'textarea',
        inputValidator: value => !!(value && value.trim()) || '原因不能为空',
        closeOnClickModal: false
      }).then(({value}) => value.trim()).catch(() => null)
    },
    rowClass({row}) {
      return row && row.voided ? 'ar-row-void' : ''
    },
    formatTime(value) {
      if (!value) return '-'
      return String(value).replace('T', ' ').slice(0, 16)
    },
    trainerLabel(trainer) {
      return trainer.shopName ? `${trainer.name} · ${trainer.shopName}` : trainer.name
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.ar-page {
  padding-top: 14px;
}

.ar-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: #fff;
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 14px;

  .ar-export {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
}

.ar-card {
  background: #fff;
  border: 1px solid #E7E4EC;
  border-radius: 10px;
  padding: 18px;

  ::v-deep .ar-row-void {
    color: #A39DA9;

    td {
      background: #FBFAFC !important;
    }
  }
}

.ar-valid {
  font-size: 11px;
  color: #3D7B55;
}

.ar-void {
  font-size: 11px;
  color: #A35C4A;
}

.ar-muted {
  color: #C9C4D0;
}

.ar-empty {
  padding: 36px 0;
  color: #9A96A2;
  font-size: 12px;
}

.ar-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.ar-footnote {
  margin: 12px 0 0;
  font-size: 11px;
  color: #79747E;
  line-height: 1.7;
}
</style>
