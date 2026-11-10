<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
      <h2 class="page-title">采购订单</h2>
      <a-button v-perm="'scm:po:create'" type="primary" @click="openCreate()">
        <template #icon><PlusOutlined /></template>
        发起采购申请
      </a-button>
    </div>

    <!-- 概览 -->
    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :xs="12" :md="6">
        <a-card><a-statistic title="全部单据" :value="list.length" suffix="单" /></a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card>
          <a-statistic title="审批中" :value="countOf('PENDING_APPROVAL')" suffix="单" :value-style="{ color: '#fa8c16' }" />
        </a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card>
          <a-statistic title="待收货" :value="countOf('APPROVED') + countOf('PARTIAL')" suffix="单" :value-style="{ color: '#1677ff' }" />
        </a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card>
          <a-statistic
            v-if="hasAnyPrice"
            title="采购总额"
            :value="visibleAmount"
            :precision="2"
            prefix="¥"
          />
          <a-statistic v-else title="采购总额" value="—" />
        </a-card>
      </a-col>
    </a-row>

    <a-card>
      <a-space style="margin-bottom: 16px" wrap>
        <a-select v-model:value="query.status" style="width: 140px" placeholder="全部状态" allow-clear @change="load">
          <a-select-option v-for="(v, k) in PO_STATUS_META" :key="k" :value="k">{{ v.text }}</a-select-option>
        </a-select>
        <a-select v-model:value="query.buyerId" style="width: 180px" placeholder="全部采购方" allow-clear @change="load">
          <a-select-option v-for="o in allOrgs" :key="o.id" :value="o.id">{{ o.shortName }}</a-select-option>
        </a-select>
        <a-input-search
          v-model:value="query.keyword"
          placeholder="搜索单号/供应商"
          style="width: 220px"
          allow-clear
          @search="load"
        />
        <a-button @click="load">查询</a-button>
      </a-space>

      <a-table
        :data-source="list"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :scroll="{ x: 1200 }"
        size="small"
        :pagination="{ pageSize: 10, showTotal: (t: number) => `共 ${t} 单` }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'buyer'">{{ record.buyerName || orgName(record.buyerId) }}</template>
          <template v-else-if="column.key === 'supplier'">
            <a-tag :color="record.supplierType === 'HQ' ? 'purple' : 'default'">
              {{ SUPPLIER_TYPE_NAMES[record.supplierType as PurchaseSupplierType] }}
            </a-tag>
            {{ record.supplierName }}
          </template>
          <template v-else-if="column.key === 'items'">{{ record.items.length }} 项</template>
          <template v-else-if="column.key === 'amount'">
            <template v-if="record.priceVisible">¥{{ money(record.totalAmount) }}</template>
            <span v-else class="sub-text">—</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="PO_STATUS_META[record.status as PurchaseOrderStatus].color">
              {{ PO_STATUS_META[record.status as PurchaseOrderStatus].text }}
            </a-tag>
            <div v-if="record.flowName" class="sub-text">{{ record.flowName }}</div>
          </template>
          <template v-else-if="column.key === 'createdAt'">{{ dt(record.createdAt) }}</template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="12">
              <a @click="openDetail(record)">详情</a>
              <a
                v-if="record.status === 'REJECTED' || record.status === 'CANCELLED'"
                v-perm="'scm:po:update'"
                @click="openCreate(record)"
              >
                重新提交
              </a>
              <a
                v-if="record.status === 'PENDING_APPROVAL' || record.status === 'APPROVED'"
                v-perm="'scm:po:cancel'"
                class="danger"
                @click="doCancel(record)"
              >
                作废
              </a>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 发起采购 -->
    <a-modal
      v-model:open="createOpen"
      :title="editing ? `修改后重新提交 ${editing.id}` : '发起采购申请'"
      width="860px"
      :confirm-loading="saving"
      @ok="submit"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="采购方" required>
              <a-select v-model:value="form.buyerId" @change="onBuyerChange">
                <a-select-option v-for="o in creatableOrgs" :key="o.id" :value="o.id">{{ o.shortName }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="供货方" required>
              <a-select v-model:value="form.supplierType" @change="onSupplierChange">
                <a-select-option v-for="(t, k) in allowedSupplierTypes" :key="k" :value="k">{{ t }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item v-if="form.supplierType === 'EXTERNAL'" label="供应商" required>
              <a-select v-model:value="form.supplierId" show-search option-filter-prop="label" :options="supplierOptions" />
            </a-form-item>
            <a-form-item v-else label="供货方说明">
              <a-input value="总部统一供货" disabled />
            </a-form-item>
          </a-col>
        </a-row>

        <a-alert
          v-if="!isHqBuyer"
          type="info"
          show-icon
          style="margin-bottom: 16px"
          message="门店/分公司只能向总部统一采购"
          description="供货价与单价由总部统一维护，这里只需填写采购数量。"
        />

        <a-form-item label="采购明细">
          <div v-for="(line, i) in form.items" :key="i" class="po-line">
            <a-select
              v-model:value="line.productId"
              style="width: 260px"
              placeholder="选择商品"
              show-search
              option-filter-prop="label"
              :options="productOptions"
              @change="() => onProductChange(line)"
            />
            <a-input-number v-model:value="line.qty" :min="1" :precision="0" placeholder="数量" style="width: 100px" />
            <a-input-number
              v-if="showFormPrice"
              v-model:value="line.price"
              :min="0"
              :precision="2"
              placeholder="单价（默认近期成交价）"
              style="width: 160px"
              :disabled="!canEditFormPrice"
            />
            <span v-if="showFormPrice" class="po-cell">小计 ¥{{ money((line.qty || 0) * (line.price || 0)) }}</span>
            <a class="danger" @click="form.items.splice(i, 1)">移除</a>
          </div>
          <a-button block type="dashed" @click="addLine">+ 添加商品</a-button>
        </a-form-item>

        <a-row :gutter="16">
          <a-col :span="16">
            <a-form-item label="备注">
              <a-input v-model:value="form.remark" placeholder="选填" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item v-if="showFormPrice" label="合计金额">
              <a-input :value="`¥${money(formAmount)}`" disabled />
            </a-form-item>
          </a-col>
        </a-row>

        <a-alert v-if="showFormPrice" type="info" show-icon :message="flowHint" />
      </a-form>
    </a-modal>

    <!-- 详情 -->
    <a-drawer v-model:open="detailOpen" title="采购单详情" width="680px">
      <template v-if="current">
        <a-descriptions :column="1" bordered size="small" style="margin-bottom: 16px">
          <a-descriptions-item label="单号">{{ current.id }}</a-descriptions-item>
          <a-descriptions-item label="采购方">{{ current.buyerName || orgName(current.buyerId) }}</a-descriptions-item>
          <a-descriptions-item label="供货方">
            {{ SUPPLIER_TYPE_NAMES[current.supplierType] }} · {{ current.supplierName }}
          </a-descriptions-item>
          <a-descriptions-item v-if="current.priceVisible" label="金额">¥{{ money(current.totalAmount) }}</a-descriptions-item>
          <a-descriptions-item label="申请人">{{ current.createdByName || current.createdBy }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="PO_STATUS_META[current.status].color">{{ PO_STATUS_META[current.status].text }}</a-tag>
            <span v-if="current.remark" style="color: #999; font-size: 12px">{{ current.remark }}</span>
          </a-descriptions-item>
        </a-descriptions>

        <a-table
          :data-source="current.items"
          :columns="itemColumns"
          row-key="productId"
          size="small"
          :pagination="false"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'price'">
              <template v-if="current?.priceVisible">¥{{ money(record.price) }}</template>
              <span v-else class="sub-text">—</span>
            </template>
            <template v-else-if="column.key === 'amount'">
              <template v-if="current?.priceVisible">¥{{ money(record.amount) }}</template>
              <span v-else class="sub-text">—</span>
            </template>
            <template v-else-if="column.key === 'received'">
              <span :class="{ done: record.receivedQty >= record.qty }">{{ record.receivedQty }}/{{ record.qty }}</span>
            </template>
          </template>
        </a-table>

        <div style="margin-top: 20px">
          <a-spin v-if="instLoading" />
          <ApprovalTimeline v-else-if="instance" :instance="instance" done-text="采购单生效，可验收入库" />
          <a-alert v-else type="success" show-icon message="该采购单未命中审批流，提交即生效" />
        </div>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { PO_STATUS_META, SUPPLIER_TYPE_NAMES, amountRangeText, sumPurchaseAmount } from '@fullyu/shared'
import type { PurchaseOrderStatus, PurchaseSupplierType } from '@fullyu/shared'
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  listProducts,
  listPurchaseOrders,
  listSuppliers,
  updatePurchaseOrder,
} from '@/api/scm'
import type { PurchaseOrder, ScmProduct } from '@/api/scm'
import { listOrgs } from '@/api/org'
import type { OrgNode } from '@/api/org'
import { getInstance, previewFlowRule } from '@/api/approval'
import type { ApprovalInstance } from '@/api/approval'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import { dt, money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const priceVisible = computed(() => auth.hasPerm('scm:po:price'))

const allOrgs = ref<OrgNode[]>([])
const orgName = (id: string) => allOrgs.value.find((o) => o.id === id)?.shortName ?? id

const list = ref<PurchaseOrder[]>([])
const loading = ref(false)
const query = reactive<{ status?: PurchaseOrderStatus; buyerId?: string; keyword?: string }>({})

const countOf = (status: PurchaseOrderStatus) => list.value.filter((o) => o.status === status).length
/** 汇总只看得到金额的单据，对外采购单在无权限时不计入 */
const hasAnyPrice = computed(() => list.value.some((o) => o.priceVisible))
const visibleAmount = computed(() =>
  list.value.filter((o) => o.priceVisible).reduce((s, o) => s + o.totalAmount, 0),
)

const columns = computed(() =>
  [
    { title: '单号', dataIndex: 'id', width: 160 },
    { title: '采购方', key: 'buyer', width: 120 },
    { title: '供货方', key: 'supplier', width: 220 },
    { title: '明细', key: 'items', width: 70 },
    // 向总部采购的单据金额对采购方可见，对外采购仍按权限裁剪
    { title: '金额', key: 'amount', width: 110 },
    { title: '申请人', dataIndex: 'createdByName', width: 100 },
    { title: '状态', key: 'status', width: 180 },
    { title: '提交时间', key: 'createdAt', width: 140 },
    { title: '操作', key: 'action', width: 150, fixed: 'right' },
  ],
)

const itemColumns = [
  { title: '商品', dataIndex: 'name' },
  { title: '规格', dataIndex: 'spec', width: 130 },
  { title: '数量', dataIndex: 'qty', width: 70 },
  { title: '单价', key: 'price', width: 90 },
  { title: '小计', key: 'amount', width: 100 },
  { title: '已收', key: 'received', width: 80 },
]

async function load() {
  loading.value = true
  try {
    list.value = await listPurchaseOrders({
      status: query.status,
      buyerId: query.buyerId,
      keyword: query.keyword || undefined,
    })
  } catch (e: any) {
    message.error(e?.message || '采购单加载失败')
  } finally {
    loading.value = false
  }
}

/* ===== 发起/重新提交 ===== */
interface PoLine {
  productId: string
  qty: number
  price: number
}

const createOpen = ref(false)
const saving = ref(false)
const editing = ref<PurchaseOrder | null>(null)
const products = ref<ScmProduct[]>([])
const productOptions = computed(() =>
  products.value.map((p) => ({
    value: p.id,
    label: `${p.name}${p.spec ? ` / ${p.spec}` : ''}（${p.unit}）`,
  })),
)
const supplierOptions = ref<{ value: string; label: string }[]>([])

const form = reactive({
  buyerId: '',
  supplierType: 'EXTERNAL' as PurchaseSupplierType,
  supplierId: undefined as string | undefined,
  remark: '',
  items: [] as PoLine[],
})

const formAmount = computed(() => sumPurchaseAmount(form.items))

/** 总部节点可对外采购；门店与分公司只能向总部订货 */
function isHqOrg(org?: OrgNode | null) {
  return org?.type === 'GROUP' || org?.type === 'DEPT'
}

const selectedBuyer = computed(() => allOrgs.value.find((o) => o.id === form.buyerId))
const isHqBuyer = computed(() => isHqOrg(selectedBuyer.value))

/** 可发起采购的组织；重新提交时把原采购方补进来，避免单子被数据范围收窄后选不到 */
const creatableOrgs = computed(() => {
  const rows = allOrgs.value.filter((o) => o.canPurchase)
  const original = editing.value
    ? allOrgs.value.find((o) => o.id === editing.value!.buyerId)
    : null
  if (original && !rows.some((o) => o.id === original.id)) rows.unshift(original)
  return rows
})

/** 只有总部对外采购时才能改实价，其余单价一律用档案价锁定 */
const canEditFormPrice = computed(
  () => priceVisible.value && isHqBuyer.value && form.supplierType === 'EXTERNAL',
)

/** 向总部采购时展示锁定后的供货价，方便申请人核对金额 */
const showFormPrice = computed(() => form.supplierType === 'HQ' || canEditFormPrice.value)

const allowedSupplierTypes = computed<Partial<Record<PurchaseSupplierType, string>>>(() =>
  isHqBuyer.value ? SUPPLIER_TYPE_NAMES : { HQ: SUPPLIER_TYPE_NAMES.HQ },
)

/** 对外采购默认带出该供应商最近一次成交价，没有历史时退回商品档案采购价 */
function basePriceOf(product: ScmProduct) {
  if (form.supplierType === 'HQ') return product.supplyPrice
  if (!canEditFormPrice.value) return 0
  return product.latestPurchasePrice ?? product.purchasePrice ?? 0
}

/** 切换采购方/供货方后，把明细价格重算成当前口径 */
function recalcLinePrices() {
  for (const line of form.items) {
    const hit = products.value.find((p) => p.id === line.productId)
    if (hit) line.price = basePriceOf(hit)
  }
}

function onBuyerChange() {
  if (!isHqBuyer.value && form.supplierType !== 'HQ') {
    form.supplierType = 'HQ'
    form.supplierId = undefined
  }
  recalcLinePrices()
  previewFlow()
}

function onSupplierChange() {
  form.supplierId = undefined
  recalcLinePrices()
  previewFlow()
}

function openCreate(row?: PurchaseOrder) {
  editing.value = row ?? null
  const defaultBuyer =
    creatableOrgs.value.find((o) => o.id === auth.org?.id) ?? creatableOrgs.value[0]
  const buyerId = row?.buyerId ?? defaultBuyer?.id ?? ''
  const buyer = allOrgs.value.find((o) => o.id === buyerId)
  const hqNode = isHqOrg(buyer)
  // 门店/分公司重新提交历史外部采购单时，只能改成向总部采购
  const supplierType: PurchaseSupplierType = hqNode
    ? (row?.supplierType ?? 'EXTERNAL')
    : 'HQ'
  Object.assign(form, {
    buyerId,
    supplierType,
    supplierId: supplierType === 'EXTERNAL' ? (row?.supplierId ?? undefined) : undefined,
    remark: row?.remark ?? '',
    items: row
      ? row.items.map((it) => ({ productId: it.productId, qty: it.qty, price: it.price }))
      : [],
  })
  if (!form.items.length) addLine()
  // 重新提交的历史单据可能带旧价，按当前口径覆盖一次
  if (!canEditFormPrice.value) recalcLinePrices()
  createOpen.value = true
  previewFlow()
}

function addLine() {
  form.items.push({ productId: '', qty: 1, price: 0 })
}

/** 选中商品后带出正确口径的价格：总部供货价固定，对外采购价需权限才可改 */
function onProductChange(line: PoLine) {
  const hit = products.value.find((p) => p.id === line.productId)
  if (hit) line.price = basePriceOf(hit)
  previewFlow()
}

/** 提交前告诉申请人这单会走哪条流程，免审也要说清楚 */
const flowHint = ref('填写明细后可预览命中的审批流程')
let previewTimer: number | undefined
function previewFlow() {
  window.clearTimeout(previewTimer)
  previewTimer = window.setTimeout(async () => {
    const amount = formAmount.value
    if (amount <= 0) {
      flowHint.value = '填写明细后可预览命中的审批流程'
      return
    }
    const org = allOrgs.value.find((o) => o.id === form.buyerId)
    try {
      const rule = await previewFlowRule({
        bizType: 'PURCHASE_ORDER',
        amount,
        scope: org && org.type === 'STORE' ? 'STORE' : 'HQ',
      })
      flowHint.value = rule
        ? `本单 ¥${money(amount)} 将走「${rule.name}」（${amountRangeText(rule.minAmount, rule.maxAmount)}），共 ${rule.nodes.length} 级审批`
        : `本单 ¥${money(amount)} 未命中任何审批流，提交后直接生效`
    } catch {
      flowHint.value = '审批流预览暂不可用，提交时以后端判定为准'
    }
  }, 300)
}

async function submit() {
  if (!form.buyerId) return message.warning('请选择采购方')
  if (!isHqBuyer.value && form.supplierType !== 'HQ')
    return message.warning('门店/分公司只能向总部统一采购')
  if (form.supplierType === 'EXTERNAL' && !form.supplierId) return message.warning('请选择供应商')
  const lines = form.items.filter((it) => it.productId && it.qty > 0)
  if (!lines.length) return message.warning('请至少添加一行采购明细')
  if (new Set(lines.map((it) => it.productId)).size !== lines.length)
    return message.warning('同一商品只能出现一行')

  const payload = {
    buyerId: form.buyerId,
    supplierType: form.supplierType,
    supplierId: form.supplierType === 'EXTERNAL' ? form.supplierId : undefined,
    remark: form.remark,
    // 门店向总部采购的单价由总部锁定，只有总部对外采购才上报实价
    items: lines.map((it) => ({
      productId: it.productId,
      qty: it.qty,
      price: canEditFormPrice.value ? it.price : undefined,
    })),
  }

  saving.value = true
  try {
    const res = editing.value
      ? await updatePurchaseOrder(editing.value.id, payload)
      : await createPurchaseOrder(payload)
    message.success(
      res.status === 'PENDING_APPROVAL'
        ? `已提交，流程「${res.flowName}」审批通过后可验收入库`
        : '本单未命中审批流，已直接生效，可验收入库',
    )
    createOpen.value = false
    await load()
  } catch (e: any) {
    message.error(e?.message || '提交失败')
  } finally {
    saving.value = false
  }
}

function doCancel(row: PurchaseOrder) {
  Modal.confirm({
    title: `作废采购单 ${row.id}？`,
    content: '作废后审批流程一并终止，已入库的部分不会回退。',
    okType: 'danger',
    async onOk() {
      try {
        await cancelPurchaseOrder(row.id)
        message.success('已作废')
        await load()
      } catch (e: any) {
        message.error(e?.message || '作废失败')
      }
    },
  })
}

/* ===== 详情 ===== */
const detailOpen = ref(false)
const current = ref<PurchaseOrder | null>(null)
const instance = ref<ApprovalInstance | null>(null)
const instLoading = ref(false)

async function openDetail(row: PurchaseOrder) {
  current.value = row
  instance.value = null
  detailOpen.value = true
  if (!row.approvalId) return
  instLoading.value = true
  try {
    instance.value = await getInstance(row.approvalId)
  } catch {
    // 无审批查看权限时只展示单据本身
    instance.value = null
  } finally {
    instLoading.value = false
  }
}

onMounted(async () => {
  const [orgs, prods, sups] = await Promise.allSettled([
    listOrgs(),
    listProducts({ enabled: true }),
    listSuppliers(),
  ])
  if (orgs.status === 'fulfilled') allOrgs.value = orgs.value
  if (prods.status === 'fulfilled') products.value = prods.value
  if (sups.status === 'fulfilled') {
    supplierOptions.value = sups.value
      .filter((s) => s.enabled)
      .map((s) => ({ value: s.id, label: s.name }))
  }
  await load()
})
</script>

<style scoped>
.po-line {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed #EDE5DB;
}
.po-cell {
  font-size: 12px;
  color: #8c8c8c;
  min-width: 100px;
}
.sub-text {
  font-size: 12px;
  color: #8c8c8c;
}
.done {
  color: #52c41a;
}
.danger {
  color: #f5222d;
}
</style>
