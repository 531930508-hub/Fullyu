<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">订单管理</h2>
      <a-space>
        <a-input-search v-model:value="searchText" placeholder="搜索用户昵称/手机号" style="width: 220px" @search="loadOrders" />
        <a-select v-model:value="filterStatus" style="width: 130px" @change="loadOrders">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option value="PAID">已支付</a-select-option>
          <a-select-option value="PENDING_PAYMENT">待支付</a-select-option>
          <a-select-option value="COMPLETED">已完成</a-select-option>
          <a-select-option value="REFUNDING">退款中</a-select-option>
          <a-select-option value="REFUNDED">已退款</a-select-option>
          <a-select-option value="CANCELLED">已取消</a-select-option>
        </a-select>
      </a-space>
    </div>

    <!-- 订单类型 Tab -->
    <a-tabs v-model:activeKey="orderType" style="margin-bottom: 16px;" @change="loadOrders">
      <a-tab-pane key="ALL" tab="全部订单" />
      <a-tab-pane key="COURSE" tab="课程订单" />
      <a-tab-pane key="MEMBER_CARD" tab="会员卡订单" />
      <a-tab-pane key="COMMUNITY" tab="社群订单" />
    </a-tabs>

    <!-- 订单统计 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="6"><a-card><a-statistic title="订单总数" :value="orders.length" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="已支付收入" prefix="¥" :value="paidRevenue" :precision="2" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="待支付" :value="pendingCount" :value-style="{ color: '#F39C12' }" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="退款笔数" :value="refundCount" :value-style="{ color: '#C0392B' }" /></a-card></a-col>
    </a-row>

    <a-card>
      <a-table :columns="columns" :data-source="orders" row-key="id" :loading="loading">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'orderNo'">
            <a style="color: #6B463C;" @click="showOrderDetail(record)">{{ record.orderNo }}</a>
          </template>
          <template v-if="column.dataIndex === 'user'">
            <div style="display: flex; align-items: center; gap: 6px;">
              <a-avatar size="small" :style="{ backgroundColor: '#6B463C' }">{{ record.userName.charAt(0) }}</a-avatar>
              <span>{{ record.userName }}</span>
            </div>
          </template>
          <template v-if="column.dataIndex === 'type'">
            <a-tag :color="record.orderType === 'MEMBER_CARD' ? 'gold' : 'blue'">{{ record.typeLabel }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'itemName'">
            <span>{{ record.itemName }}</span>
          </template>
          <template v-if="column.dataIndex === 'amount'">
            <div>
              <div style="font-weight: 500;">¥{{ record.actualPaid.toFixed(2) }}</div>
              <div v-if="record.discount > 0" style="color: #999; font-size: 12px; text-decoration: line-through;">¥{{ record.originalPrice.toFixed(2) }}</div>
              <div v-if="record.refundedYuan > 0" style="color: #C0392B; font-size: 12px;">已退 ¥{{ record.refundedYuan.toFixed(2) }}</div>
            </div>
          </template>
          <template v-if="column.dataIndex === 'status'">
            <a-tag :color="statusColorMap[record.status]">{{ record.statusLabel }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-button type="link" size="small" @click="showOrderDetail(record)">详情</a-button>
            <a-button v-perm="'order:refund'"
              v-if="record.forceRefundable"
              type="link"
              size="small"
              danger
              @click="openForceRefund(record)"
            >强制退款</a-button>
            <a-tag v-else-if="record.refundProcessing" color="orange" style="margin-left: 8px;">退款处理中</a-tag>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 订单详情抽屉 -->
    <a-drawer v-model:open="detailVisible" title="订单详情" width="550" placement="right">
      <template v-if="currentOrder">
        <a-descriptions bordered :column="1" size="small">
          <a-descriptions-item label="订单号">{{ currentOrder.orderNo }}</a-descriptions-item>
          <a-descriptions-item label="订单类型">
            <a-tag :color="currentOrder.orderType === 'MEMBER_CARD' ? 'gold' : 'blue'">{{ currentOrder.typeLabel }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="用户">{{ currentOrder.userName }}</a-descriptions-item>
          <a-descriptions-item label="商品">{{ currentOrder.itemName }}</a-descriptions-item>
          <a-descriptions-item label="原价">¥{{ currentOrder.originalPrice.toFixed(2) }}</a-descriptions-item>
          <a-descriptions-item label="优惠">{{ currentOrder.discount > 0 ? `-¥${currentOrder.discount.toFixed(2)}` : '无' }}</a-descriptions-item>
          <a-descriptions-item label="实付">¥{{ currentOrder.actualPaid.toFixed(2) }}</a-descriptions-item>
          <a-descriptions-item v-if="currentOrder.refundAmount != null" label="退款金额">¥{{ currentOrder.refundAmount.toFixed(2) }}</a-descriptions-item>
          <a-descriptions-item label="下单时间">{{ currentOrder.createTime }}</a-descriptions-item>
          <a-descriptions-item label="支付时间">{{ currentOrder.payTime || '-' }}</a-descriptions-item>
          <a-descriptions-item v-if="currentOrder.refundTime" label="退款时间">{{ currentOrder.refundTime }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="statusColorMap[currentOrder.status]">{{ currentOrder.statusLabel }}</a-tag>
          </a-descriptions-item>
        </a-descriptions>

        <a-divider v-if="currentOrder.refundRecords.length || currentOrder.status === 'REFUNDING'">退款流水</a-divider>
        <div v-if="currentOrder.status === 'REFUNDING' && !currentOrder.refundRecords.length" class="refund-record">
          <div class="refund-record-meta">
            该订单为旧版退款，尚无退款流水。可主动查询网关结果；确认网关未退款后会回退为已支付，可重新发起。
          </div>
          <div class="refund-record-actions">
            <a-button
              v-perm="'order:refund'"
              type="link"
              size="small"
              :loading="refundQuerying === 'legacy'"
              @click="queryLegacyRefund(currentOrder.id)"
            >查询网关退款结果</a-button>
            <a-popconfirm title="仅在核实网关确实未退款时确认。确认后订单回退为已支付，可重新发起退款。" @confirm="confirmLegacyRefundFailed(currentOrder.id)">
              <a-button v-perm="'order:refund'" type="link" size="small" danger>确认未退款</a-button>
            </a-popconfirm>
          </div>
        </div>
        <div v-if="currentOrder.refundRecords.length" class="refund-records">
          <div v-for="r in currentOrder.refundRecords" :key="r.id" class="refund-record">
            <div class="refund-record-head">
              <span class="refund-record-amount">¥{{ Number(r.amountYuan).toFixed(2) }}</span>
              <a-tag :color="refundStatusColorMap[r.status] || 'default'">{{ refundStatusLabelMap[r.status] || r.status }}</a-tag>
            </div>
            <div class="refund-record-meta">
              {{ r.createdAt ? String(r.createdAt).replace('T', ' ').slice(0, 16) : '' }}
              <template v-if="r.reason"> · {{ r.reason }}</template>
              <template v-if="r.attempts > 1"> · 第 {{ r.attempts }} 次发起</template>
              <template v-if="r.operatorName"> · {{ r.operatorName }}</template>
            </div>
            <div v-if="r.gatewayRef" class="refund-record-meta">网关流水 {{ r.gatewayRef }}</div>
            <div v-if="r.failMessage" class="refund-record-fail">{{ r.failCode ? `[${r.failCode}] ` : '' }}{{ r.failMessage }}</div>
            <div v-if="r.status === 'UNKNOWN' || r.status === 'PROCESSING'" class="refund-record-actions">
              <a-button
                v-perm="'order:refund'"
                type="link"
                size="small"
                :loading="refundQuerying === r.id"
                @click="queryRefund(currentOrder.id, r)"
              >查询网关</a-button>
              <a-button v-perm="'order:refund'" type="link" size="small" @click="retryRefund(currentOrder.id, r)">重试退款</a-button>
              <a-popconfirm title="确认该笔退款在网关未发生？作废后可重新发起退款。" @confirm="confirmRefundFailed(currentOrder.id, r)">
                <a-button v-perm="'order:refund'" type="link" size="small" danger>确认未退款</a-button>
              </a-popconfirm>
            </div>
          </div>
        </div>

        <a-divider>操作记录</a-divider>
        <a-timeline>
          <a-timeline-item color="green">用户下单 · {{ currentOrder.createTime }}</a-timeline-item>
          <a-timeline-item v-if="currentOrder.payTime" color="blue">支付成功 · {{ currentOrder.payTime }}</a-timeline-item>
          <a-timeline-item v-if="currentOrder.status === 'REFUNDED'" color="red">退款完成 · {{ currentOrder.refundTime }}</a-timeline-item>
        </a-timeline>
      </template>
    </a-drawer>

    <!-- 强制退款弹窗 -->
    <a-modal v-model:open="refundVisible" title="强制退款" :confirm-loading="refunding" @ok="confirmForceRefund">
      <a-alert
        type="warning"
        show-icon
        message="强制退款用于处理特殊客诉，将原路退回微信，不受课程退款规则限制。若已配置审批人，需审批通过后才会执行退款。"
        style="margin-bottom: 16px;"
      />
      <a-form layout="vertical">
        <a-form-item label="订单">
          <span>{{ refundForm.orderNo }}（实付 ¥{{ refundForm.paid.toFixed(2) }}<template v-if="refundForm.refunded > 0"> · 已退 ¥{{ refundForm.refunded.toFixed(2) }} · 剩余可退 ¥{{ refundForm.remaining.toFixed(2) }}</template>）</span>
        </a-form-item>
        <a-form-item label="退款金额（元）">
          <a-input-number v-model:value="refundForm.amount" prefix="¥" style="width: 100%" :min="0" :max="refundForm.remaining" :placeholder="refundForm.refunded > 0 ? `留空则退剩余全部 ¥${refundForm.remaining.toFixed(2)}` : '留空则全额退'" />
        </a-form-item>
        <a-form-item label="退款原因" required>
          <a-input v-model:value="refundForm.reason" placeholder="如：客诉处理、重复支付" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  adminListOrders,
  forceRefundOrder,
  getRefundSummary,
  retryOrderRefund,
  confirmOrderRefundFailed,
  queryOrderRefund,
  queryLegacyOrderRefund,
  confirmLegacyOrderRefundFailed,
} from '@/api/order'

const route = useRoute()

const loading = ref(false)
const searchText = ref('')
const filterStatus = ref('')
const orderType = ref('ALL')
const orders = ref<any[]>([])

const statusColorMap: Record<string, string> = { PAID: 'green', COMPLETED: 'cyan', PENDING_PAYMENT: 'orange', REFUNDING: 'orange', REFUNDED: 'red', CANCELLED: 'default' }
const statusLabelMap: Record<string, string> = { PAID: '已支付', COMPLETED: '已完成', PENDING_PAYMENT: '待支付', REFUNDING: '退款中', REFUNDED: '已退款', CANCELLED: '已取消' }
const typeLabelMap: Record<string, string> = { COURSE: '课程', WAITLIST: '候补', MEMBER_CARD: '会员卡', COMMUNITY: '社群' }
const cardTypeLabelMap: Record<string, string> = { MONTHLY: '月卡', QUARTERLY: '季卡', YEARLY: '年卡' }
const refundStatusColorMap: Record<string, string> = { PROCESSING: 'orange', UNKNOWN: 'gold', SUCCESS: 'green', FAILED: 'red', CANCELLED: 'default' }
const refundStatusLabelMap: Record<string, string> = { PROCESSING: '受理中', UNKNOWN: '结果待确认', SUCCESS: '已到账', FAILED: '已失败', CANCELLED: '已作废' }

const columns = [
  { title: '订单号', dataIndex: 'orderNo', width: 200 },
  { title: '类型', dataIndex: 'type', width: 80 },
  { title: '用户', dataIndex: 'user', width: 120 },
  { title: '商品', dataIndex: 'itemName', width: 150 },
  { title: '金额', dataIndex: 'amount', width: 100 },
  { title: '下单时间', dataIndex: 'createTime', width: 160 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '操作', dataIndex: 'action', width: 80 },
]

/** 课程/候补/社群订单金额单位为分，会员卡订单单位为元 */
function toYuan(o: any, val: any) {
  const n = Number(val || 0)
  return o.orderType === 'MEMBER_CARD' ? n : n / 100
}

function mapOrder(o: any) {
  const originalPrice = toYuan(o, o.originalPrice)
  const actualPaid = toYuan(o, o.actualPaid)
  // 退款流水金额统一为分；仅按已到账（SUCCESS）流水累计
  const refunds: any[] = Array.isArray(o.refunds) ? o.refunds : []
  const refundedYuan = refunds
    .filter((r) => r.status === 'SUCCESS')
    .reduce((sum, r) => sum + Number(r.amountFen || 0), 0) / 100
  const refundProcessing = refunds.some((r) => r.status === 'PROCESSING' || r.status === 'UNKNOWN')
  return {
    id: o.id,
    orderNo: o.orderNo || o.id, // 优先使用自定义订单号
    orderType: o.orderType,
    typeLabel: typeLabelMap[o.orderType] || o.orderType,
    userName: o.user?.nickname || o.user?.phone || '用户',
    itemName: o.orderType === 'MEMBER_CARD'
      ? (cardTypeLabelMap[o.cardType] || '会员卡')
      : o.orderType === 'COMMUNITY'
        ? (o.community?.name || '社群年费')
        : (o.course?.title || '—'),
    originalPrice,
    actualPaid,
    discount: Math.max(0, originalPrice - actualPaid),
    status: o.status,
    statusLabel: statusLabelMap[o.status] || o.status,
    createTime: o.createdAt ? String(o.createdAt).replace('T', ' ').slice(0, 16) : '',
    payTime: o.paymentTime ? String(o.paymentTime).replace('T', ' ').slice(0, 16) : '',
    refundAmount: o.refundAmount == null ? null : toYuan(o, o.refundAmount),
    refundTime: o.refundTime ? String(o.refundTime).replace('T', ' ').slice(0, 16) : '',
    refundedYuan,
    refundProcessing,
    // 已支付/已完成、且没有进行中的退款流水时才允许发起强制退款（剩余可退在打开弹窗时按台账核对）
    forceRefundable: (o.status === 'PAID' || o.status === 'COMPLETED') && !refundProcessing,
    refundRecords: [] as any[],
  }
}

async function loadOrders() {
  loading.value = true
  try {
    const data: any = await adminListOrders({
      status: filterStatus.value || undefined,
      orderType: orderType.value === 'ALL' ? undefined : orderType.value,
      keyword: searchText.value || undefined,
    })
    orders.value = (Array.isArray(data) ? data : []).map(mapOrder)
    openFocusedOrder()
  } catch (e: any) {
    message.error(e?.message || '加载订单失败')
  } finally {
    loading.value = false
  }
}

/** 从待办中心「退款跟进」跳进来时，自动打开对应订单详情 */
let focusHandled = false
function openFocusedOrder() {
  if (focusHandled) return
  const focus = String(route.query.focus || '')
  if (!focus) return
  const hit = orders.value.find((o) => o.id === focus || o.orderNo === focus)
  if (!hit) return
  focusHandled = true
  showOrderDetail(hit)
}

onMounted(loadOrders)

const paidRevenue = computed(() => orders.value.filter(o => o.status === 'PAID' || o.status === 'COMPLETED').reduce((s, o) => s + o.actualPaid, 0))
const pendingCount = computed(() => orders.value.filter(o => o.status === 'PENDING_PAYMENT').length)
const refundCount = computed(() => orders.value.filter(o => o.status === 'REFUNDED').length)

const detailVisible = ref(false)
const currentOrder = ref<any>(null)
function showOrderDetail(record: any) {
  currentOrder.value = record
  detailVisible.value = true
  void loadRefundRecords(record)
}

/** 详情抽屉里的退款流水来自退款台账接口（含查询/重试/确认未退款操作） */
async function loadRefundRecords(record: any) {
  try {
    const summary: any = await getRefundSummary(record.id)
    record.refundRecords = summary?.refunds || []
    record.refundedYuan = Number(summary?.refundedFen || 0) / 100
    // 主动查询/确认失败后订单状态会变化，同步刷新抽屉与列表行
    if (summary?.orderStatus) {
      record.status = summary.orderStatus
      record.statusLabel = statusLabelMap[summary.orderStatus] || summary.orderStatus
    }
  } catch {
    record.refundRecords = []
  }
}

const refundQuerying = ref('')

/** 主动查询网关退款结果：解决回调丢失后订单长期停在「退款中」 */
async function queryRefund(orderId: string, refund: any) {
  refundQuerying.value = refund.id
  try {
    const res: any = await queryOrderRefund(orderId, refund.id)
    message.success(res?.message || '已查询网关退款结果')
    if (currentOrder.value) await loadRefundRecords(currentOrder.value)
    loadOrders()
  } catch {
    // 错误已由拦截器统一提示
  } finally {
    refundQuerying.value = ''
  }
}

/** 旧版退款（无流水）按订单查询网关结果 */
async function queryLegacyRefund(orderId: string) {
  refundQuerying.value = 'legacy'
  try {
    const res: any = await queryLegacyOrderRefund(orderId)
    message.success(res?.message || '已查询网关退款结果')
    if (currentOrder.value) await loadRefundRecords(currentOrder.value)
    loadOrders()
  } catch {
    // 错误已由拦截器统一提示
  } finally {
    refundQuerying.value = ''
  }
}

/** 旧版退款确认未发生：订单回退为已支付，可重新发起退款 */
async function confirmLegacyRefundFailed(orderId: string) {
  try {
    await confirmLegacyOrderRefundFailed(orderId)
    message.success('已确认该订单未退款，可重新发起')
    if (currentOrder.value) await loadRefundRecords(currentOrder.value)
    loadOrders()
  } catch {
    // 错误已由拦截器统一提示
  }
}

async function retryRefund(orderId: string, refund: any) {
  try {
    await retryOrderRefund(orderId, refund.id)
    message.success('已重新发起该笔退款，结果以网关回调为准')
    if (currentOrder.value) await loadRefundRecords(currentOrder.value)
    loadOrders()
  } catch {
    // 错误已由拦截器统一提示
  }
}

async function confirmRefundFailed(orderId: string, refund: any) {
  try {
    await confirmOrderRefundFailed(orderId, refund.id)
    message.success('该笔退款流水已作废，可重新发起退款')
    if (currentOrder.value) await loadRefundRecords(currentOrder.value)
    loadOrders()
  } catch {
    // 错误已由拦截器统一提示
  }
}

// 强制退款
const refundVisible = ref(false)
const refunding = ref(false)
const refundForm = ref({ id: '', orderNo: '', paid: 0, refunded: 0, remaining: 0, amount: null as number | null, reason: '' })

async function openForceRefund(record: any) {
  // 打开弹窗前先按退款台账核对：进行中的退款/已退完不允许再发起
  let summary: any = null
  try {
    summary = await getRefundSummary(record.id)
  } catch {
    // 台账加载失败不拦截操作，后端提交时仍会强制校验
  }
  if (summary && !summary.canForceRefund) {
    message.warning(summary.activeRefundId ? '该订单有退款正在处理，请等待结果或先处理该流水' : '该订单可退金额已退完')
    return
  }
  const refunded = summary ? Number(summary.refundedFen || 0) / 100 : record.refundedYuan || 0
  const remaining = summary ? Number(summary.remainingFen || 0) / 100 : Math.max(0, record.actualPaid - refunded)
  refundForm.value = {
    id: record.id,
    orderNo: record.orderNo,
    paid: record.actualPaid,
    refunded,
    remaining: remaining > 0 ? remaining : record.actualPaid,
    amount: null,
    reason: '',
  }
  refundVisible.value = true
}

async function confirmForceRefund() {
  if (!refundForm.value.reason) {
    message.warning('请填写退款原因')
    return
  }
  if (refundForm.value.amount != null && refundForm.value.amount > refundForm.value.remaining) {
    message.warning(`退款金额不能超过剩余可退 ¥${refundForm.value.remaining.toFixed(2)}`)
    return
  }
  refunding.value = true
  try {
    const res: any = await forceRefundOrder(refundForm.value.id, {
      amount: refundForm.value.amount ?? undefined,
      reason: refundForm.value.reason,
    })
    if (res?.pendingApproval) {
      message.success('退款申请已提交，需审批通过后执行')
    } else {
      message.success('已发起强制退款')
    }
    refundVisible.value = false
    loadOrders()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    refunding.value = false
  }
}
</script>

<style scoped>
.refund-records { display: flex; flex-direction: column; gap: 12px; }
.refund-record { padding: 12px; border: 1px solid #f0e9df; border-radius: 8px; background: #fdfbf7; }
.refund-record-head { display: flex; align-items: center; justify-content: space-between; }
.refund-record-amount { font-weight: 600; color: #C0392B; }
.refund-record-meta { margin-top: 4px; color: #999; font-size: 12px; }
.refund-record-fail { margin-top: 4px; color: #C0392B; font-size: 12px; }
.refund-record-actions { margin-top: 4px; padding-left: 0; }
</style>
