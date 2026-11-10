<template>
  <el-drawer
    :visible.sync="innerVisible"
    :size="'560px'"
    :title="title"
    :wrapper-closable="!busy"
    @open="load">
    <div v-loading="loading" class="assessment-drawer">
      <div v-if="detail" class="ad-meta">
        <div class="ad-person">
          <b>{{ detail.massagistName }}</b>
          <span>{{ detail.shopName || '未分配门店' }}</span>
        </div>
        <el-tag size="small" :type="detail.certId ? 'success' : 'info'">
          {{ detail.certId ? '已认证' : '待认证' }}
        </el-tag>
      </div>

      <div v-if="detail && detail.certId" class="ad-cert">
        <div>
          <small>通过日期</small>
          <b>{{ detail.passedAt || '-' }}</b>
        </div>
        <div>
          <small>认证来源</small>
          <b>{{ sourceLabel(detail.certSource) }}</b>
        </div>
        <div>
          <small>认证时间</small>
          <b>{{ formatTime(detail.certifiedAt) }}</b>
        </div>
        <div>
          <small>认证票数</small>
          <b>{{ detail.teamSize || 0 }} 位内训师</b>
        </div>
        <el-button
          v-if="superAdmin"
          type="danger"
          plain
          size="mini"
          :loading="busy"
          @click="revoke">撤销认证</el-button>
      </div>

      <div class="ad-section-title">
        <h4>考核记录</h4>
        <span>按考核日期倒序，作废票不计入三人认证</span>
      </div>

      <el-timeline v-if="detail && detail.votes && detail.votes.length" class="ad-timeline">
        <el-timeline-item
          v-for="vote in detail.votes"
          :key="vote.id"
          :timestamp="vote.assessDate + (vote.voided ? ' · 已作废' : '')"
          :color="vote.voided ? '#C9C4D0' : (vote.result === 1 ? '#4C9A6A' : '#C05B4D')">
          <div class="ad-vote">
            <div class="ad-vote-head">
              <b>{{ vote.trainerName || '未知内训师' }}</b>
              <el-tag
                size="mini"
                :type="vote.voided ? 'info' : (vote.result === 1 ? 'success' : 'danger')">
                {{ vote.voided ? '已作废' : (vote.result === 1 ? '通过' : '不通过') }}
              </el-tag>
            </div>
            <small>
              {{ vote.trainerShopName || '未知门店' }} · 提交 {{ formatTime(vote.submittedAt) }}
            </small>
            <p v-if="vote.remark">{{ vote.remark }}</p>
            <p v-if="vote.voided" class="ad-void">作废原因：{{ vote.voidReason || '未填写' }}</p>
            <el-button
              v-if="superAdmin && !vote.voided"
              type="text"
              size="mini"
              :disabled="busy"
              @click="voidVote(vote)">作废此票</el-button>
          </div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else-if="detail" description="暂无考核记录"></el-empty>
      <p v-else-if="error" class="ad-error">{{ error }}</p>
    </div>
  </el-drawer>
</template>

<script>
import incentiveApi from '@/api/incentive'

export default {
  name: 'AssessmentDrawer',
  props: {
    visible: Boolean,
    massagistId: [Number, String],
    projectKey: String,
    superAdmin: Boolean
  },
  data() {
    return {
      loading: false,
      busy: false,
      detail: null,
      error: ''
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
    title() {
      return this.detail ? this.detail.projectName + ' · 考核明细' : '考核明细'
    }
  },
  watch: {
    massagistId() {
      this.detail = null
      this.error = ''
    },
    projectKey() {
      this.detail = null
      this.error = ''
    }
  },
  methods: {
    async load() {
      if (!this.massagistId || !this.projectKey) return
      const targetId = this.massagistId
      const targetKey = this.projectKey
      this.loading = true
      this.error = ''
      try {
        const res = await incentiveApi.assessmentDetail({
          massagistId: targetId,
          projectKey: targetKey
        })
        if (targetId !== this.massagistId || targetKey !== this.projectKey) return
        this.detail = res.data || null
      } catch (e) {
        if (targetId !== this.massagistId || targetKey !== this.projectKey) return
        this.detail = null
        this.error = '考核明细暂时无法读取，请稍后重试。'
      } finally {
        this.loading = false
      }
    },
    async revoke() {
      if (this.busy || !this.detail || !this.detail.certId) return
      const reason = await this.promptReason('撤销认证后，该项目所有考核记录将作废，奖励会按未认证重算。')
      if (!reason) return
      this.busy = true
      try {
        await incentiveApi.revokeCert(this.detail.certId, {reason})
        this.notify('认证已撤销')
        this.$emit('changed')
        this.innerVisible = false
      } finally {
        this.busy = false
      }
    },
    async voidVote(vote) {
      if (this.busy || !vote) return
      const reason = await this.promptReason('作废后该票不再参与三人认证。')
      if (!reason) return
      this.busy = true
      try {
        await incentiveApi.voidAssessment(vote.id, {reason})
        this.notify('考核记录已作废')
        this.$emit('changed')
        await this.load()
      } finally {
        this.busy = false
      }
    },
    promptReason(tip) {
      return this.$prompt(tip, '请填写原因', {
        inputType: 'textarea',
        inputValidator: value => !!(value && value.trim()) || '原因不能为空',
        closeOnClickModal: false
      }).then(({value}) => value.trim()).catch(() => null)
    },
    notify(message) {
      if (this.$message) this.$message.success(message)
    },
    formatTime(value) {
      if (!value) return '-'
      return String(value).replace('T', ' ').slice(0, 16)
    },
    sourceLabel(source) {
      if (source === 'TEAM') return '三人认证'
      if (source === 'MANUAL') return '人工特批'
      return '历史登记'
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.assessment-drawer {
  min-height: 240px;
  padding: 0 22px 24px;
}

.ad-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: #FAF9FC;
  border: 1px solid #EDE8F2;
  border-radius: 9px;
}

.ad-person {
  b {
    display: block;
    font-size: 15px;
    color: #2B2930;
  }

  span {
    display: block;
    margin-top: 3px;
    font-size: 11px;
    color: #79747E;
  }
}

.ad-cert {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin-top: 12px;
  padding: 14px 16px;
  border: 1px solid #D4E9DA;
  background: #F6FBF7;
  border-radius: 9px;

  small {
    display: block;
    font-size: 10px;
    color: #79747E;
  }

  b {
    display: block;
    margin-top: 3px;
    font-size: 13px;
    color: #2B2930;
    font-weight: 500;
  }

  .el-button {
    grid-column: 1 / -1;
    justify-self: start;
  }
}

.ad-section-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 22px 0 14px;

  h4 {
    margin: 0;
    font-size: 14px;
    color: #2B2930;
  }

  span {
    font-size: 10px;
    color: #9A96A2;
  }
}

.ad-vote {
  padding-bottom: 6px;

  .ad-vote-head {
    display: flex;
    align-items: center;
    gap: 8px;

    b {
      font-size: 13px;
      color: #2B2930;
    }
  }

  small {
    display: block;
    margin-top: 4px;
    font-size: 10px;
    color: #79747E;
  }

  p {
    margin: 6px 0 0;
    font-size: 11px;
    color: #5B5660;
    line-height: 1.6;
  }

  .ad-void {
    color: #A35C4A;
  }
}

.ad-error {
  padding: 24px 0;
  text-align: center;
  font-size: 12px;
  color: #A35C4A;
}
</style>
