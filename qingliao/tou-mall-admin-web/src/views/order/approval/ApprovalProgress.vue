<template>
  <div class="ApprovalProgress">
    <el-drawer :show-close="true" :visible.sync="showDrawer"  append-to-body size="min(980px, 100vw)"
               :title="drawerTitle"
               :before-close="close">
      <div v-loading="loading" class="approval-content">
        <el-card style="padding: 0 24px;">
          <div v-for="(item, index) in approvalUsers" :key="index" style="margin-bottom: 16px">
            <div class="flex align-center">
              <div class="flex align-center flex1">
                <i class="state-icon" :class="[item.colorClass,item.icon]"/>
                <div class="flex align-center" style="margin-left: 20px">
                  <div class="flex align-center">
                    <el-avatar style="background-color: #1e6abc"> {{ item.content }}</el-avatar>
                    <div style="margin-left: 10px">
                      <el-tag v-if="item.nodeName" size="mini" type="info" class="node-tag">{{ item.nodeName }}</el-tag>
                      {{ item.content }}
                    </div>
                  </div>

                  <div :class="item.colorClass" style="margin-left: 20px">{{ item.stateTxt }}</div>
                </div>
              </div>
              <div class="c-info c-f14">
                <span v-show="item.state== constant.approvalStateMap.passed">{{ item.timestamp }}</span>
                {{ item.takingTimeStr }}
                <span
                  v-if="!viewOnly && item.state == constant.approvalStateMap.approving && item.targetUserId == userId && item.flowUserType==constant.flowUserTypeMap.approval"
                  class="m-left20">
                <el-button icon="el-icon-check" plain round size="mini" type="success"
                           @click="pass(item,index)">同意</el-button>
                <el-button icon="el-icon-close" plain round size="mini" type="danger"
                           @click="rejected(item)">拒绝</el-button>
              </span>
              </div>
            </div>
            <div class="line"></div>
          </div>
          <div class="flex" style="margin-top: 20px;padding-top:10px;border-top: #1e6abc 1px dashed"
               v-if="ccUsers.length > 0">
            <div>
              <i class="el-icon-success c-success last-icon"></i>
            </div>
            <div>
              <div style="margin-left: 20px">已抄送{{ ccUsers.length || 0 }}人</div>
              <div style="margin-top: 10px;margin-left: 20px">
                <div v-for="(emp) in ccUsers" :key="emp.id" class="flex align-center">
                  <el-avatar style="background-color: #1e6abc"> {{ emp.targetUserId | adminUsernameFilter }}</el-avatar>
                  <div style="margin-left: 10px">{{ emp.targetUserId | adminUsernameFilter }}</div>
                </div>
              </div>
            </div>
          </div>
        </el-card>
        <description-title style="margin-top: 24px">{{ categoryTitle }}</description-title>
        <approval-refund-apply v-if="categoryTitle =='退款审批'" :detail-data="detailData"></approval-refund-apply>
        <div v-if="categoryTitle =='请假审批'" class="leave-detail">
          <div class="leave-row">
            <span class="leave-label">申请人</span>
            <span class="leave-value">{{ leaveApplicant }}</span>
          </div>
          <div class="leave-row">
            <span class="leave-label">请假日期</span>
            <div class="leave-value leave-dates">
              <span v-for="item in leaveDates" :key="item.date" class="leave-date-chip">
                {{ item.text }}
              </span>
              <span v-if="leaveDates.length === 0" class="leave-empty">—</span>
              <span v-if="detailData.sameDay" class="leave-same-day">当天请假 · 需店长及以上审批</span>
            </div>
          </div>
          <div class="leave-row">
            <span class="leave-label">每天时间段</span>
            <span class="leave-value">{{ leaveTimeRange }}</span>
          </div>
          <div class="leave-row">
            <span class="leave-label">请假事由</span>
            <span class="leave-value">{{ detailData.marks || '—' }}</span>
          </div>
          <div class="leave-row">
            <span class="leave-label">请假期间订单</span>
            <span class="leave-value" :class="{'leave-warn': Number(detailData.count) > 0}">
              {{ detailData.count === undefined || detailData.count === null ? '—' : detailData.count + ' 单' }}
            </span>
          </div>
        </div>
        <el-descriptions style="margin-top: 10px;padding-left: 10px" v-if="categoryTitle =='送券审批'">
          <el-descriptions-item label="送券数量">{{ detailData.couponNumber }}张</el-descriptions-item>
          <el-descriptions-item label="单券价值">{{ Number(detailData.couponAmount || 0).toFixed(2) }}元</el-descriptions-item>
          <el-descriptions-item label="赠券总价值">{{ (Number(detailData.couponAmount || 0) * Number(detailData.couponNumber || 0)).toFixed(2) }}元</el-descriptions-item>
          <el-descriptions-item label="客户昵称">{{ detailData.customerName | maskNicknameFilter }}</el-descriptions-item>
          <el-descriptions-item label="客户手机号">{{ detailData.phone | maskPhoneFilter }}</el-descriptions-item>
          <el-descriptions-item label="使用限制">{{ detailData.limitations }}</el-descriptions-item>
          <el-descriptions-item label="有效期起">{{ detailData.startTime }}</el-descriptions-item>
          <el-descriptions-item label="有效期止">{{ detailData.endTime }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="detailData.businessType === 'lowRating'" class="feedback-detail">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="服务订单">#{{ detailData.orderId }}</el-descriptions-item>
            <el-descriptions-item label="处理说明">处理结果仅记录跟进状态，不删除顾客原评价。</el-descriptions-item>
          </el-descriptions>
          <el-table :data="detailData.ratings || []" border>
            <el-table-column label="疗愈师" width="130">
              <template slot-scope="scope">{{ scope.row.massagistName || ('#' + scope.row.massagistId) }}</template>
            </el-table-column>
            <el-table-column label="评分" prop="rating" width="80"></el-table-column>
            <el-table-column label="原始反馈" prop="comment" min-width="240"></el-table-column>
            <el-table-column label="评价时间" prop="createTime" width="170"></el-table-column>
          </el-table>
        </div>
        <description-title v-if="approval.rejectReason">拒绝原因</description-title>
        <div v-for="(item,index) in rejectList" :key="index">
          <el-descriptions style="margin-top: 10px;padding-left: 20px">
            <el-descriptions-item label="拒绝原因" :span="2">{{ item.rejectReason }}</el-descriptions-item>
            <el-descriptions-item label="创建人">{{ item.userId | adminUsernameFilter }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import approvalDetailApi from "@/api/approvalDetail";
import dateUtil from "@/utils/dateUtil";
import DescriptionTitle from "@/views/order/approval/DescriptionTitle";
import ApprovalRefundApply from "@/views/order/approval/ApprovalRefundApply";

export default {
  name: 'ApprovalProgress',
  components: {ApprovalRefundApply, DescriptionTitle},
  props: {},
  data() {
    return {
      showDrawer: false,
      loading: false,
      submitting: false,
      fetchRequestId: 0,
      approval: {},
      ccUsers: [],
      approvalUsers: [],
      categoryTitle: '',
      detailData: {},
      approvalDetail: {},
      //看板订单详情/消费记录/排班变动日志等入口只做历史回溯，不提供审批操作
      viewOnly: false,
    }
  },
  computed: {
    ...mapGetters(['userId']),
    drawerTitle() {
      const stateTxt = this.approvalStateText
      return stateTxt ? `审批详情 · ${stateTxt}` : '审批详情'
    },
    approvalStateText() {
      const map = this.constant.approvalStateMap
      const state = this.approval ? this.approval.state : undefined
      const textMap = {
        [map.rejected]: '已拒绝',
        [map.notSubmit]: '未提交',
        [map.approving]: '审批中',
        [map.passed]: '审批已通过',
        [map.withdraw]: '已撤回',
        [map.skipped]: '已跳过',
      }
      return textMap[state] || ''
    },
    //请假审批：申请人优先取申请单上的疗愈师，取不到再退回审批发起人
    leaveApplicant() {
      if (this.detailData.massagistName) return this.detailData.massagistName
      if (!this.approval.createUser) return '—'
      return this.$options.filters['adminUsernameFilter'](this.approval.createUser)
    },
    //请假日期按天展示并带上星期，历史数据没有勾选日期时退回起止时间
    leaveDates() {
      const raw = this.detailData.dates
      const list = Array.isArray(raw) ? raw.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : []
      if (list.length > 0) {
        return list.map(date => ({date, text: `${date} ${dateUtil.getWeek(date)}`}))
      }
      const start = this.datePart(this.detailData.startDatetime)
      const end = this.datePart(this.detailData.endDatetime)
      if (!start || !end) return []
      if (start === end) return [{date: start, text: `${start} ${dateUtil.getWeek(start)}`}]
      return [{date: start, text: `${start} 至 ${end}（共 ${this.dateSpan(start, end)} 天）`}]
    },
    leaveTimeRange() {
      const start = this.detailData.startTime || this.timePart(this.detailData.startDatetime)
      const end = this.detailData.endTime || this.timePart(this.detailData.endDatetime)
      if (!start && !end) return '—'
      return `${start || '—'} - ${end || '—'}`
    },
    //后端把拒绝记录存成 JSON 数组；历史/异常数据若是纯文本也不能让抽屉白屏
    rejectList() {
      const raw = this.approval.rejectReason
      if (!raw) return []
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      } catch (e) {
        //忽略解析失败,走下面的兜底
      }
      return [{rejectReason: raw, userId: null}]
    }
  },
  created() {
  },
  methods: {
    async open(row) {
      this.viewOnly = false
      this.approval = {...row.approval}
      this.approvalDetail = {...row}
      this.categoryTitle = row.approval.categoryTitle
      this.approvalUsers = []
      this.ccUsers = []
      this.detailData = {}
      this.showDrawer = true
      await this.fetch()
    },
    //按审批 id 只读查看完整流程：不依赖当前账号是否是节点处理人
    async openByApprovalId(approvalId) {
      if (!approvalId) return
      this.viewOnly = true
      this.approval = {}
      this.approvalDetail = {}
      this.categoryTitle = ''
      this.approvalUsers = []
      this.ccUsers = []
      this.detailData = {}
      this.showDrawer = true
      const requestId = ++this.fetchRequestId
      this.loading = true
      try {
        const res = await approvalDetailApi.flow(approvalId)
        if (requestId !== this.fetchRequestId) return
        const flow = res.data || {}
        this.approval = {...(flow.approval || {})}
        this.categoryTitle = flow.categoryTitle || this.approval.categoryTitle || ''
        this.detailData = flow.businessDetail || {}
        const rows = flow.details || []
        this.buildApprovalUsers(rows)
        this.ccUsers = rows.filter(d => d.flowUserType === this.constant.flowUserTypeMap.cc)
      } catch (error) {
        //无权查看等异常由请求拦截器统一提示，这里直接收起抽屉
        if (requestId === this.fetchRequestId) this.showDrawer = false
      } finally {
        if (requestId === this.fetchRequestId) this.loading = false
      }
    },
    async fetch() {
      const approvalId = this.approval.id
      const requestId = ++this.fetchRequestId
      this.loading = true
      try {
        const [res, resCategoryDetail] = await Promise.all([
          approvalDetailApi.list({approvalId, order: 'id'}), approvalDetailApi.findApprovalCategoryDetail(approvalId)
        ])
        if (requestId !== this.fetchRequestId || this.approval.id !== approvalId) return
        const rows = res.data || []
        this.buildApprovalUsers(rows)
        this.ccUsers = rows.filter(d => d.flowUserType === this.constant.flowUserTypeMap.cc)
        this.detailData = resCategoryDetail.data || {}
      } catch (error) {
        if (requestId === this.fetchRequestId) throw error
      } finally {
        if (requestId === this.fetchRequestId) this.loading = false
      }
    },
    buildApprovalUsers(data) {
      const stateMap = this.constant.approvalStateMap
      const flowUserTypeMap = this.constant.flowUserTypeMap
      const filter = this.$options.filters['adminUsernameFilter']
      this.approvalUsers = data.filter(d => d.flowUserType !== flowUserTypeMap.cc).map(d => {
        d.targetUserName = d.targetUserId === 0 ? '系统自动发起' : filter(d.targetUserId)
        let icon = ''
        let type = ''
        let content = ''
        let takingTimes = ''
        let colorClass = 'c-info'
        let stateTxt = '等待审批'
        if (d.flowUserType === flowUserTypeMap.create) {
          icon = 'el-icon-info'
          if (d.state === stateMap.withdraw) {
            type = 'danger'
            colorClass = 'c-danger'
            content = `${d.targetUserName}`
            stateTxt = '已撤回审批'
          } else {
            type = 'danger'
            colorClass = 'c-success'
            content = `${d.targetUserName}`
            stateTxt = '发起审批'
          }
        } else if (d.state === stateMap.passed && d.flowUserType == flowUserTypeMap.approval) {
          icon = 'el-icon-success'
          type = 'primary'
          colorClass = 'c-primary'
          content = `${d.targetUserName}`
          stateTxt = '审批已同意'
          const takingTimeStr = dateUtil.second2String(d.takingSeconds)
          takingTimes = `审批用时${takingTimeStr}`
        } else if (d.state === stateMap.rejected) {
          icon = 'el-icon-error'
          type = 'danger'
          colorClass = 'c-danger'
          content = `${d.targetUserName}`
          stateTxt = '已拒绝'
          const takingTimeStr = dateUtil.second2String(d.takingSeconds)
          takingTimes = `审批用时${takingTimeStr}`
        } else if (d.state === stateMap.approving && d.flowUserType == flowUserTypeMap.approval) {
          icon = 'el-icon-loading'
          type = 'warning'
          colorClass = 'c-warning'
          content = `${d.targetUserName}`
          stateTxt = '审批中'
          const takingTimeStr = dateUtil.waitTimeString(d.startTime)
          takingTimes = `已等待${takingTimeStr}`
        } else if (d.state === stateMap.approving && d.flowUserType == flowUserTypeMap.handle) {
          icon = 'el-icon-loading'
          type = 'warning'
          colorClass = 'c-warning'
          content = `${d.targetUserName}`
          stateTxt = '办理中'
          const takingTimeStr = dateUtil.waitTimeString(d.startTime)
          takingTimes = `已等待${takingTimeStr}`
        } else if (d.state === stateMap.skipped) {
          icon = 'el-icon-remove-outline'
          type = 'info'
          colorClass = 'c-info'
          content = `${d.targetUserName}`
          stateTxt = '已跳过'
          takingTimes = ''
        } else if (d.state === stateMap.withdraw) {
          icon = 'el-icon-error'
          type = 'danger'
          colorClass = 'c-danger'
          content = `${d.targetUserName}`
          stateTxt = '已撤回'
          takingTimes = ``
        } else {
          icon = 'el-icon-s-check'
          type = 'info'
          content = `${d.targetUserName}`
          stateTxt = d.flowUserType == flowUserTypeMap.handle ? '等待办理' : '等待审批'
          takingTimes = ''
        }
        return {
          icon,
          type,
          colorClass,
          content,
          stateTxt,
          nodeName: d.nodeName || '',
          timestamp: d.finishTime,
          targetUserName: d.targetUserName,
          targetUserId: d.targetUserId,
          flowUserType: d.flowUserType,
          takingTime: d.takingTime,
          takingTimeStr: takingTimes,
          state: d.state,
          id: d.id
        }
      })
    },
    //后端返回“2026年11月03日 09:00”，这里只取日期/时间部分做兼容展示
    datePart(value) {
      const match = value ? String(value).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/) : null
      if (!match) return ''
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
    },
    timePart(value) {
      const match = value ? String(value).match(/(\d{1,2}:\d{2})/) : null
      return match ? match[1] : ''
    },
    dateSpan(start, end) {
      return dateUtil.dateDiff(start, end, 'day') + 1
    },
    async pass(detail) {
      if (this.submitting) return
      this.submitting = true
      let loadingShown = false
      try {
        await this.notifyConfirm('此操作将通过该条审批, 是否继续?')
        this.showFullLoading()
        loadingShown = true
        await approvalDetailApi.pass(detail.id)
        await this.fetch()
        this.notifySuccess()
        this.$emit('submit')
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.submitting = false
      }
    },
    async rejected(detail = this.approvalDetail) {
      if (this.submitting) return
      const detailId = detail.id
      this.submitting = true
      let loadingShown = false
      try {
        let answer
        try {
          answer = await this.$prompt('请输入拒绝原因', '提示', {
            confirmButtonText: '确定', cancelButtonText: '取消',
            inputPattern: /\S+/, inputErrorMessage: '原因不能为空'
          })
        } catch (error) {
          if (error === 'cancel' || error === 'close') return
          throw error
        }
        this.showFullLoading()
        loadingShown = true
        await approvalDetailApi.reject(detailId, answer.value.trim())
        await this.fetch()
        this.notifySuccess()
        this.$emit('submit')
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.submitting = false
      }
    },
    close() {
      this.fetchRequestId++
      this.loading = false
      this.showDrawer = false
      this.approval = {}
      this.detailData = {}
      this.approvalDetail = {}
      this.categoryTitle = ''
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.approval-content {
  width: 100%;
  padding: 0 20px 24px;
}
.feedback-detail {
  margin-top: 16px;
  line-height: 1.7;
  letter-spacing: 0.05em;
}
.node-tag {
  margin-right: 6px;
}
.leave-detail {
  margin-top: 10px;
  padding: 4px 10px 0;
  line-height: 1.8;

  .leave-row {
    display: flex;
    align-items: flex-start;
    padding: 6px 0;
    border-bottom: 1px dashed #f0edef;

    &:last-child {
      border-bottom: none;
    }
  }

  .leave-label {
    flex: 0 0 88px;
    font-size: 13px;
    color: #79747e;
    letter-spacing: 0.05em;
  }

  .leave-value {
    flex: 1;
    font-size: 13px;
    color: #322f35;
    letter-spacing: 0.05em;
  }

  .leave-warn {
    color: #c4562f;
  }

  .leave-dates {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .leave-date-chip {
    padding: 1px 8px;
    border-radius: 4px;
    font-size: 12px;
    color: #584219;
    background: #fbf4e8;
    border: 1px solid #e4c892;
  }

  .leave-empty {
    color: #9a96a2;
  }

  .leave-same-day {
    padding: 1px 8px;
    border-radius: 4px;
    font-size: 12px;
    line-height: 18px;
    color: #a33a12;
    background: #fdf0e9;
    border: 1px solid #f0bfa6;
  }
}
</style>
