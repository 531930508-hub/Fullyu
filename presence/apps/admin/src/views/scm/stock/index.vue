<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
      <h2 class="page-title">库存管理</h2>
      <a-select
        v-model:value="warehouse"
        style="width: 260px"
        placeholder="全部库存地点"
        allow-clear
        show-search
        option-filter-prop="label"
        :options="locationOptions"
        @change="onLocationChange"
      />
    </div>

    <!-- 概览 -->
    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :xs="12" :md="6">
        <a-card><a-statistic title="在库品类" :value="rows.length" suffix="种" /></a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card><a-statistic title="库存总量" :value="totalQty" /></a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card>
          <a-statistic v-if="canViewCost" title="库存金额" :value="totalAmount" :precision="2" prefix="¥" />
          <a-statistic v-else title="库存金额" value="—" />
        </a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card>
          <a-statistic
            title="低于安全库存"
            :value="warnCount"
            suffix="种"
            :value-style="{ color: warnCount ? '#f5222d' : undefined }"
          />
        </a-card>
      </a-col>
    </a-row>

    <a-card>
      <a-tabs v-model:activeKey="tab">
        <!-- 库存结存 -->
        <a-tab-pane key="stock" tab="库存结存">
          <a-space style="margin-bottom: 16px" wrap>
            <a-input-search
              v-model:value="keyword"
              placeholder="搜索商品编码/名称"
              style="width: 220px"
              allow-clear
              @search="load"
            />
            <a-checkbox v-model:checked="onlyWarn">只看低于安全库存</a-checkbox>
            <a-button @click="load">刷新</a-button>
          </a-space>

          <a-table
            :data-source="displayRows"
            :columns="columns"
            :row-key="(r: StockRow) => `${r.warehouseId}-${r.productId}`"
            :loading="loading"
            :scroll="{ x: 1000 }"
            size="small"
            :pagination="{ pageSize: 10 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'warehouse'">
                <div class="location-cell">
                  <span>{{ record.warehouseName }}</span>
                  <a-tag v-if="record.locationType !== 'OWN'" color="purple">
                    {{ LOCATION_TYPE_NAMES[record.locationType as ScmLocationType] }}
                  </a-tag>
                </div>
              </template>
              <template v-else-if="column.key === 'qty'">
                <b :style="{ color: record.belowSafety ? '#f5222d' : undefined }">{{ record.qty }}</b>
                {{ record.unit }}
              </template>
              <template v-else-if="column.key === 'amount'">¥{{ money(record.amount) }}</template>
              <template v-else-if="column.key === 'state'">
                <a-tag :color="record.belowSafety ? 'red' : 'green'">
                  {{ record.belowSafety ? '需补货' : '充足' }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'updatedAt'">{{ dt(record.updatedAt) }}</template>
              <template v-else-if="column.key === 'action'">
                <a @click="openLedger(record)">流水</a>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <!-- 出入库流水 -->
        <a-tab-pane key="ledger" tab="出入库流水">
          <a-space style="margin-bottom: 16px" wrap>
            <a-select v-model:value="ledgerProductId" style="width: 220px" placeholder="全部商品" allow-clear @change="loadLedgers">
              <a-select-option v-for="p in productOptions" :key="p.value" :value="p.value">{{ p.label }}</a-select-option>
            </a-select>
            <a-button @click="loadLedgers">刷新</a-button>
          </a-space>
          <a-table
            :data-source="ledgers"
            :columns="ledgerColumns"
            row-key="id"
            :loading="ledgerLoading"
            :scroll="{ x: 900 }"
            size="small"
            :pagination="{ pageSize: 15 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'warehouse'">{{ record.warehouseName }}</template>
              <template v-else-if="column.key === 'type'">
                <a-tag :color="typeColor(record.type)">{{ LEDGER_TYPE_NAMES[record.type as StockLedgerType] }}</a-tag>
              </template>
              <template v-else-if="column.key === 'qty'">
                <span :class="{ plus: record.qty > 0, minus: record.qty < 0 }">
                  {{ record.qty > 0 ? '+' : '' }}{{ record.qty }}{{ record.unit }}
                </span>
              </template>
              <template v-else-if="column.key === 'createdAt'">{{ dt(record.createdAt) }}</template>
            </template>
          </a-table>
        </a-tab-pane>
        <!-- 批次与效期 -->
        <a-tab-pane key="batch" tab="批次与效期">
          <a-space style="margin-bottom: 16px" wrap>
            <a-input-search
              v-model:value="batchKeyword"
              placeholder="搜索商品编码/名称/批号"
              style="width: 240px"
              allow-clear
              @search="loadBatches"
            />
            <a-select
              v-model:value="batchStatus"
              style="width: 160px"
              placeholder="全部效期状态"
              allow-clear
              @change="loadBatches"
            >
              <a-select-option value="EXPIRING">临期（{{ batchSummary.warningDays }} 天内）</a-select-option>
              <a-select-option value="EXPIRED">已过期</a-select-option>
              <a-select-option value="OK">正常</a-select-option>
            </a-select>
            <a-button @click="loadBatches">刷新</a-button>
          </a-space>

          <a-row :gutter="16" style="margin-bottom: 16px">
            <a-col :xs="12" :md="6">
              <a-card><a-statistic title="在用批次" :value="batchSummary.total" suffix="批" /></a-card>
            </a-col>
            <a-col :xs="12" :md="6">
              <a-card>
                <a-statistic
                  title="临期批次"
                  :value="batchSummary.expiring"
                  suffix="批"
                  :value-style="{ color: batchSummary.expiring ? '#fa8c16' : undefined }"
                />
              </a-card>
            </a-col>
            <a-col :xs="12" :md="6">
              <a-card>
                <a-statistic
                  title="已过期批次"
                  :value="batchSummary.expired"
                  suffix="批"
                  :value-style="{ color: batchSummary.expired ? '#f5222d' : undefined }"
                />
              </a-card>
            </a-col>
            <a-col :xs="12" :md="6">
              <a-card>
                <a-statistic v-if="canViewCost" title="批次金额" :value="batchSummary.amount" :precision="2" prefix="¥" />
                <a-statistic v-else title="批次金额" value="—" />
              </a-card>
            </a-col>
          </a-row>

          <a-table
            :data-source="batchRows"
            :columns="batchColumns"
            row-key="id"
            :loading="batchLoading"
            :scroll="{ x: 1250 }"
            size="small"
            :pagination="{ pageSize: 10, showTotal: (t: number) => `共 ${t} 批` }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'warehouse'">{{ record.warehouseName }}</template>
              <template v-else-if="column.key === 'product'">
                <div>{{ record.name }}</div>
                <div class="sub-text">{{ record.code }}{{ record.spec ? ` / ${record.spec}` : '' }}</div>
              </template>
              <template v-else-if="column.key === 'batchNo'">
                <span v-if="record.batchNo">{{ record.batchNo }}</span>
                <span v-else class="sub-text">默认批次</span>
              </template>
              <template v-else-if="column.key === 'productionDate'">{{ dateOnly(record.productionDate) }}</template>
              <template v-else-if="column.key === 'expiryDate'">{{ dateOnly(record.expiryDate) }}</template>
              <template v-else-if="column.key === 'daysToExpiry'">
                <span v-if="record.daysToExpiry === null" class="sub-text">不管理</span>
                <span v-else :class="{ danger: record.daysToExpiry < 0, warning: record.daysToExpiry >= 0 && record.daysToExpiry <= batchSummary.warningDays }">
                  {{ expiryText(record.daysToExpiry) }}
                </span>
              </template>
              <template v-else-if="column.key === 'qty'">{{ record.qty }} {{ record.unit }}</template>
              <template v-else-if="column.key === 'unitCost'">
                <template v-if="canViewCost">¥{{ cost(record.unitCost) }}</template>
                <span v-else class="sub-text">—</span>
              </template>
              <template v-else-if="column.key === 'amount'">
                <template v-if="canViewCost">¥{{ money(record.amount) }}</template>
                <span v-else class="sub-text">—</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="BATCH_STATUS_META[record.status as ScmBatchStatus]?.color">
                  {{ BATCH_STATUS_META[record.status as ScmBatchStatus]?.text }}
                </a-tag>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { BATCH_STATUS_META, LEDGER_TYPE_NAMES, LOCATION_TYPE_NAMES } from '@fullyu/shared'
import type { ScmBatchStatus, ScmLocationType, StockLedgerType } from '@fullyu/shared'
import { listBatches, listLedgers, listLocations, listStock } from '@/api/scm'
import type {
  BatchSummary,
  ScmLocation,
  StockBatchRow,
  StockLedgerRow,
  StockRow,
} from '@/api/scm'
import { dt, money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const canViewCost = computed(() => auth.hasPerm('scm:stock:cost'))

/** 库存地点包含自有仓、供应商处、代工厂与在途，不再局限于组织仓库 */
const locations = ref<ScmLocation[]>([])
const locationOptions = computed(() =>
  locations.value.map((l) => ({
    value: l.id,
    label:
      l.type === 'OWN' ? l.name : `${l.name}（${LOCATION_TYPE_NAMES[l.type]}）`,
  })),
)

const tab = ref('stock')
const warehouse = ref<string | undefined>(undefined)
const keyword = ref('')
const onlyWarn = ref(false)

function onLocationChange() {
  load()
  loadLedgers()
  loadBatches()
}

/* ===== 库存结存 ===== */
const rows = ref<StockRow[]>([])
const loading = ref(false)

const displayRows = computed(() => (onlyWarn.value ? rows.value.filter((r) => r.belowSafety) : rows.value))
const totalQty = computed(() => rows.value.reduce((s, r) => s + r.qty, 0))
const totalAmount = computed(() => rows.value.reduce((s, r) => s + r.amount, 0))
const warnCount = computed(() => rows.value.filter((r) => r.belowSafety).length)

const columns = computed(() =>
  [
    { title: '库存地点', key: 'warehouse', width: 150 },
    { title: '编码', dataIndex: 'code', width: 110 },
    { title: '商品', dataIndex: 'name', width: 170 },
    { title: '规格', dataIndex: 'spec', width: 140 },
    { title: '当前库存', key: 'qty', width: 110 },
    { title: '安全库存', dataIndex: 'safetyStock', width: 90 },
    // 库存金额属敏感字段，无 scm:stock:cost 时整列不渲染
    ...(canViewCost.value ? [{ title: '库存金额', key: 'amount', width: 110 }] : []),
    { title: '状态', key: 'state', width: 90 },
    { title: '更新时间', key: 'updatedAt', width: 140 },
    { title: '操作', key: 'action', width: 70, fixed: 'right' },
  ],
)

/** 商品下拉直接从库存结存里去重，不额外拉一次商品档案 */
const productOptions = computed(() => {
  const map = new Map<string, string>()
  for (const r of rows.value) map.set(r.productId, `${r.name}${r.spec ? ` / ${r.spec}` : ''}`)
  return [...map].map(([value, label]) => ({ value, label }))
})

async function load() {
  loading.value = true
  try {
    rows.value = await listStock({
      warehouseId: warehouse.value || undefined,
      keyword: keyword.value || undefined,
    })
  } catch (e: any) {
    message.error(e?.message || '库存加载失败')
  } finally {
    loading.value = false
  }
}

/* ===== 流水 ===== */
const ledgers = ref<StockLedgerRow[]>([])
const ledgerLoading = ref(false)
const ledgerProductId = ref<string | undefined>(undefined)

const ledgerColumns = [
  { title: '时间', key: 'createdAt', width: 150 },
  { title: '库存地点', key: 'warehouse', width: 150 },
  { title: '商品', dataIndex: 'name', width: 180 },
  { title: '类型', key: 'type', width: 90 },
  { title: '批号', dataIndex: 'batchNo', width: 150 },
  { title: '数量', key: 'qty', width: 110 },
  { title: '关联单据', dataIndex: 'ref' },
]

const typeColor = (type: string) => (type === 'IN' ? 'green' : type === 'OUT' ? 'orange' : 'blue')

async function loadLedgers() {
  ledgerLoading.value = true
  try {
    ledgers.value = await listLedgers({
      warehouseId: warehouse.value || undefined,
      productId: ledgerProductId.value,
    })
  } catch (e: any) {
    message.error(e?.message || '流水加载失败')
  } finally {
    ledgerLoading.value = false
  }
}

/** 从结存行跳到该商品的流水，省去手选商品 */
function openLedger(row: StockRow) {
  ledgerProductId.value = row.productId
  tab.value = 'ledger'
  loadLedgers()
}

/* ===== 批次与效期 ===== */
const batchRows = ref<StockBatchRow[]>([])
const batchLoading = ref(false)
const batchKeyword = ref('')
const batchStatus = ref<ScmBatchStatus | undefined>(undefined)
const batchSummary = reactive<BatchSummary>({
  total: 0,
  expiring: 0,
  expired: 0,
  qty: 0,
  amount: 0,
  warningDays: 90,
})

const batchColumns = computed(() =>
  [
    { title: '库存地点', key: 'warehouse', width: 150 },
    { title: '商品', key: 'product', width: 200 },
    { title: '批号', key: 'batchNo', width: 150 },
    { title: '生产日期', key: 'productionDate', width: 110 },
    { title: '到期日', key: 'expiryDate', width: 110 },
    { title: '剩余效期', key: 'daysToExpiry', width: 110 },
    { title: '数量', key: 'qty', width: 100 },
    ...(canViewCost.value
      ? [
          { title: '单位成本', key: 'unitCost', width: 100 },
          { title: '批次金额', key: 'amount', width: 110 },
        ]
      : []),
    { title: '状态', key: 'status', width: 90 },
  ],
)

function dateOnly(value: string | null) {
  return value ? value.slice(0, 10) : '—'
}

function expiryText(days: number) {
  if (days < 0) return `已过期 ${-days} 天`
  if (days === 0) return '今天到期'
  return `${days} 天`
}

/** 单位成本可能低到 0.000001，保留有效小数但不显示无意义的尾零 */
function cost(value: number) {
  const text = Number(value ?? 0).toFixed(6)
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
}

async function loadBatches() {
  batchLoading.value = true
  try {
    const res = await listBatches({
      warehouseId: warehouse.value || undefined,
      keyword: batchKeyword.value || undefined,
      status: batchStatus.value,
    })
    batchRows.value = res.rows
    Object.assign(batchSummary, res.summary)
  } catch (e: any) {
    message.error(e?.message || '批次加载失败')
  } finally {
    batchLoading.value = false
  }
}

onMounted(async () => {
  try {
    locations.value = await listLocations()
  } catch (e: any) {
    message.error(e?.message || '库存地点加载失败')
  }
  await Promise.all([load(), loadLedgers(), loadBatches()])
})
</script>

<style scoped>
.location-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  line-height: 1.3;
}
.plus {
  color: #52c41a;
}
.minus {
  color: #f5222d;
}
.sub-text {
  color: #999;
  font-size: 12px;
}
.danger {
  color: #f5222d;
}
.warning {
  color: #fa8c16;
}
</style>
