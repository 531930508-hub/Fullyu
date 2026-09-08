<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
      <h2 class="page-title">库存调整</h2>
      <a-button v-perm="'scm:stock:adjust'" type="primary" :disabled="!warehouses.length" @click="openCreate">
        <template #icon><PlusOutlined /></template>
        新建调整单
      </a-button>
    </div>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 16px"
      message="盘盈盘亏与报损都在这里提交。账面数由系统按当前结存抓快照，你只填盘点后的实际数；调整单按影响金额命中审批流，审批通过（或免审）后才真正写库存与流水。"
    />

    <a-card>
      <a-space style="margin-bottom: 16px" wrap>
        <a-select v-model:value="query.warehouseId" style="width: 180px" placeholder="全部仓库" allow-clear @change="load">
          <a-select-option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.shortName }}</a-select-option>
        </a-select>
        <a-select v-model:value="query.status" style="width: 140px" placeholder="全部状态" allow-clear @change="load">
          <a-select-option v-for="(v, k) in ADJUST_STATUS_META" :key="k" :value="k">{{ v.text }}</a-select-option>
        </a-select>
        <a-button @click="load">刷新</a-button>
      </a-space>

      <a-table
        :data-source="list"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :scroll="{ x: 1100 }"
        size="small"
        :pagination="{ pageSize: 10 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'warehouse'">{{ orgName(record.warehouseId) }}</template>
          <template v-else-if="column.key === 'reason'">
            <a-tag :color="record.reason === 'PROFIT' ? 'green' : 'orange'">
              {{ ADJUST_REASON_NAMES[record.reason as StockAdjustReason] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'items'">{{ record.items.length }} 项</template>
          <template v-else-if="column.key === 'amount'">
            <span v-if="record.costVisible">¥{{ money(record.totalAmount) }}</span>
            <span v-else style="color: #999">—</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="ADJUST_STATUS_META[record.status as StockAdjustStatus].color">
              {{ ADJUST_STATUS_META[record.status as StockAdjustStatus].text }}
            </a-tag>
            <span v-if="record.flowName" style="color: #999; font-size: 12px">{{ record.flowName }}</span>
          </template>
          <template v-else-if="column.key === 'createdAt'">{{ dt(record.createdAt) }}</template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="12">
              <a @click="openDetail(record)">详情</a>
              <a
                v-if="record.status === 'PENDING_APPROVAL'"
                v-perm="'scm:stock:adjust'"
                class="danger"
                @click="doCancel(record)"
              >
                撤销
              </a>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建调整单 -->
    <a-modal
      v-model:open="createOpen"
      title="新建库存调整单"
      width="820px"
      :confirm-loading="saving"
      @ok="submit"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="仓库" required>
              <a-select v-model:value="form.warehouseId" @change="onWarehouseChange">
                <a-select-option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.shortName }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="调整原因" required>
              <a-select v-model:value="form.reason">
                <a-select-option v-for="(t, k) in ADJUST_REASON_NAMES" :key="k" :value="k">{{ t }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="说明">
              <a-input v-model:value="form.remark" placeholder="如 6月月末盘点" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="调整明细">
          <a-empty v-if="!stockOptions.length" description="该仓库暂无库存记录，先做一次采购入库再来盘点" />
          <template v-else>
            <div v-for="(line, i) in form.items" :key="i" class="adj-line">
              <a-select
                v-model:value="line.productId"
                style="width: 240px"
                placeholder="选择商品"
                show-search
                option-filter-prop="label"
                :options="stockOptions"
                @change="() => onProductChange(line)"
              />
              <span class="adj-cell">账面 {{ line.beforeQty }}</span>
              <a-input-number v-model:value="line.afterQty" :min="0" :precision="0" placeholder="实际数" style="width: 120px" />
              <span class="adj-cell" :class="{ minus: diffOf(line) < 0, plus: diffOf(line) > 0 }">
                差额 {{ diffOf(line) > 0 ? '+' : '' }}{{ diffOf(line) }}
              </span>
              <a class="danger" @click="form.items.splice(i, 1)">移除</a>
            </div>
            <a-button block type="dashed" @click="addLine">+ 添加一行</a-button>
            <div class="adj-tip">差额为 0 的行会被后端忽略；全部为 0 时无法提交。</div>
          </template>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 详情 -->
    <a-drawer v-model:open="detailOpen" title="调整单详情" width="620px">
      <template v-if="current">
        <a-descriptions :column="1" bordered size="small" style="margin-bottom: 16px">
          <a-descriptions-item label="单号">{{ current.id }}</a-descriptions-item>
          <a-descriptions-item label="仓库">{{ orgName(current.warehouseId) }}</a-descriptions-item>
          <a-descriptions-item label="原因">
            {{ ADJUST_REASON_NAMES[current.reason] }}
            <span v-if="current.remark" style="color: #999">· {{ current.remark }}</span>
          </a-descriptions-item>
          <a-descriptions-item v-if="current.costVisible" label="影响金额">¥{{ money(current.totalAmount) }}</a-descriptions-item>
          <a-descriptions-item label="提交人">{{ current.createdByName || current.createdBy }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="ADJUST_STATUS_META[current.status].color">{{ ADJUST_STATUS_META[current.status].text }}</a-tag>
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
            <template v-if="column.key === 'diffQty'">
              <span :class="{ minus: record.diffQty < 0, plus: record.diffQty > 0 }">
                {{ record.diffQty > 0 ? '+' : '' }}{{ record.diffQty }}
              </span>
            </template>
          </template>
        </a-table>

        <div style="margin-top: 20px">
          <a-spin v-if="instLoading" />
          <ApprovalTimeline v-else-if="instance" :instance="instance" done-text="库存已调整" />
          <a-alert v-else type="success" show-icon message="该调整单未命中审批流，提交即生效" />
        </div>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { ADJUST_REASON_NAMES, ADJUST_STATUS_META } from '@fullyu/shared'
import type { StockAdjustReason, StockAdjustStatus } from '@fullyu/shared'
import { cancelAdjust, createAdjust, listAdjusts, listStock } from '@/api/scm'
import type { StockAdjust } from '@/api/scm'
import { listOrgOptions } from '@/api/org'
import type { OrgOption } from '@/api/org'
import { getInstance } from '@/api/approval'
import type { ApprovalInstance } from '@/api/approval'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import { dt, money } from '@/utils/format'

const warehouses = ref<OrgOption[]>([])
const orgName = (id: string) => warehouses.value.find((w) => w.id === id)?.shortName ?? id

const list = ref<StockAdjust[]>([])
const loading = ref(false)
const query = reactive<{ warehouseId?: string; status?: StockAdjustStatus }>({})

const columns = [
  { title: '单号', dataIndex: 'id', width: 160 },
  { title: '仓库', key: 'warehouse', width: 120 },
  { title: '原因', key: 'reason', width: 90 },
  { title: '明细', key: 'items', width: 80 },
  { title: '影响金额', key: 'amount', width: 110 },
  { title: '提交人', dataIndex: 'createdByName', width: 100 },
  { title: '状态', key: 'status', width: 200 },
  { title: '提交时间', key: 'createdAt', width: 140 },
  { title: '操作', key: 'action', width: 110, fixed: 'right' },
]

const itemColumns = [
  { title: '商品', dataIndex: 'name' },
  { title: '单位', dataIndex: 'unit', width: 70 },
  { title: '账面数', dataIndex: 'beforeQty', width: 80 },
  { title: '实际数', dataIndex: 'afterQty', width: 80 },
  { title: '差额', key: 'diffQty', width: 80 },
]

async function load() {
  loading.value = true
  try {
    list.value = await listAdjusts({
      warehouseId: query.warehouseId,
      status: query.status,
    })
  } catch (e: any) {
    message.error(e?.message || '调整单加载失败')
  } finally {
    loading.value = false
  }
}

/* ===== 新建 ===== */
interface AdjustLine {
  productId: string
  beforeQty: number
  afterQty: number | undefined
}

const createOpen = ref(false)
const saving = ref(false)
const stockOptions = ref<{ value: string; label: string; qty: number }[]>([])
const form = reactive({
  warehouseId: '',
  reason: 'LOSS' as StockAdjustReason,
  remark: '',
  items: [] as AdjustLine[],
})

/** 账面数直接取该仓库的当前结存，避免让人手抄一遍 */
async function loadStockOptions(warehouseId: string) {
  if (!warehouseId) {
    stockOptions.value = []
    return
  }
  try {
    const rows = await listStock({ warehouseId })
    stockOptions.value = rows.map((r) => ({
      value: r.productId,
      label: `${r.name}${r.spec ? ` / ${r.spec}` : ''}（账面 ${r.qty}${r.unit}）`,
      qty: r.qty,
    }))
  } catch (e: any) {
    stockOptions.value = []
    message.error(e?.message || '库存结存加载失败')
  }
}

function openCreate() {
  Object.assign(form, {
    warehouseId: warehouses.value[0]?.id ?? '',
    reason: 'LOSS' as StockAdjustReason,
    remark: '',
    items: [],
  })
  createOpen.value = true
  loadStockOptions(form.warehouseId).then(() => addLine())
}

async function onWarehouseChange() {
  form.items = []
  await loadStockOptions(form.warehouseId)
  addLine()
}

function addLine() {
  if (!stockOptions.value.length) return
  form.items.push({ productId: '', beforeQty: 0, afterQty: undefined })
}

function onProductChange(line: AdjustLine) {
  const hit = stockOptions.value.find((o) => o.value === line.productId)
  line.beforeQty = hit?.qty ?? 0
  if (line.afterQty === undefined) line.afterQty = line.beforeQty
}

function diffOf(line: AdjustLine) {
  return (line.afterQty ?? line.beforeQty) - line.beforeQty
}

async function submit() {
  if (!form.warehouseId) return message.warning('请选择仓库')
  const lines = form.items.filter((it) => it.productId && it.afterQty !== undefined)
  if (!lines.length) return message.warning('请至少添加一行明细')
  if (new Set(lines.map((it) => it.productId)).size !== lines.length)
    return message.warning('同一商品只能出现一行')
  if (!lines.some((it) => diffOf(it) !== 0)) return message.warning('实际数与账面数一致，无需调整')

  saving.value = true
  try {
    const res = await createAdjust({
      warehouseId: form.warehouseId,
      reason: form.reason,
      remark: form.remark,
      items: lines.map((it) => ({ productId: it.productId, afterQty: it.afterQty as number })),
    })
    message.success(
      res.status === 'PENDING_APPROVAL'
        ? `已提交，流程「${res.flowName}」审批通过后写入库存`
        : '该金额未命中审批流，库存已直接调整',
    )
    createOpen.value = false
    await load()
  } catch (e: any) {
    message.error(e?.message || '提交失败')
  } finally {
    saving.value = false
  }
}

function doCancel(row: StockAdjust) {
  Modal.confirm({
    title: `撤销调整单 ${row.id}？`,
    content: '撤销后审批流程一并终止，库存不会有任何变化。',
    okType: 'danger',
    async onOk() {
      try {
        await cancelAdjust(row.id)
        message.success('已撤销')
        await load()
      } catch (e: any) {
        message.error(e?.message || '撤销失败')
      }
    },
  })
}

/* ===== 详情 ===== */
const detailOpen = ref(false)
const current = ref<StockAdjust | null>(null)
const instance = ref<ApprovalInstance | null>(null)
const instLoading = ref(false)

async function openDetail(row: StockAdjust) {
  current.value = row
  instance.value = null
  detailOpen.value = true
  if (!row.approvalId) return
  instLoading.value = true
  try {
    instance.value = await getInstance(row.approvalId)
  } catch {
    // 无审批查看权限时只展示单据本身，不弹错误吓人
    instance.value = null
  } finally {
    instLoading.value = false
  }
}

onMounted(async () => {
  try {
    warehouses.value = await listOrgOptions({ warehouse: 1 })
  } catch (e: any) {
    message.error(e?.message || '仓库列表加载失败')
  }
  await load()
})
</script>

<style scoped>
.adj-line {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed #EDE5DB;
}
.adj-cell {
  font-size: 12px;
  color: #8c8c8c;
  min-width: 76px;
}
.adj-cell.plus,
.plus {
  color: #52c41a;
}
.adj-cell.minus,
.minus {
  color: #f5222d;
}
.adj-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #8c8c8c;
}
.danger {
  color: #f5222d;
}
</style>
