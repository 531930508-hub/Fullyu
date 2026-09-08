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
            </div>
          </template>
          <template v-if="column.dataIndex === 'status'">
            <a-tag :color="statusColorMap[record.status]">{{ record.statusLabel }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-button type="link" size="small" @click="showOrderDetail(record)">详情</a-button>
            <a-button v-perm="'order:refund'"
              v-if="record.status === 'PAID' || record.status === 'COMPLETED'"
              type="link"
              size="small"
              danger
              @click="openForceRefund(record)"
            >强制退款</a-button>
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
          <a-descriptions-item label="下单时间">{{ currentOrder.createTime }}</a-descriptions-item>
          <a-descriptions-item label="支付时间">{{ currentOrder.payTime || '-' }}</a-descriptions-item>
          <a-descriptions-item v-if="currentOrder.refundTime" label="退款时间">{{ currentOrder.refundTime }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="statusColorMap[currentOrder.status]">{{ currentOrder.statusLabel }}</a-tag>
          </a-descriptions-item>
        </a-descriptions>

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
          <span>{{ refundForm.orderNo }}（实付 ¥{{ refundForm.paid.toFixed(2) }}）</span>
        </a-form-item>
        <a-form-item label="退款金额（元）">
          <a-input-number v-model:value="refundForm.amount" prefix="¥" style="width: 100%" :min="0" :max="refundForm.paid" placeholder="留空则全额退" />
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
import { message } from 'ant-design-vue'
import { adminListOrders, forceRefundOrder } from '@/api/order'

const loading = ref(false)
const searchText = ref('')
const filterStatus = ref('')
const orderType = ref('ALL')
const orders = ref<any[]>([])

const statusColorMap: Record<string, string> = { PAID: 'green', COMPLETED: 'cyan', PENDING_PAYMENT: 'orange', REFUNDING: 'orange', REFUNDED: 'red', CANCELLED: 'default' }
const statusLabelMap: Record<string, string> = { PAID: '已支付', COMPLETED: '已完成', PENDING_PAYMENT: '待支付', REFUNDING: '退款中', REFUNDED: '已退款', CANCELLED: '已取消' }
const typeLabelMap: Record<string, string> = { COURSE: '课程', WAITLIST: '候补', MEMBER_CARD: '会员卡' }
const cardTypeLabelMap: Record<string, string> = { MONTHLY: '月卡', QUARTERLY: '季卡', YEARLY: '年卡' }

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

/** 课程/候补订单金额单位为分，会员卡订单单位为元 */
function toYuan(o: any, val: any) {
  const n = Number(val || 0)
  return o.orderType === 'MEMBER_CARD' ? n : n / 100
}

function mapOrder(o: any) {
  const originalPrice = toYuan(o, o.originalPrice)
  const actualPaid = toYuan(o, o.actualPaid)
  return {
    id: o.id,
    orderNo: o.orderNo || o.id, // 优先使用自定义订单号
    orderType: o.orderType,
    typeLabel: typeLabelMap[o.orderType] || o.orderType,
    userName: o.user?.nickname || o.user?.phone || '用户',
    itemName: o.orderType === 'MEMBER_CARD' ? (cardTypeLabelMap[o.cardType] || '会员卡') : (o.course?.title || '—'),
    originalPrice,
    actualPaid,
    discount: Math.max(0, originalPrice - actualPaid),
    status: o.status,
    statusLabel: statusLabelMap[o.status] || o.status,
    createTime: o.createdAt ? String(o.createdAt).replace('T', ' ').slice(0, 16) : '',
    payTime: o.paymentTime ? String(o.paymentTime).replace('T', ' ').slice(0, 16) : '',
    refundTime: o.refundTime ? String(o.refundTime).replace('T', ' ').slice(0, 16) : '',
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
  } catch (e: any) {
    message.error(e?.message || '加载订单失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadOrders)

const paidRevenue = computed(() => orders.value.filter(o => o.status === 'PAID' || o.status === 'COMPLETED').reduce((s, o) => s + o.actualPaid, 0))
const pendingCount = computed(() => orders.value.filter(o => o.status === 'PENDING_PAYMENT').length)
const refundCount = computed(() => orders.value.filter(o => o.status === 'REFUNDED').length)

const detailVisible = ref(false)
const currentOrder = ref<any>(null)
function showOrderDetail(record: any) { currentOrder.value = record; detailVisible.value = true }

// 强制退款
const refundVisible = ref(false)
const refunding = ref(false)
const refundForm = ref({ id: '', orderNo: '', paid: 0, amount: null as number | null, reason: '' })

function openForceRefund(record: any) {
  refundForm.value = { id: record.id, orderNo: record.orderNo, paid: record.actualPaid, amount: null, reason: '' }
  refundVisible.value = true
}

async function confirmForceRefund() {
  if (!refundForm.value.reason) {
    message.warning('请填写退款原因')
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
