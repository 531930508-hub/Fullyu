<template>
  <div class="ApprovalProgress">
    <el-drawer :show-close="true" :visible.sync="showDrawer"  append-to-body size="min(980px, 100vw)" title="审批详情"
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
                  v-if="item.state == constant.approvalStateMap.approving && item.targetUserId == userId && item.flowUserType==constant.flowUserTypeMap.approval"
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
        <el-descriptions style="margin-top: 10px;padding-left: 10px" v-if="categoryTitle =='请假审批'" :column="3">
          <el-descriptions-item label="开始时间">{{ detailData.startDatetime+"("+startDateWeek+")" }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ detailData.endDatetime+"("+endDateWeek+")" }}</el-descriptions-item>
          <el-descriptions-item label="是否有订单">{{ detailData.count }}</el-descriptions-item>
          <el-descriptions-item label="请假事由">{{ detailData.marks }}</el-descriptions-item>
        </el-descriptions>
        <el-descriptions style="margin-top: 10px;padding-left: 10px" v-if="categoryTitle =='送券审批'">
          <el-descriptions-item label="送券数量">{{ detailData.couponNumber }}张</el-descriptions-item>
          <el-descriptions-item label="单券价值">{{ Number(detailData.couponAmount || 0).toFixed(2) }}元</el-descriptions-item>
          <el-descriptions-item label="赠券总价值">{{ (Number(detailData.couponAmount || 0) * Number(detailData.couponNumber || 0)).toFixed(2) }}元</el-descriptions-item>
          <el-descriptions-item label="客户昵称">{{ detailData.customerName }}</el-descriptions-item>
          <el-descriptions-item label="客户手机号">{{ detailData.phone }}</el-descriptions-item>
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
        <div v-for="(item,index) in approval.rejectReason?JSON.parse(approval.rejectReason):[]">
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
      startDateWeek:'',
      endDateWeek:'',
    }
  },
  computed: {
    ...mapGetters(['userId'])
  },
  created() {
  },
  methods: {
    async open(row) {
      this.approval = {...row.approval}
      this.approvalDetail = {...row}
      this.categoryTitle = row.approval.categoryTitle
      this.approvalUsers = []
      this.ccUsers = []
      this.detailData = {}
      this.showDrawer = true
      await this.fetch()
    },
    async fetch() {
      const approvalId = this.approval.id
      const requestId = ++this.fetchRequestId
      this.loading = true
      try {
        const [res, resCategoryDetail] = await Promise.all([
          approvalDetailApi.list({approvalId}), approvalDetailApi.findApprovalCategoryDetail(approvalId)
        ])
        if (requestId !== this.fetchRequestId || this.approval.id !== approvalId) return
        const rows = res.data || []
        this.buildApprovalUsers(rows)
        this.ccUsers = rows.filter(d => d.flowUserType === this.constant.flowUserTypeMap.cc)
        this.detailData = resCategoryDetail.data || {}
        if (this.categoryTitle === '请假审批' && this.detailData.startDatetime && this.detailData.endDatetime) {
          const startDate = this.detailData.startDatetime.replace('年','-').replace('月','-').replace('日','').substr(0,10)
          const endDate = this.detailData.endDatetime.replace('年','-').replace('月','-').replace('日','').substr(0,10)
          this.startDateWeek = dateUtil.getWeek(startDate)
          this.endDateWeek = dateUtil.getWeek(endDate)
        }
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
</style>
