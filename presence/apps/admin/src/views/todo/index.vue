<template>
  <div class="page-container">
    <div class="page-header td-head">
      <div>
        <h2 class="page-title">待办中心</h2>
        <div class="td-sub">审批、退款跟进、入群审核、库存预警统一在这里处理</div>
      </div>
      <a-space wrap>
        <a-radio-group v-model:value="sourceTab" button-style="solid" size="small">
          <a-radio-button value="ALL">全部 {{ counts.all }}</a-radio-button>
          <a-radio-button v-if="canSee.approval" value="APPROVAL">审批 {{ counts.approval }}</a-radio-button>
          <a-radio-button v-if="canSee.refund" value="REFUND">退款 {{ counts.refund }}</a-radio-button>
          <a-radio-button v-if="canSee.community" value="COMMUNITY">社群 {{ counts.community }}</a-radio-button>
          <a-radio-button v-if="canSee.stock" value="STOCK">库存 {{ counts.stock }}</a-radio-button>
        </a-radio-group>
        <a-button size="small" :loading="loading" @click="load">
          <template #icon><ReloadOutlined /></template>
          刷新
        </a-button>
      </a-space>
    </div>

    <a-alert
      v-if="!hasAnySource"
      type="info"
      show-icon
      message="你当前没有审批、订单、社群或库存的处理权限。待办只展示与你权限相关的事项，如需处理请联系管理员开通。"
    />

    <a-card v-else :loading="loading">
      <a-empty v-if="!filteredItems.length" description="当前没有待处理事项" />
      <a-table
        v-else
        :data-source="filteredItems"
        :columns="columns"
        row-key="id"
        size="middle"
        :pagination="{ pageSize: 15, showSizeChanger: false }"
        :scroll="{ x: 980 }"
        :custom-row="rowProps"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'source'">
            <a-tag :color="sourceMeta(record.source).color">
              {{ sourceMeta(record.source).text }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'title'">
            <div class="td-title">{{ record.title }}</div>
            <div class="td-summary">{{ record.summary }}</div>
            <div v-if="record.hint" class="td-hint">{{ record.hint }}</div>
          </template>
          <template v-else-if="column.key === 'amount'">
            <span v-if="record.amount != null" class="td-amount">¥{{ money(record.amount) }}</span>
            <span v-else class="td-muted">—</span>
          </template>
          <template v-else-if="column.key === 'people'">
            <div>{{ record.requesterName || '—' }}</div>
            <div v-if="record.orgName" class="td-muted">{{ record.orgName }}</div>
          </template>
          <template v-else-if="column.key === 'node'">
            <span v-if="record.nodeText">{{ record.nodeText }}</span>
            <span v-else class="td-muted">—</span>
          </template>
          <template v-else-if="column.key === 'createdAt'">
            <span class="td-muted">{{ dt(record.createdAt) }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" @click.stop="handleItem(record)">
              {{ actionLabel(record) }}
            </a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- ===== 审批详情 ===== -->
    <a-drawer
      v-model:open="approvalOpen"
      title="审批详情"
      width="720"
      :body-style="{ paddingBottom: '24px' }"
      @close="clearFocus"
    >
      <a-spin :spinning="detailLoading">
        <template v-if="approvalDetail">
          <div class="td-detail-head">
            <a-tag :color="bizMeta(approvalDetail.instance.bizType).color">
              {{ bizMeta(approvalDetail.instance.bizType).text }}
            </a-tag>
            <a-tag :color="instanceStatusMeta(approvalDetail.instance.status).color">
              {{ instanceStatusMeta(approvalDetail.instance.status).text }}
            </a-tag>
            <span class="td-muted">{{ approvalDetail.instance.id }}</span>
          </div>
          <h3 class="td-detail-title">{{ approvalDetail.context.title }}</h3>
          <div class="td-detail-summary">{{ approvalDetail.instance.summary }}</div>

          <!-- 退款审批时把订单关键信息摆出来，避免审批人还要跳订单页核对 -->
          <div v-if="approvalDetail.context.order" class="td-order-card">
            <div class="td-order-head">
              <span class="td-order-no">{{ approvalDetail.context.order.orderNo }}</span>
              <a-tag :color="approvalDetail.context.order.status === 'REFUNDING' ? 'orange' : 'default'">
                {{ approvalDetail.context.order.statusLabel }}
              </a-tag>
            </div>
            <div class="td-order-grid">
              <div><span class="td-muted">用户</span>{{ approvalDetail.context.order.userName }}</div>
              <div><span class="td-muted">商品</span>{{ approvalDetail.context.order.itemName }}</div>
              <div><span class="td-muted">实付</span>¥{{ money(approvalDetail.context.order.actualPaid) }}</div>
              <div>
                <span class="td-muted">已退</span>
                {{ approvalDetail.context.order.refundAmount == null ? '未退款' : `¥${money(approvalDetail.context.order.refundAmount)}` }}
              </div>
            </div>
          </div>

          <a-descriptions :column="2" bordered size="small" :label-style="{ width: '110px' }">
            <a-descriptions-item
              v-for="row in approvalDetail.context.rows"
              :key="row.label"
              :label="row.label"
            >
              {{ row.value }}
            </a-descriptions-item>
          </a-descriptions>

          <template v-if="approvalDetail.context.items.length">
            <a-divider orientation="left" style="margin: 20px 0 12px">明细</a-divider>
            <a-table
              :data-source="detailItems"
              :columns="itemColumns"
              size="small"
              row-key="key"
              :pagination="false"
              :scroll="{ x: 560 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'amount'">¥{{ money(record.amount) }}</template>
              </template>
            </a-table>
          </template>

          <a-divider orientation="left" style="margin: 20px 0 12px">审批进度</a-divider>
          <ApprovalTimeline :instance="approvalDetail.instance as any" />

          <div v-if="approvalDetail.canApprove" class="td-approve-box">
            <a-textarea
              v-model:value="comment"
              placeholder="审批意见（可选，驳回建议写明原因）"
              :rows="2"
              style="margin-bottom: 12px"
            />
            <a-space wrap>
              <a-button type="primary" :loading="deciding" @click="decide('APPROVE')">同意</a-button>
              <a-button danger :loading="deciding" @click="decide('REJECT')">驳回</a-button>
              <a-button v-if="approvalDetail.canCancel" :loading="deciding" @click="cancelCurrent">撤销申请</a-button>
            </a-space>
          </div>
          <template v-else>
            <a-alert
              v-if="approvalDetail.instance.status === 'PENDING'"
              type="info"
              show-icon
              :message="approvalDetail.reason || '当前不可表决'"
              style="margin-top: 16px"
            />
            <a-button
              v-if="approvalDetail.canCancel"
              danger
              style="margin-top: 16px"
              :loading="deciding"
              @click="cancelCurrent"
            >
              撤销申请
            </a-button>
          </template>

          <div v-if="approvalDetail.context.order" class="td-detail-foot">
            <a-button size="small" @click="goLink(`/sales/orders?focus=${approvalDetail.context.order?.id}`)">
              查看订单
            </a-button>
          </div>
          <div v-else-if="approvalDetail.context.link" class="td-detail-foot">
            <a-button size="small" @click="goLink(approvalDetail.context.link || '/todos')">查看业务单据</a-button>
          </div>
        </template>
      </a-spin>
    </a-drawer>

    <!-- ===== 退款跟进 ===== -->
    <a-drawer v-model:open="refundOpen" title="退款跟进" width="620" @close="clearFocus">
      <a-spin :spinning="detailLoading">
        <template v-if="refundDetail">
          <div class="td-detail-head">
            <a-tag color="volcano">退款中</a-tag>
            <span class="td-muted">{{ refundDetail.order.orderNo }}</span>
          </div>
          <h3 class="td-detail-title">{{ refundDetail.order.itemName }}</h3>
          <a-descriptions :column="1" bordered size="small">
            <a-descriptions-item label="用户">
              {{ refundDetail.order.userName }}
              <span v-if="refundDetail.order.userPhone" class="td-muted">（{{ refundDetail.order.userPhone }}）</span>
            </a-descriptions-item>
            <a-descriptions-item label="订单类型">{{ refundDetail.order.orderType }}</a-descriptions-item>
            <a-descriptions-item label="原价">¥{{ money(refundDetail.order.originalPrice) }}</a-descriptions-item>
            <a-descriptions-item label="实付">¥{{ money(refundDetail.order.actualPaid) }}</a-descriptions-item>
            <a-descriptions-item label="申请退款">
              {{ refundDetail.order.refundAmount == null ? '—' : `¥${money(refundDetail.order.refundAmount)}` }}
            </a-descriptions-item>
            <a-descriptions-item label="退款原因">{{ refundDetail.order.cancelReason || '—' }}</a-descriptions-item>
            <a-descriptions-item label="下单时间">{{ dt(refundDetail.order.createTime) }}</a-descriptions-item>
            <a-descriptions-item label="支付时间">{{ dt(refundDetail.order.payTime) }}</a-descriptions-item>
          </a-descriptions>

          <a-alert
            type="warning"
            show-icon
            style="margin-top: 16px"
            message="退款已提交支付网关，正在等待退款结果回调。请勿重复发起退款，到账后会由回调自动置为已退款。"
          />
          <a-alert
            v-if="refundDetail.pendingApprovalId"
            type="info"
            show-icon
            style="margin-top: 12px"
            message="该订单已有一笔强制退款审批在处理中，审批通过后会自动发起退款。"
          />
          <div class="td-detail-foot">
            <a-space>
              <a-button size="small" @click="goLink(refundDetail.link)">去订单页查看</a-button>
              <a-button
                v-if="refundDetail.pendingApprovalId"
                type="primary"
                size="small"
                @click="openApprovalById(refundDetail.pendingApprovalId)"
              >
                查看退款审批
              </a-button>
            </a-space>
          </div>
        </template>
      </a-spin>
    </a-drawer>

    <!-- ===== 入群审核 ===== -->
    <a-modal
      v-model:open="reviewOpen"
      title="审核入群申请"
      :confirm-loading="reviewing"
      :ok-button-props="{ disabled: !canManageCommunity }"
      ok-text="提交审核"
      @ok="submitReview"
    >
      <template v-if="reviewItem">
        <a-descriptions :column="1" bordered size="small" style="margin-bottom: 16px">
          <a-descriptions-item label="社群">{{ reviewItem.title }}</a-descriptions-item>
          <a-descriptions-item label="申请人">{{ reviewItem.requesterName }}</a-descriptions-item>
          <a-descriptions-item label="申请时间">{{ dt(reviewItem.createdAt) }}</a-descriptions-item>
          <a-descriptions-item label="申请理由">{{ reviewItem.summary }}</a-descriptions-item>
        </a-descriptions>
        <a-alert
          v-if="!canManageCommunity"
          type="info"
          show-icon
          message="你只有社群查看权限，审核操作需要「社群管理操作」权限。"
          style="margin-bottom: 12px"
        />
        <a-form layout="vertical">
          <a-form-item label="审核结果">
            <a-radio-group v-model:value="reviewForm.approved" :disabled="!canManageCommunity">
              <a-radio :value="true">通过</a-radio>
              <a-radio :value="false">驳回</a-radio>
            </a-radio-group>
          </a-form-item>
          <a-form-item label="审核备注">
            <a-textarea
              v-model:value="reviewForm.note"
              :rows="2"
              :disabled="!canManageCommunity"
              placeholder="选填，驳回时建议说明原因"
            />
          </a-form-item>
        </a-form>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import {
  BIZ_TYPE_META,
  INSTANCE_STATUS_META,
  TODO_SOURCE_META,
  type ApprovalDetailResult,
  type RefundDetailResult,
  type TodoCounts,
  type TodoItem,
  type TodoSource,
} from '@fullyu/shared'
import {
  approveTodo,
  cancelTodo,
  getTodoApproval,
  getTodoRefund,
  listTodos,
  rejectTodo,
} from '@/api/todo'
import { reviewJoinRequest } from '@/api/community'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import { useAuthStore } from '@/stores/auth'
import { dt, money } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const items = ref<TodoItem[]>([])
const counts = ref<TodoCounts>({ all: 0, approval: 0, refund: 0, community: 0, stock: 0 })
const sourceTab = ref<'ALL' | TodoSource>('ALL')

const canSee = computed(() => ({
  approval: auth.hasPerm('flow:todo:view'),
  refund: auth.hasPerm('order:view'),
  community: auth.hasPerm('community:view'),
  stock: auth.hasPerm('scm:stock:view'),
}))
const hasAnySource = computed(() => Object.values(canSee.value).some(Boolean))
const canManageCommunity = computed(() => auth.hasPerm('community:manage'))

const filteredItems = computed(() =>
  sourceTab.value === 'ALL' ? items.value : items.value.filter((i) => i.source === sourceTab.value),
)

const columns = [
  { title: '类型', key: 'source', width: 80 },
  { title: '事项', key: 'title', width: 300 },
  { title: '金额', key: 'amount', width: 110 },
  { title: '发起人 / 组织', key: 'people', width: 140 },
  { title: '当前节点', key: 'node', width: 150 },
  { title: '时间', key: 'createdAt', width: 140 },
  { title: '操作', key: 'action', width: 90 },
]

const itemColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '规格/说明', dataIndex: 'spec', key: 'spec' },
  { title: '数量', dataIndex: 'qty', key: 'qty', width: 80 },
  { title: '单价', dataIndex: 'price', key: 'price', width: 100 },
  { title: '小计', key: 'amount', width: 110 },
]

function bizMeta(bizType: string) {
  return BIZ_TYPE_META[bizType as keyof typeof BIZ_TYPE_META] || { text: bizType, color: 'default', amountLabel: '', desc: '' }
}
function instanceStatusMeta(status: string) {
  return INSTANCE_STATUS_META[status as keyof typeof INSTANCE_STATUS_META] || { text: status, color: 'default' }
}
function sourceMeta(source: string) {
  return TODO_SOURCE_META[source as TodoSource] || { text: source, color: 'default' }
}

function rowProps(record: TodoItem) {
  return { onClick: () => handleItem(record), style: 'cursor:pointer' }
}

function actionLabel(item: TodoItem) {
  if (item.source === 'APPROVAL') return auth.hasPerm('flow:todo:approve') ? '去审批' : '查看'
  if (item.source === 'REFUND') return '去跟进'
  if (item.source === 'COMMUNITY') return canManageCommunity.value ? '去审核' : '查看'
  return '去补货'
}

async function load() {
  loading.value = true
  try {
    const data = await listTodos()
    items.value = data.items || []
    counts.value = data.counts
    await openFocusedItem()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

/** 工作台/侧边栏带 focus 参数进来时，直接打开对应详情 */
let focusHandled = false
async function openFocusedItem() {
  if (focusHandled) return
  const focus = String(route.query.focus || '')
  if (!focus) return
  const item = items.value.find((i) => i.id === focus)
  if (!item) return
  focusHandled = true
  await handleItem(item)
}

function clearFocus() {
  if (!route.query.focus) return
  const query = { ...route.query }
  delete query.focus
  router.replace({ path: route.path, query })
}

/* ===== 审批详情 ===== */
const approvalOpen = ref(false)
const detailLoading = ref(false)
const deciding = ref(false)
const comment = ref('')
const approvalDetail = ref<ApprovalDetailResult | null>(null)
const detailItems = computed(() =>
  (approvalDetail.value?.context.items || []).map((it, i) => ({ ...it, key: `${i}-${it.name}` })),
)

/* ===== 退款详情 ===== */
const refundOpen = ref(false)
const refundDetail = ref<RefundDetailResult | null>(null)

/* ===== 入群审核 ===== */
const reviewOpen = ref(false)
const reviewing = ref(false)
const reviewItem = ref<TodoItem | null>(null)
const reviewForm = reactive({ approved: true, note: '' })

async function handleItem(item: TodoItem) {
  if (item.source === 'STOCK') {
    router.push(item.link || '/scm/stock')
    return
  }
  if (item.source === 'REFUND') {
    await openRefund(item.detailId)
    return
  }
  if (item.source === 'COMMUNITY') {
    reviewItem.value = item
    reviewForm.approved = true
    reviewForm.note = ''
    reviewOpen.value = true
    return
  }
  await openApproval(item.detailId)
}

async function openApproval(id: string) {
  approvalOpen.value = true
  detailLoading.value = true
  approvalDetail.value = null
  comment.value = ''
  try {
    approvalDetail.value = await getTodoApproval(id)
  } catch {
    approvalOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

async function openApprovalById(id: string) {
  refundOpen.value = false
  await openApproval(id)
}

async function openRefund(orderId: string) {
  refundOpen.value = true
  detailLoading.value = true
  refundDetail.value = null
  try {
    refundDetail.value = await getTodoRefund(orderId)
  } catch {
    refundOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

async function decide(action: 'APPROVE' | 'REJECT') {
  const current = approvalDetail.value
  if (!current) return
  if (action === 'REJECT' && !comment.value.trim()) {
    message.warning('驳回请填写审批意见，便于申请人修改')
    return
  }
  deciding.value = true
  try {
    const id = current.instance.id
    if (action === 'APPROVE') await approveTodo(id, comment.value.trim() || undefined)
    else await rejectTodo(id, comment.value.trim() || undefined)
    message.success(action === 'APPROVE' ? '已同意' : '已驳回')
    approvalOpen.value = false
    window.dispatchEvent(new CustomEvent('todo-updated'))
    await load()
  } catch {
    // 拦截器已提示
  } finally {
    deciding.value = false
  }
}

async function cancelCurrent() {
  const current = approvalDetail.value
  if (!current) return
  deciding.value = true
  try {
    await cancelTodo(current.instance.id)
    message.success('已撤销申请')
    approvalOpen.value = false
    window.dispatchEvent(new CustomEvent('todo-updated'))
    await load()
  } catch {
    // 拦截器已提示
  } finally {
    deciding.value = false
  }
}

async function submitReview() {
  if (!reviewItem.value) return
  reviewing.value = true
  try {
    await reviewJoinRequest(reviewItem.value.detailId, {
      approved: reviewForm.approved,
      note: reviewForm.note.trim() || undefined,
    })
    message.success(reviewForm.approved ? '已通过入群申请' : '已驳回入群申请')
    reviewOpen.value = false
    window.dispatchEvent(new CustomEvent('todo-updated'))
    await load()
  } catch {
    // 拦截器已提示
  } finally {
    reviewing.value = false
  }
}

function goLink(link: string) {
  router.push(link)
}

onMounted(load)
</script>

<style scoped>
.td-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.td-sub {
  margin-top: 4px;
  font-size: 13px;
  color: #7d665c;
}
.td-title {
  font-weight: 600;
  color: #4b3621;
}
.td-summary {
  margin-top: 2px;
  font-size: 13px;
  color: #7d665c;
}
.td-hint {
  margin-top: 2px;
  font-size: 12px;
  color: #a08a72;
}
.td-amount {
  font-weight: 600;
  color: #6b463c;
}
.td-muted {
  color: #999;
  font-size: 12px;
}
.td-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.td-detail-title {
  margin: 12px 0 4px;
  font-size: 18px;
  color: #4b3621;
}
.td-detail-summary {
  margin-bottom: 16px;
  font-size: 13px;
  color: #7d665c;
}
.td-order-card {
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid #ede5db;
  border-radius: 10px;
  background: #fdfaf6;
}
.td-order-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.td-order-no {
  font-weight: 600;
  color: #4b3621;
}
.td-order-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 16px;
  font-size: 13px;
  color: #4b3621;
}
.td-order-grid .td-muted {
  display: inline-block;
  min-width: 42px;
}
.td-approve-box {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed #ede5db;
}
.td-detail-foot {
  margin-top: 20px;
  text-align: right;
}
</style>
