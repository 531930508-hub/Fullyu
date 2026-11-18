<template>
  <div>
    <el-drawer :show-close="true" :visible.sync="showDrawer" custom-class="PadOrderDetail" size="400px"
               :title="readOnly ? '订单详情（只读）' : '订单详情'"
               :before-close="close">
      <div style="padding: 0 24px;height: calc(100vh - 85px);" class="flex flex-column">
        <el-descriptions :column="1" labelClassName="c-c1c0c4" :colon="false" contentClassName="c-49454f"
                         style="padding: 28px 0;margin: 28px 0; border-bottom: 1px #E5E5E5 dashed;border-top: 1px #E5E5E5 dashed;">
          <el-descriptions-item label="订单状态"> <span class="status" :class="[
            orderDetail.state==0?'red':
            orderDetail.state==1?'green':
            orderDetail.state==2?'white':
            orderDetail.state==3?'yellow':
            'white'
          ]">{{ orderDetail.state | appointmentStateFilter }} </span></el-descriptions-item>
          <el-descriptions-item label="支付状态"> {{ orderDetail.order.state | orderStateFilter }}</el-descriptions-item>
          <el-descriptions-item label="支付方式">
          <span
            :style="!readOnly && ((orderDetail.order.state == 0 && orderDetail.order.payType==0) || (orderDetail.order.payType==3 && orderDetail.order.state != 0))?'cursor: pointer;color: #409EFF':''"
            @click="openQrCodePay">
            {{ orderDetail.order.payType | orderPayTypeFilter }}
          </span>
          </el-descriptions-item>
          <el-descriptions-item label="项目"> {{ orderDetail.projectTitle }}</el-descriptions-item>
          <el-descriptions-item label="座位"> {{ orderDetail.bedName }}</el-descriptions-item>
          <!--        <el-descriptions-item label="区域"> {{ orderDetail.bedType | bedTypeFilter }}</el-descriptions-item>-->
          <el-descriptions-item label="疗愈时间段">
            {{ orderDetail.startTime | formatDateTime }}-{{ orderDetail.endTime  | formatDateTime }}
          </el-descriptions-item>
          <el-descriptions-item label="疗愈时长"> {{ orderDetail.duration }} mins</el-descriptions-item>
          <el-descriptions-item label="用券数量" v-if="orderDetail.order.payType==2"> {{
              orderDetail.order.couponAmount
            }}张
          </el-descriptions-item>
          <el-descriptions-item :label="`${orderDetail.order.state==0?'应':'实'}付金额`">
            <span v-if="orderDetail.order.state==3 || orderDetail.order.state==4">0 元</span>
            <div v-else>
              <div
                v-if="!readOnly && ((orderDetail.order.payType==3 || orderDetail.order.payType==4) || ((orderDetail.order.payType == 0 || orderDetail.order.payType == 1) && orderDetail.order.state==0))"
                @click="changePayAmount(orderDetail.order)">
                {{ orderDetail.order.couponPayAmount }}元
                <i class="el-icon-edit" style="margin-left: 4px;cursor: pointer"></i>
              </div>
              <div v-else>{{ orderDetail.order.couponPayAmount }}元</div>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="疗愈师">
            <div v-if="orderDetail.massagist!=null" class="flex align-center justify-end">
              <el-avatar :src="orderDetail.massagist.avatarUrl"
                         style="width: 24px;height: 24px;margin-right: 8px"></el-avatar>
              {{ orderDetail.massagist.name }}
              <img v-if="orderDetail.specifyType" :title="orderDetail.specifyType==1?'小程序指定疗愈师（点钟）':'后台指定疗愈师（点钟）'"
                   src="@/assets/images/specify-type-icon.png" height="10"
                   style="margin-left: 2px" width="10"/>
              <img v-else-if="!orderDetail.isUpdateSort" title="本单未计入轮次（不占用该疗愈师的轮牌顺序）"
                   src="@/assets/images/not-update-sort.png" height="10"
                   style="margin-left: 2px" width="10"/>
            </div>
            <div v-else-if="readOnly || orderDetail.state==2 || orderDetail.state==3" style="color: #C1C0C4">未安排</div>
            <div v-else><a @click="exceArganizeMassagist(orderDetail)"> 一键安排疗愈师</a></div>
          </el-descriptions-item>
          <el-descriptions-item label="服务备注">
            {{ orderDetail.comment }}
            <i class="el-icon-edit" style="cursor: pointer;padding: 0 4px"
               @click="updateComment(orderDetail)"></i>
          </el-descriptions-item>
          <el-descriptions-item label="">
            <div v-if="readOnly" class="font-extra-small hover-click" style="text-align: right"
                 @click="showAddOrderLabel(orderDetail.order)">
              <span v-if="orderDetail.order.oil || partsText(orderDetail.order.parts)">
                精油 {{ orderDetail.order.oil || '无' }}
                <span v-if="partsText(orderDetail.order.parts)"
                      style="margin-left: 10px">部位 {{ partsText(orderDetail.order.parts) }}</span>
              </span>
              <span v-else style="color: #C1C0C4">未记录精油和部位</span>
              <i class="el-icon-edit" style="margin-left: 4px;cursor: pointer"></i>
            </div>
            <div v-else class="flex align-center justify-end hover-click font-extra-small"
                 @click="showAddOrderLabel(orderDetail.order)">精油和部位
            </div>
          </el-descriptions-item>
        </el-descriptions>
        <el-descriptions :column="1" labelClassName="c-c1c0c4" :colon="false" contentClassName="c-49454f">
          <el-descriptions-item label="">
            <div class="flex align-center justify-end hover-click font-extra-small"
                 @click="showOrderHistoryDialog(orderDetail.customer)">消费记录
            </div>
          </el-descriptions-item>
          <!-- 订单相关审批（改单/退款/送券等）：超级管理员可回溯完整流程 -->
          <el-descriptions-item label="" v-if="orderApprovals.length">
            <div class="flex align-center justify-end font-extra-small order-approvals">
              <span class="c-info m-r5">审批记录</span>
              <el-tag v-for="item in orderApprovals" :key="item.id" size="mini"
                      :type="approvalTagType(item.state)" class="order-approval-tag"
                      @click.native="openApprovalFlow(item.id)">
                {{ item.categoryTitle }} · {{ approvalStateText(item.state) }}
              </el-tag>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="顾客昵称">
            <div class="flex align-center justify-end">
              <el-avatar :src="orderDetail.customer.avatar"
                         style="width: 24px;height: 24px;margin-right: 8px"></el-avatar>
              {{ displayNickname(orderDetail.customer.nickname, '-') }}
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="手机号码 Phone">
            <!-- 页面只展示脱敏号码，不提供一键拨号，避免号码被随手带走 -->
            <span>{{ orderDetail.customer.phone | maskPhoneFilter }}</span>
          </el-descriptions-item>
          <!--          <el-descriptions-item label="会员等级"> {{ orderDetail.customer.vipLevel || '无' }}</el-descriptions-item>
                    <el-descriptions-item label="已服务数"> {{ orderDetail.customer.orderCount }}次</el-descriptions-item>-->
          <el-descriptions-item label="称呼 Name">
            <div :class="{'hover-click': !readOnly}" @click="handleEditCustomer(orderDetail.customer)">
              {{ orderDetail.customer.comment }}<i v-if="!readOnly" class="el-icon-edit"
                                                  style="margin-left: 4px;cursor: pointer"></i>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="性别 Gender">
            <div :class="{'hover-click': !readOnly}" @click="handleEditCustomer(orderDetail.customer)">
              {{ orderDetail.customer.gender == 1 ? '男' : orderDetail.customer.gender == 2 ? '女' : '' }}<i
              v-if="!readOnly" class="el-icon-edit" style="margin-left: 4px;cursor: pointer"></i>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="备注 Note">
            <div :class="{'hover-click': !readOnly, 'flex': !readOnly, 'align-center': !readOnly, 'justify-end': !readOnly}"
                 @click="handleEditCustomer(orderDetail.customer)">
              <span>{{ orderDetail.customer.note }}</span>
              <i v-if="!readOnly" class="el-icon-edit" style="margin-left: 4px;cursor: pointer"></i>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="疗愈师偏好">
            <div class="flex align-center justify-end flex-wrap">
              <span style="margin-right: 8px">收藏 {{ customerPreference.favoriteCount }}</span>
              <template v-if="customerPreference.blockList.length">
                <el-tag v-for="item in customerPreference.blockList" :key="item.id" size="mini" type="warning"
                        style="margin-left: 4px">
                  暂别 {{ item.massagist ? item.massagist.name : '疗愈师' }}
                </el-tag>
              </template>
              <span v-else class="c-c1c0c4">暂别 0</span>
            </div>
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="!readOnly" class="flex1 flex flex-column justify-end">
          <el-button
            v-if="orderDetail.order.state==0 && (orderDetail.order.payType == 3 || orderDetail.order.payType == 4)"
            @click="handlePay(orderDetail.order)"
            class="btn-A">确认收款
          </el-button>
          <el-button @click="handleDoing(orderDetail)" class="btn-A"
                     v-if="(orderDetail.order.state==1 || orderDetail.order.state==2) &&orderDetail.state==0">客户到店
          </el-button>
          <el-button @click="updForm" class="btn-B" v-if="orderDetail.state==0 || orderDetail.state==1">修改订单</el-button>
          <el-button @click="openNewAppointment" class="btn-B">加钟  <!--v-if="orderDetail.state==1|| orderDetail.state==2"-->
          </el-button>
          <el-button
            v-if="orderDetail.order && orderDetail.order.state==0&&smsShow "
            class="btn-B"
            @click="sendMessageSMS(orderDetail.orderId)">发送取消短信
          </el-button>
          <el-button
            v-if="orderDetail.order && (((orderDetail.order.state==1 || orderDetail.order.state==2) && orderDetail.order.appointmentState==1) || orderDetail.order.appointmentState==0)"
            class="btn-B"
            @click="cancelOrder(orderDetail.order)">取消订单
          </el-button>
          <el-button
            v-if="orderDetail.order && orderDetail.order.state==6 && (orderDetail.order.appointmentState==2 || orderDetail.order.appointmentState==1)"
            class="btn-B"
            @click="cancelRefundOrder(orderDetail.order)">已退款取消
          </el-button>
          <el-button class="btn-B"
                     v-if="orderDetail.order && (orderDetail.order.state==1 || orderDetail.order.state==2)"
                     @click="refund(orderDetail.order)">仅退款
          </el-button>
          <el-button class="btn-B"
                     v-if="orderDetail.order && orderDetail.order.type == 0 && (orderDetail.order.appointmentState==2)"
                     @click="printOrder(orderDetail.order)">打印小票
          </el-button>
        </div>
        <div v-if="readOnly" class="flex1 flex font-extra-small"
             style="align-items: flex-end;justify-content: center;padding-bottom: 8px;color: #C1C0C4">
          疗愈师账号仅可查看订单，可填写服务备注与精油部位
        </div>
      </div>
    </el-drawer>
    <upd-order-form ref="refOrderForm" @submit-success="submitSuccess"></upd-order-form>
    <refund-form ref="refRefundForm" @submit-success="submitSuccess"></refund-form>
    <qr-code-pay-dialog ref="refQrCodePayDialog" @fetch="updateData"></qr-code-pay-dialog>
    <customer-form-dialog ref="refCustomerFormDialog" @submit-success="onUpdateCustomer"></customer-form-dialog>
    <confirm-pay-dialog ref="refConfirmPayDialog" @submit-success="submitSuccess"></confirm-pay-dialog>
    <appointment-drawer ref="refAppointmentDrawer" @submit-success="submitSuccess"></appointment-drawer>
    <order-history-dialog ref="refOrderHistoryDialog"></order-history-dialog>
    <order-label-dialog ref="refOrderLabelDialog" @submit-success="onLabelSaved"></order-label-dialog>
    <CancelOrderDialog ref="refCancelOrderDialog" @submit-success="submitSuccess">></CancelOrderDialog>
    <approval-progress ref="refApprovalProgress"></approval-progress>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import dateUtil from "@/utils/dateUtil";
import UpdOrderForm from "@/views/home/UpdOrderForm";
import orderApi from "@/api/order/order";
import RefundForm from "@/views/order/RefundForm";
import refundApplyApi from "@/api/order/refundApply";
import orderDetailApi from "@/api/order/orderDetail";
import QrCodePayDialog from './QrCodePayDialog.vue'
import CustomerFormDialog from './CustomerFormDialog.vue'
import ConfirmPayDialog from "./ConfirmPayDialog";
import AppointmentDrawer from "@/views/home/AppointmentDrawer";
import OrderHistoryDialog from "./OrderHistoryDialog";
import {Message} from "element-ui";
import OrderLabelDialog from "./OrderLabelDialog";
import CancelOrderDialog from "./CancelOrderDialog";
import customerMassagistRelationApi from "@/api/customer/customerMassagistRelation";
import customerMassagistBlockApi from "@/api/customer/customerMassagistBlock";
import ApprovalProgress from "@/views/order/approval/ApprovalProgress";
import approvalDetailApi from "@/api/approvalDetail";


export default {
  name: 'PadOrderDetail',
  components: {
    ApprovalProgress,
    CancelOrderDialog,
    OrderLabelDialog,
    OrderHistoryDialog,
    AppointmentDrawer, ConfirmPayDialog, CustomerFormDialog, QrCodePayDialog, RefundForm, UpdOrderForm
  },
  props: {
    //只读模式：疗愈师看板上只允许查看订单，不展示任何编辑/收款/取消入口
    readOnly: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      showDrawer: false,
      smsShow: false,
      orderDetail: {customer: {}, massagist: {avatarUrl: ''}, order: {}},
      customerPreference: {favoriteCount: 0, blockList: []},
      orderApprovals: []
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
  },
  methods: {
    async open(orderDetail = {customer: {}, massagist: {avatarUrl: ''}, order: {}}) {
      await this.initOrderDetail(orderDetail.id)
      this.showDrawer = true
      this.oldDetail = orderDetail
    },
    async initOrderDetail(id) {
      let res = await orderDetailApi.info(id);
      this.orderDetail = res.data || {customer: {}, massagist: {avatarUrl: ''}, order: {}}
      this.loadCustomerPreference(this.orderDetail.customerId || (this.orderDetail.customer && this.orderDetail.customer.id))
      //审批记录异步加载，失败不阻塞订单详情主流程
      this.loadOrderApprovals(this.orderDetail.order && this.orderDetail.order.id)

      let yuyueTime=this.orderDetail.startTime;
      let tenTime=dateUtil.addSeconds(this.orderDetail.startTime,600);
      let nowTime=dateUtil.getCurrentTimeCode();
      //满足条件显示取消短信按钮
      this.smsShow = false;
      console.log(yuyueTime);
      console.log(nowTime);
      console.log(tenTime);
      console.log(dateUtil.isBefore(yuyueTime,nowTime));
      console.log(dateUtil.isBefore(tenTime,nowTime));
      if(dateUtil.isBefore(yuyueTime,nowTime)){//&&!dateUtil.isBefore(tenTime,nowTime)
        this.smsShow =true;
      }
    },
    //订单关联审批（改单/退款/送券等）：失败静默，不影响订单主信息展示
    async loadOrderApprovals(orderId) {
      this.orderApprovals = []
      if (!orderId) return
      try {
        const res = await approvalDetailApi.byOrder(orderId)
        this.orderApprovals = res.data || []
      } catch (e) {
        this.orderApprovals = []
      }
    },
    approvalStateText(state) {
      const map = this.constant.approvalStateMap
      const textMap = {
        [map.rejected]: '已拒绝',
        [map.notSubmit]: '未提交',
        [map.approving]: '审批中',
        [map.passed]: '已通过',
        [map.withdraw]: '已撤回',
        [map.skipped]: '已跳过',
      }
      return textMap[state] || ''
    },
    approvalTagType(state) {
      const map = this.constant.approvalStateMap
      if (state === map.passed) return 'success'
      if (state === map.rejected) return 'danger'
      if (state === map.approving) return 'warning'
      return 'info'
    },
    openApprovalFlow(approvalId) {
      if (approvalId) this.$refs.refApprovalProgress.openByApprovalId(approvalId)
    },
    async loadCustomerPreference(customerId) {
      this.customerPreference = {favoriteCount: 0, blockList: []}
      if (!customerId) {
        return
      }
      try {
        const [relationRes, blockRes] = await Promise.all([
          customerMassagistRelationApi.page({customerId, page: 1, size: 1}),
          customerMassagistBlockApi.page({customerId, page: 1, size: 100})
        ])
        this.customerPreference = {
          favoriteCount: (relationRes.data && relationRes.data.total) || 0,
          blockList: (blockRes.data && blockRes.data.list) || []
        }
      } catch (e) {
        this.customerPreference = {favoriteCount: 0, blockList: []}
      }
    },
    submitSuccess() {
      this.$emit("submit-success")
      this.close()
    },
    close() {
      this.showDrawer = false
      this.orderDetail = {customer: {}, massagist: {}, order: {}}
      this.customerPreference = {favoriteCount: 0, blockList: []}
    },
    updForm() {
      this.$refs.refOrderForm.open(this.orderDetail.orderId)
    },
    openNewAppointment() {
      let date = dateUtil.format(this.orderDetail.endTime, 'YYYY-MM-DD')
      let time = dateUtil.format(this.orderDetail.endTime, 'HH:mm')
      console.log("this.orderDetail.massagistId");
      let massagistIdList=[]
      if(this.orderDetail.massagistId!=null){
        massagistIdList = [this.orderDetail.massagistId]
      }
      let bedIdList = [this.orderDetail.bedId]
      let phone = this.orderDetail.customer.phone
      let comment = this.orderDetail.customer.comment
      let gender = this.orderDetail.customer.gender
      let form = {
        date,
        time,
        //来源订单：加钟时段/床位按同一客户判定，不占用 15 分钟整理期
        orderId: this.orderDetail.orderId,
        projectId: this.orderDetail.projectId,
        massagistIdList,
        bedIdList,
        phone,
        comment,
        gender,
        hiddenIsUpdateSortBtn: true
      }
      this.$refs.refAppointmentDrawer.open(form, {}, '加钟');
    },
    cancelOrder(row) {
      this.$refs.refCancelOrderDialog.open(row)
    },
    async cancelRefundOrder(row) {
      this.$prompt('请输入仅退款后又取消订单的原因', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /^.+$/,
        inputErrorMessage: '原因不能为空'
      }).then(async ({value}) => {
        await this.notifyConfirm("此操作将要取消此订单所有关联服务项目？确定要取消吗？")
        await orderApi.cancelRefundOrder(row.id, value)
        this.submitSuccess()
        this.notifySuccess()
      }).catch(() => {

      });
    },
    async refund(row, index) {
      this.$refs.refRefundForm.open(row)
    },
    async sendMessageSMS(orderId){
      await this.notifyConfirm('确定要发送取消短信吗')
      this.showFullLoading()
      console.log(orderId);
      await orderApi.sendMessageSMS(orderId)
      this.hideFullLoading()
      this.notifySuccess('短信发送成功！')
    },
    async printOrder(row) {
      await this.notifyConfirm('确定要打印小票吗')
      this.showFullLoading()
      await orderApi.printOrder(row.id)
      this.hideFullLoading()
      this.notifySuccess('已下发打印任务')
    },
    async handlePay(row) {
      this.$refs.refConfirmPayDialog.open(row.id, row.payAmount, row.payType, row.couponCode)
    },
    async handleDoing(row) {
      await this.notifyConfirm('确认客户已到店吗？')
      this.showFullLoading()
      await orderDetailApi.doingService(row.id)
      this.hideFullLoading()
      row.state = 1
      this.notifySuccess()
      this.$emit("submit-success")
      this.close()//luxin新增关闭弹出框
    },
    async exceArganizeMassagist(row) {
      try {
        await this.notifyConfirm('确认要给客户安排疗愈师吗？')
      } catch (e) {
        // 用户取消
        return
      }
      this.showFullLoading()
      try {
        const res = await orderDetailApi.exceArganizeMassagist(row.id)
        const assigned = (res && res.data) || {}
        // 必须等详情刷新完成，再判断到底有没有安排上，避免"提示成功但疗愈师仍显示未安排"
        await this.initOrderDetail(row.id)
        this.$emit("submit-success")
        const massagist = this.orderDetail && this.orderDetail.massagist
        if (massagist && massagist.id) {
          this.notifySuccess(`已安排疗愈师：${massagist.name}`)
        } else if (assigned.massagistId) {
          this.notifyWarning(`已分配疗愈师（id=${assigned.massagistId}），但详情刷新失败，请手动刷新页面确认`)
        } else {
          this.notifyWarning('未安排到疗愈师，请检查该时段疗愈师排班后重试')
        }
      } finally {
        this.hideFullLoading()
      }
    },
    async updateComment(row) {
      // 只读看板也允许修改服务备注，其余字段仍只读
      this.$prompt('请输入备注内容', '更改备注', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputValue: row.comment || '',
        inputPlaceholder: '可以不填，清空后保存即删除备注'
      }).then(async ({value}) => {
        const comment = (value || '').trim()
        await orderDetailApi.updateComment(row.id, comment)
        this.notifySuccess()
        row.comment = comment
        this.$emit("submit-success")
      }).catch(() => {

      });
    },
    openQrCodePay() {
      if (this.readOnly) {
        return
      }
      if (this.orderDetail.order.state == 0 && this.orderDetail.order.payType == 0) {
        if (this.orderDetail.order.payAmount <= 0) {
          Message({
            message: '支付金额不能低于0.01',
            type: 'error',
            duration: 3 * 1000
          })
          return
        }
        this.$refs.refQrCodePayDialog.open(this.orderDetail.order.code, this.orderDetail.order.payAmount, this.orderDetail.order.totalAmount)
      } else if (this.orderDetail.order.payType == 3 && this.orderDetail.order.state != 0) {
        this.$alert(this.orderDetail.order.couponCode, '美团券码', {
          showConfirmButton: false,
          closeOnClickModal: true,
          callback: action => {

          }
        });
      }
    },
    changePayAmount(row) {
      let title = ""
      if ((row.payType == 0 || row.payType == 1) && row.state != 0) {
        return;
      }
      if (row.payType == 3) {
        title = "美团实付"
      } else if (row.payType == 4) {
        title = "现金实付"
      } else if (row.payType == 0) {
        title = "二维码实付"
      } else if (row.payType == 1) {
        title = "小程序实付"
      } else {
        return;
      }
      this.$prompt('请输入' + title + "金额(元)", title, {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputType: 'number',
        inputPattern: /^(0|[1-9]\d*)(\.\d{1,2})?$/,
        inputValue: row.payAmount,
        inputErrorMessage: `${title}的金额必须大于等于0，且小数不超过两位`
      }).then(async ({value}) => {
        await orderApi.updatePayAmount(row.id, value)
        this.notifySuccess()
        this.initOrderDetail(this.orderDetail.id)
        this.$emit("submit-success")
      }).catch(() => {

      });
    },
    updateData() {
      this.initOrderDetail(this.orderDetail.id)
      this.$emit("submit-success")
    },
    handleEditCustomer(customer) {
      if (this.readOnly) {
        return
      }
      this.$refs.refCustomerFormDialog.open(customer)
    },
    onUpdateCustomer(customer) {
      if (customer) {
        this.oldDetail.customer = customer
        this.orderDetail.customer = customer
      }
      this.$emit("submit-success")
    },
    showOrderHistoryDialog(customer) {
      let title = this.customerTitle(customer) + '的消费记录'
      this.$refs.refOrderHistoryDialog.open(customer.id, title)
    },
    customerTitle(customer) {
      if (!customer) {
        return
      }
      const {comment, nickname, phone, gender} = customer
      if (comment && gender) {
        return comment + (gender == 1 ? '先生' : gender == 2 ? '女士' : '')
      }
      //昵称可能被登记成「用户+手机号」，这种情况显示脱敏号码
      if (!nickname || /^用户\d{11}$/.test(nickname) || /^1\d{10}$/.test(nickname)) {
        return this.$options.filters['maskPhoneFilter'](phone)
      }
      return nickname
    },
    //只读模式（疗愈师）也允许记录精油和部位：服务结束后由本人补录
    showAddOrderLabel(order) {
      if (!order || !order.id) {
        return
      }
      this.$refs.refOrderLabelDialog.open({orderId: order.id, oil: order.oil, parts: order.parts})
    },
    //保存精油和部位：疗愈师留在详情页继续查看，运营侧保持原有「保存后关闭并刷新看板」的行为
    onLabelSaved(form) {
      const saved = form || {}
      if (this.orderDetail && this.orderDetail.order) {
        this.orderDetail.order.oil = saved.oil
        this.orderDetail.order.parts = saved.parts
      }
      if (this.readOnly) {
        this.$emit("submit-success")
        return
      }
      this.submitSuccess()
    },
    //只读模式下把精油的部位数组拼成一行展示
    partsText(parts) {
      if (!parts) {
        return ''
      }
      return Array.isArray(parts) ? parts.join('、') : parts
    }
  },
  filters: {
    formatDateTime(timeStr) {
      if (timeStr) {
        return dateUtil.format(timeStr, "HH:mm");
      }
      return ''
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less">
.PadOrderDetail {
  .el-drawer__header {
    margin-bottom: 0;
  }

  .order-approvals {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .order-approval-tag {
    cursor: pointer;
    margin: 2px 0 2px 4px;
  }


  .c-c1c0c4 {
    color: #49454F73;
    font-size: 17px;
  }

  .c-49454f {
    display: block;
    width: 100%;
    text-align: right;
    color: #49454f;
    font-size: 17px;
  }

  .btn-A {
    background-color: #6750a4;
    color: #FFFFFF;
    width: 100%;
    border-radius: 12px;
    border: 1px solid #6750a4;
    margin-left: 0;
    margin-bottom: 10px;
  }

  .btn-B {
    background-color: #FFFFFF;
    border: 1px solid #d7d3db;
    width: 100%;
    color: #54515a;
    border-radius: 12px;
    margin-left: 0;
    margin-bottom: 10px;
  }

  .status {
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 14px;

    &.red {
      background-color: #FDD3D0;
      color: #900B09;
    }

    &.green {
      background-color: #CFF7D3;
      color: #02542D;
    }

    &.white {
      background-color: #F5F5F5;
      color: #1E1E1E;
    }

    &.yellow {
      background-color: #E8B931;
      color: #401B01;
    }
  }
}
</style>
