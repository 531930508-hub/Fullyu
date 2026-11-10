<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
      <h2 class="page-title">库存调拨</h2>
      <a-button v-perm="'scm:transfer:create'" type="primary" @click="openCreate">
        <template #icon><PlusOutlined /></template>
        新建调拨
      </a-button>
    </div>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 16px"
      message="调拨只改变库存的存放地点或物权组织，不产生收入与支出。提交即生效；撤销会写一对反向流水，调入方库存已被消耗时会因库存不足而拒绝撤销。"
    />

    <a-card>
      <a-space style="margin-bottom: 16px" wrap>
        <a-select
          v-model:value="filterLocation"
          style="width: 220px"
          allow-clear
          placeholder="按地点筛选"
          @change="load"
        >
          <a-select-option v-for="loc in locations" :key="loc.id" :value="loc.id">
            {{ loc.name }}
          </a-select-option>
        </a-select>
        <a-select v-model:value="filterStatus" style="width: 130px" allow-clear placeholder="状态" @change="load">
          <a-select-option value="COMPLETED">已生效</a-select-option>
          <a-select-option value="CANCELLED">已撤销</a-select-option>
        </a-select>
        <a-button @click="load">刷新</a-button>
      </a-space>

      <a-table
        :data-source="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :scroll="{ x: 1100 }"
        size="small"
        :pagination="{ pageSize: 10 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'route'">
            {{ record.fromLocationName }} → {{ record.toLocationName }}
          </template>
          <template v-else-if="column.key === 'summary'">
            <span class="summary-text">{{ summaryOf(record) }}</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="TRANSFER_STATUS_META[record.status as ScmTransferStatus]?.color">
              {{ TRANSFER_STATUS_META[record.status as ScmTransferStatus]?.text }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'createdAt'">{{ dt(record.createdAt) }}</template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="12">
              <a @click="openDetail(record)">详情</a>
              <a
                v-if="record.status === 'COMPLETED'"
                v-perm="'scm:transfer:create'"
                class="danger-link"
                @click="doCancel(record)"
              >
                撤销
              </a>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建调拨 -->
    <a-modal
      v-model:open="createOpen"
      title="新建库存调拨"
      width="860px"
      :confirm-loading="saving"
      @ok="submit"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="11">
            <a-form-item label="调出地点" required>
              <a-select v-model:value="form.fromLocationId" placeholder="选择调出地点" show-search @change="onFromChange">
                <a-select-option v-for="loc in locations" :key="loc.id" :value="loc.id">
                  {{ loc.name }}（{{ LOCATION_TYPE_NAMES[loc.type] }}）
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="2" style="text-align: center; line-height: 32px">→</a-col>
          <a-col :span="11">
            <a-form-item label="调入地点" required>
              <a-select v-model:value="form.toLocationId" placeholder="选择调入地点" show-search>
                <a-select-option
                  v-for="loc in locations.filter((l) => l.id !== form.fromLocationId)"
                  :key="loc.id"
                  :value="loc.id"
                >
                  {{ loc.name }}（{{ LOCATION_TYPE_NAMES[loc.type] }}）
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="调拨明细" required>
          <div v-for="(item, index) in form.items" :key="index" class="transfer-item-row">
            <a-select
              v-model:value="item.productId"
              placeholder="选择商品"
              show-search
              option-filter-prop="label"
              style="flex: 2.6"
            >
              <a-select-option
                v-for="p in productOptions"
                :key="p.id"
                :value="p.id"
                :label="`${p.code} ${p.name}`"
              >
                {{ p.code }} · {{ p.name }}{{ p.spec ? ` / ${p.spec}` : '' }} · 可调 {{ availableOf(p.id) }}{{ p.unit }}
              </a-select-option>
            </a-select>
            <a-input-number
              v-model:value="item.qty"
              :min="0"
              :precision="3"
              placeholder="数量"
              style="flex: 1"
            />
            <span class="unit-text">{{ unitOf(item.productId) }}</span>
            <a-button type="text" danger :disabled="form.items.length <= 1" @click="removeItem(index)">
              删除
            </a-button>
          </div>
          <a-button type="dashed" block style="margin-top: 8px" @click="addItem">
            <template #icon><PlusOutlined /></template>
            添加商品
          </a-button>
        </a-form-item>

        <a-form-item label="备注">
          <a-textarea v-model:value="form.remark" :rows="2" placeholder="如：总部补货至门店 / 材料发往代工厂" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 详情 -->
    <a-modal v-model:open="detailOpen" title="调拨单详情" width="820px" :footer="null">
      <template v-if="current">
        <a-descriptions :column="2" size="small" bordered>
          <a-descriptions-item label="调拨单号">{{ current.id }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="TRANSFER_STATUS_META[current.status as ScmTransferStatus]?.color">
              {{ TRANSFER_STATUS_META[current.status as ScmTransferStatus]?.text }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="调出地点">{{ current.fromLocationName }}</a-descriptions-item>
          <a-descriptions-item label="调入地点">{{ current.toLocationName }}</a-descriptions-item>
          <a-descriptions-item label="操作人">{{ current.createdByName || current.createdBy }}</a-descriptions-item>
          <a-descriptions-item label="时间">{{ dt(current.createdAt) }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="2">{{ current.remark || '—' }}</a-descriptions-item>
        </a-descriptions>

        <a-table
          :data-source="current.items"
          :columns="detailColumns"
          row-key="productId"
          size="small"
          :pagination="false"
          style="margin-top: 16px"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'qty'">{{ record.qty }} {{ record.unit }}</template>
          </template>
        </a-table>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Modal, message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import {
  cancelTransfer,
  createTransfer,
  listLocations,
  listStock,
  listTransfers,
} from '@/api/scm'
import type { ScmLocation, ScmTransfer, StockRow } from '@/api/scm'
import type { ScmTransferStatus } from '@fullyu/shared'
import { LOCATION_TYPE_NAMES, TRANSFER_STATUS_META } from '@fullyu/shared'
import { dt } from '@/utils/format'

const rows = ref<ScmTransfer[]>([])
const loading = ref(false)
const locations = ref<ScmLocation[]>([])
const stock = ref<StockRow[]>([])
const filterLocation = ref<string | undefined>(undefined)
const filterStatus = ref<ScmTransferStatus | undefined>(undefined)

const columns = [
  { title: '调拨单号', dataIndex: 'id', width: 160 },
  { title: '调拨路径', key: 'route', width: 280 },
  { title: '明细', key: 'summary' },
  { title: '状态', key: 'status', width: 90 },
  { title: '操作人', dataIndex: 'createdByName', width: 110 },
  { title: '时间', key: 'createdAt', width: 160 },
  { title: '操作', key: 'action', width: 110, fixed: 'right' as const },
]

const detailColumns = [
  { title: '商品', dataIndex: 'name', width: 220 },
  { title: '规格', dataIndex: 'spec' },
  { title: '数量', key: 'qty', width: 130 },
]

/** 只让选调出地点实际有结存的商品，避免选完才发现可调为 0 */
const productOptions = computed(() =>
  stock.value.map((row) => ({
    id: row.productId,
    code: row.code,
    name: row.name,
    spec: row.spec,
    unit: row.unit,
  })),
)

function summaryOf(row: ScmTransfer) {
  const text = row.items.map((it) => `${it.name} × ${it.qty}${it.unit}`).join('、')
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

async function load() {
  loading.value = true
  try {
    rows.value = await listTransfers({
      locationId: filterLocation.value,
      status: filterStatus.value,
    })
  } catch (e: any) {
    message.error(e?.message || '调拨单加载失败')
  } finally {
    loading.value = false
  }
}

/* ===== 新建 ===== */
const createOpen = ref(false)
const saving = ref(false)
const form = reactive({
  fromLocationId: undefined as string | undefined,
  toLocationId: undefined as string | undefined,
  remark: '',
  items: [{ productId: undefined as string | undefined, qty: 1 }],
})

function openCreate() {
  form.fromLocationId = undefined
  form.toLocationId = undefined
  form.remark = ''
  form.items = [{ productId: undefined, qty: 1 }]
  stock.value = []
  createOpen.value = true
}

function addItem() {
  form.items.push({ productId: undefined, qty: 1 })
}

function removeItem(index: number) {
  form.items.splice(index, 1)
}

function availableOf(productId: string) {
  return stock.value.find((row) => row.productId === productId)?.qty ?? 0
}

function unitOf(productId?: string) {
  return stock.value.find((row) => row.productId === productId)?.unit ?? ''
}

async function onFromChange(locationId: string) {
  try {
    stock.value = locationId ? await listStock({ warehouseId: locationId }) : []
  } catch {
    stock.value = []
  }
}

async function submit() {
  if (!form.fromLocationId) return message.warning('请选择调出地点')
  if (!form.toLocationId) return message.warning('请选择调入地点')
  if (form.fromLocationId === form.toLocationId) {
    return message.warning('调出与调入地点不能相同')
  }
  const items = form.items.filter((it) => it.productId)
  if (!items.length) return message.warning('请至少添加一条调拨明细')
  if (items.some((it) => !(Number(it.qty) > 0))) {
    return message.warning('调拨数量必须大于 0')
  }
  saving.value = true
  try {
    await createTransfer({
      fromLocationId: form.fromLocationId,
      toLocationId: form.toLocationId,
      remark: form.remark,
      items: items.map((it) => ({ productId: it.productId!, qty: Number(it.qty) })),
    })
    message.success('调拨已生效')
    createOpen.value = false
    await load()
  } catch (e: any) {
    message.error(e?.message || '调拨失败')
  } finally {
    saving.value = false
  }
}

/* ===== 详情 / 撤销 ===== */
const detailOpen = ref(false)
const current = ref<ScmTransfer | null>(null)

function openDetail(row: ScmTransfer) {
  current.value = row
  detailOpen.value = true
}

function doCancel(row: ScmTransfer) {
  Modal.confirm({
    title: '撤销这单调拨？',
    content: `将把 ${row.fromLocationName} → ${row.toLocationName} 的库存反向调回；若调入方库存已被消耗，撤销会失败。`,
    okType: 'danger',
    onOk: async () => {
      try {
        await cancelTransfer(row.id)
        message.success('已撤销并写回反向流水')
        await load()
      } catch (e: any) {
        message.error(e?.message || '撤销失败')
      }
    },
  })
}

onMounted(async () => {
  try {
    locations.value = await listLocations()
  } catch (e: any) {
    message.error(e?.message || '库存地点加载失败')
  }
  await load()
})
</script>

<style scoped>
.transfer-item-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.unit-text {
  width: 40px;
  color: #666;
}

.summary-text {
  color: #595959;
}

.danger-link {
  color: #ff4d4f;
}
</style>
