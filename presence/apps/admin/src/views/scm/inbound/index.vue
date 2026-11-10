<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
      <h2 class="page-title">验收入库</h2>
      <a-button v-perm="'scm:inbound:create'" type="primary" :disabled="!receivable.length" @click="openReceive()">
        <template #icon><InboxOutlined /></template>
        执行验收
      </a-button>
    </div>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 16px"
      message="只有审批通过的采购单才会出现在待收货列表。支持分批收货：本次实收多少填多少，剩余的下次继续；实收不足时可填拒收数量与原因，采购单会停在「部分入库」。"
    />

    <!-- 待收货 -->
    <a-card title="待收货采购单" style="margin-bottom: 16px" :loading="receivableLoading">
      <a-empty v-if="!receivable.length" description="暂无待收货的采购单" />
      <a-table
        v-else
        :data-source="receivable"
        :columns="poColumns"
        row-key="id"
        :scroll="{ x: 900 }"
        size="small"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'supplier'">
            <a-tag :color="record.supplierType === 'HQ' ? 'purple' : 'default'">
              {{ SUPPLIER_TYPE_NAMES[record.supplierType as PurchaseSupplierType] }}
            </a-tag>
            {{ record.supplierName }}
          </template>
          <template v-else-if="column.key === 'progress'">
            <a-progress :percent="progressOf(record)" size="small" style="width: 120px" />
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="PO_STATUS_META[record.status as PurchaseOrderStatus].color">
              {{ PO_STATUS_META[record.status as PurchaseOrderStatus].text }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a v-perm="'scm:inbound:create'" @click="openReceive(record)">验收</a>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 入库记录 -->
    <a-card title="入库记录">
      <a-space style="margin-bottom: 16px" wrap>
        <a-select
          v-model:value="query.warehouseId"
          style="width: 220px"
          placeholder="全部库存地点"
          allow-clear
          show-search
          option-filter-prop="label"
          :options="locationOptions"
          @change="loadReceipts"
        />
        <a-button @click="loadReceipts">刷新</a-button>
      </a-space>
      <a-table
        :data-source="receipts"
        :columns="grColumns"
        row-key="id"
        :loading="receiptLoading"
        :scroll="{ x: 900 }"
        size="small"
        :pagination="{ pageSize: 10 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'warehouse'">{{ record.warehouseName }}</template>
          <template v-else-if="column.key === 'items'">{{ record.items.length }} 项</template>
          <template v-else-if="column.key === 'hasDiff'">
            <a-tag :color="record.hasDiff ? 'orange' : 'green'">{{ record.hasDiff ? '有差异' : '全部合格' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'createdAt'">{{ dt(record.createdAt) }}</template>
          <template v-else-if="column.key === 'action'">
            <a @click="openGrDetail(record)">详情</a>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 验收弹窗 -->
    <a-modal
      v-model:open="receiveOpen"
      title="验收入库"
      width="820px"
      :confirm-loading="saving"
      @ok="submitReceive"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="采购单" required>
              <a-select v-model:value="form.poId" @change="onPoChange">
                <a-select-option v-for="po in receivable" :key="po.id" :value="po.id">
                  {{ po.id }} · {{ po.supplierName }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="入库地点" help="默认入到采购方自有仓；料体寄存在供应商处时可改选供应商地点">
              <a-select
                v-model:value="form.warehouseId"
                allow-clear
                show-search
                option-filter-prop="label"
                placeholder="默认采购方自有仓"
                :options="locationOptions"
              />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="验收明细">
          <a-empty v-if="!form.items.length" description="请先选择采购单" />
          <div v-for="line in form.items" :key="line.productId" class="gr-item">
            <div class="gr-line">
              <div class="gr-name">
                {{ line.name }}
                <span class="gr-sub">已收 {{ line.receivedQty }} / 订购 {{ line.qty }}，待收 {{ line.pendingQty }}{{ line.unit }}</span>
              </div>
              <a-input-number
                v-model:value="line.acceptQty"
                :min="0"
                :max="line.pendingQty"
                :precision="3"
                placeholder="实收"
                style="width: 100px"
              />
              <a-input-number
                v-model:value="line.rejectQty"
                :min="0"
                :precision="3"
                placeholder="拒收"
                style="width: 100px"
              />
              <a-input v-model:value="line.reason" placeholder="差异原因" style="width: 200px" />
            </div>
            <div class="gr-batch">
              <a-input v-model:value="line.batchNo" placeholder="批号（留空按入库单号）" style="width: 220px" />
              <a-date-picker
                v-model:value="line.productionDate"
                value-format="YYYY-MM-DD"
                placeholder="生产日期"
                style="width: 150px"
              />
              <a-date-picker
                v-model:value="line.expiryDate"
                value-format="YYYY-MM-DD"
                placeholder="到期日（留空按保质期推算）"
                style="width: 230px"
              />
            </div>
          </div>
          <div v-if="form.items.length" class="gr-tip">
            实收为 0 的行不会入库；拒收数量仅作记录，不写入库存。批号与效期用于后续先到期先出与临期预警。
          </div>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 入库单详情 -->
    <a-drawer v-model:open="grDetailOpen" title="入库单详情" width="600px">
      <template v-if="grCurrent">
        <a-descriptions :column="1" bordered size="small" style="margin-bottom: 16px">
          <a-descriptions-item label="入库单号">{{ grCurrent.id }}</a-descriptions-item>
          <a-descriptions-item label="关联采购单">{{ grCurrent.poId }}</a-descriptions-item>
          <a-descriptions-item label="入库地点">{{ grCurrent.warehouseName }}</a-descriptions-item>
          <a-descriptions-item label="操作人">{{ grCurrent.operatorName || grCurrent.operator }}</a-descriptions-item>
          <a-descriptions-item label="入库时间">{{ dt(grCurrent.createdAt) }}</a-descriptions-item>
        </a-descriptions>
        <a-table
          :data-source="grCurrent.items"
          :columns="grItemColumns"
          row-key="productId"
          size="small"
          :pagination="false"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'batchNo'">{{ record.batchNo || '—' }}</template>
            <template v-else-if="column.key === 'expiryDate'">
              {{ record.expiryDate ? record.expiryDate.slice(0, 10) : '—' }}
            </template>
          </template>
        </a-table>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { InboxOutlined } from '@ant-design/icons-vue'
import { LOCATION_TYPE_NAMES, PO_STATUS_META, SUPPLIER_TYPE_NAMES } from '@fullyu/shared'
import type { PurchaseOrderStatus, PurchaseSupplierType } from '@fullyu/shared'
import { createReceipt, listLocations, listReceipts, listReceivableOrders } from '@/api/scm'
import type { GoodsReceipt, PurchaseOrder, ScmLocation } from '@/api/scm'
import { dt } from '@/utils/format'

const locations = ref<ScmLocation[]>([])
const locationOptions = computed(() =>
  locations.value.map((l) => ({
    value: l.id,
    label: l.type === 'OWN' ? l.name : `${l.name}（${LOCATION_TYPE_NAMES[l.type]}）`,
  })),
)

/* ===== 待收货 ===== */
const receivable = ref<PurchaseOrder[]>([])
const receivableLoading = ref(false)

const poColumns = [
  { title: '采购单号', dataIndex: 'id', width: 160 },
  { title: '供货方', key: 'supplier', width: 220 },
  { title: '申请人', dataIndex: 'createdByName', width: 100 },
  { title: '收货进度', key: 'progress', width: 150 },
  { title: '状态', key: 'status', width: 110 },
  { title: '操作', key: 'action', width: 80, fixed: 'right' },
]

function progressOf(po: PurchaseOrder) {
  const total = po.items.reduce((s, it) => s + it.qty, 0)
  const received = po.items.reduce((s, it) => s + it.receivedQty, 0)
  return total > 0 ? Math.round((received / total) * 100) : 0
}

async function loadReceivable() {
  receivableLoading.value = true
  try {
    receivable.value = await listReceivableOrders()
  } catch (e: any) {
    message.error(e?.message || '待收货采购单加载失败')
  } finally {
    receivableLoading.value = false
  }
}

/* ===== 入库记录 ===== */
const receipts = ref<GoodsReceipt[]>([])
const receiptLoading = ref(false)
const query = reactive<{ warehouseId?: string }>({})

const grColumns = [
  { title: '入库单号', dataIndex: 'id', width: 160 },
  { title: '采购单', dataIndex: 'poId', width: 160 },
  { title: '入库地点', key: 'warehouse', width: 150 },
  { title: '明细', key: 'items', width: 80 },
  { title: '验收结果', key: 'hasDiff', width: 110 },
  { title: '操作人', dataIndex: 'operatorName', width: 110 },
  { title: '入库时间', key: 'createdAt', width: 140 },
  { title: '操作', key: 'action', width: 80, fixed: 'right' },
]

const grItemColumns = [
  { title: '商品', dataIndex: 'name' },
  { title: '单位', dataIndex: 'unit', width: 70 },
  { title: '实收', dataIndex: 'acceptQty', width: 70 },
  { title: '拒收', dataIndex: 'rejectQty', width: 70 },
  { title: '批号', key: 'batchNo', width: 160 },
  { title: '到期日', key: 'expiryDate', width: 110 },
  { title: '差异原因', dataIndex: 'reason' },
]

async function loadReceipts() {
  receiptLoading.value = true
  try {
    receipts.value = await listReceipts({ warehouseId: query.warehouseId })
  } catch (e: any) {
    message.error(e?.message || '入库记录加载失败')
  } finally {
    receiptLoading.value = false
  }
}

/* ===== 执行验收 ===== */
interface GrLine {
  productId: string
  name: string
  unit: string
  qty: number
  receivedQty: number
  pendingQty: number
  acceptQty: number
  rejectQty: number
  reason: string
  batchNo: string
  productionDate: string | undefined
  expiryDate: string | undefined
}

const receiveOpen = ref(false)
const saving = ref(false)
const form = reactive({
  poId: '',
  warehouseId: undefined as string | undefined,
  items: [] as GrLine[],
})

function fillItems(poId: string) {
  const po = receivable.value.find((p) => p.id === poId)
  form.items = (po?.items ?? [])
    .map((it) => {
      const pendingQty = Math.max(0, it.qty - it.receivedQty)
      return {
        productId: it.productId,
        name: it.name,
        unit: it.unit,
        qty: it.qty,
        receivedQty: it.receivedQty,
        pendingQty,
        // 默认按待收数量全收，绝大多数情况下一次收齐
        acceptQty: pendingQty,
        rejectQty: 0,
        reason: '',
        batchNo: '',
        productionDate: undefined,
        expiryDate: undefined,
      }
    })
    .filter((it) => it.pendingQty > 0)
}

function openReceive(po?: PurchaseOrder) {
  form.poId = po?.id ?? receivable.value[0]?.id ?? ''
  form.warehouseId = undefined
  fillItems(form.poId)
  receiveOpen.value = true
}

function onPoChange() {
  fillItems(form.poId)
}

async function submitReceive() {
  if (!form.poId) return message.warning('请选择采购单')
  const lines = form.items.filter((it) => (it.acceptQty ?? 0) > 0 || (it.rejectQty ?? 0) > 0)
  if (!lines.length) return message.warning('请至少填写一行实收或拒收数量')
  if (form.items.some((it) => (it.acceptQty ?? 0) > it.pendingQty))
    return message.warning('实收数量不能超过待收数量')

  saving.value = true
  try {
    await createReceipt({
      poId: form.poId,
      warehouseId: form.warehouseId,
      items: lines.map((it) => ({
        productId: it.productId,
        acceptQty: it.acceptQty ?? 0,
        rejectQty: it.rejectQty ?? 0,
        reason: it.reason,
        batchNo: it.batchNo.trim() || undefined,
        productionDate: it.productionDate || undefined,
        expiryDate: it.expiryDate || undefined,
      })),
    })
    message.success('已入库，库存与流水已更新')
    receiveOpen.value = false
    await Promise.all([loadReceivable(), loadReceipts()])
  } catch (e: any) {
    message.error(e?.message || '入库失败')
  } finally {
    saving.value = false
  }
}

/* ===== 入库单详情 ===== */
const grDetailOpen = ref(false)
const grCurrent = ref<GoodsReceipt | null>(null)
function openGrDetail(gr: GoodsReceipt) {
  grCurrent.value = gr
  grDetailOpen.value = true
}

onMounted(async () => {
  try {
    locations.value = await listLocations()
  } catch (e: any) {
    message.error(e?.message || '库存地点加载失败')
  }
  await Promise.all([loadReceivable(), loadReceipts()])
})
</script>

<style scoped>
.gr-line {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed #EDE5DB;
}
.gr-name {
  flex: 1;
  min-width: 0;
}
.gr-sub {
  display: block;
  font-size: 12px;
  color: #8c8c8c;
}
.gr-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #8c8c8c;
}
</style>
