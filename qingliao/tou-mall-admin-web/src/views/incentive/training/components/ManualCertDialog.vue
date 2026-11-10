<template>
  <el-dialog
    :visible.sync="innerVisible"
    title="人工特批认证"
    width="480px"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :before-close="close"
    @closed="reset">
    <p class="mc-tip">
      人工特批会直接生成认证台账，不经过三人考核。请填写原因，操作会写入激励日志。
    </p>
    <el-form label-width="88px" size="small" :disabled="saving">
      <el-form-item label="疗愈师" required>
        <el-select
          v-model="form.massagistId"
          filterable
          remote
          clearable
          :remote-method="searchTherapist"
          :loading="optionsLoading"
          placeholder="输入姓名搜索"
          style="width: 100%">
          <el-option
            v-for="item in therapists"
            :key="item.id"
            :label="optionLabel(item)"
            :value="item.id"/>
        </el-select>
      </el-form-item>
      <el-form-item label="培训项目" required>
        <el-select v-model="form.projectKey" placeholder="选择项目" style="width: 100%">
          <el-option
            v-for="project in enabledProjects"
            :key="project.projectKey"
            :label="project.projectName"
            :value="project.projectKey"/>
        </el-select>
      </el-form-item>
      <el-form-item label="通过日期" required>
        <el-date-picker
          v-model="form.passedAt"
          type="date"
          value-format="yyyy-MM-dd"
          format="yyyy 年 MM 月 dd 日"
          :picker-options="dateOptions"
          placeholder="选择通过日期"
          style="width: 100%"/>
      </el-form-item>
      <el-form-item label="特批原因" required>
        <el-input
          v-model="form.reason"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="例如：外聘老师已完成线下考核，附考核记录编号"/>
      </el-form-item>
    </el-form>
    <span slot="footer">
      <el-button size="small" :disabled="saving" @click="innerVisible = false">取消</el-button>
      <el-button size="small" type="primary" :loading="saving" @click="submit">确认特批</el-button>
    </span>
  </el-dialog>
</template>

<script>
import incentiveApi from '@/api/incentive'

export default {
  name: 'ManualCertDialog',
  props: {
    visible: Boolean,
    projects: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      saving: false,
      optionsLoading: false,
      therapists: [],
      form: {
        massagistId: null,
        projectKey: '',
        passedAt: null,
        reason: ''
      },
      dateOptions: {
        disabledDate(date) {
          return date.getTime() > Date.now()
        }
      }
    }
  },
  computed: {
    innerVisible: {
      get() {
        return this.visible
      },
      set(value) {
        this.$emit('update:visible', value)
      }
    },
    enabledProjects() {
      return (this.projects || []).filter(project => project.enabled !== 0)
    }
  },
  watch: {
    visible(value) {
      if (value && !this.therapists.length) {
        this.searchTherapist('')
      }
    }
  },
  methods: {
    async searchTherapist(keyword) {
      this.optionsLoading = true
      try {
        const res = await incentiveApi.massagists({})
        const name = (keyword || '').trim()
        this.therapists = (res.data || []).filter(item => !name || (item.name || '').indexOf(name) >= 0)
      } finally {
        this.optionsLoading = false
      }
    },
    optionLabel(item) {
      return `${item.name || '未命名'} · ${item.shopName || '未分配门店'}`
    },
    close(done) {
      if (!this.saving) done()
    },
    reset() {
      this.form = {
        massagistId: null,
        projectKey: '',
        passedAt: null,
        reason: ''
      }
    },
    async submit() {
      if (this.saving) return
      if (!this.form.massagistId || !this.form.projectKey || !this.form.passedAt) {
        this.warn('请选择疗愈师、项目和通过日期')
        return
      }
      const reason = (this.form.reason || '').trim()
      if (!reason) {
        this.warn('请填写特批原因')
        return
      }
      this.saving = true
      try {
        await incentiveApi.manualCert({
          massagistId: this.form.massagistId,
          projectKey: this.form.projectKey,
          passedAt: this.form.passedAt,
          reason
        })
        this.success('人工特批已生效')
        this.$emit('changed')
        this.innerVisible = false
      } finally {
        this.saving = false
      }
    },
    warn(message) {
      if (this.$message) this.$message.warning(message)
    },
    success(message) {
      if (this.$message) this.$message.success(message)
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.mc-tip {
  margin: 0 0 16px;
  padding: 10px 12px;
  background: #FBF6EC;
  border: 1px solid #EFE1C6;
  border-radius: 8px;
  font-size: 11px;
  color: #7A6136;
  line-height: 1.7;
}
</style>
