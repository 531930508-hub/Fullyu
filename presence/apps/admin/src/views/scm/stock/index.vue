<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
      <h2 class="page-title">库存管理</h2>
      <a-radio-group v-if="warehouses.length > 1" v-model:value="warehouse" button-style="solid" @change="load">
        <a-radio-button value="">全部</a-radio-button>
        <a-radio-button v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.shortName }}</a-radio-button>
      </a-radio-group>
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
              <template v-if="column.key === 'warehouse'">{{ orgName(record.warehouseId) }}</template>
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
              <template v-if="column.key === 'warehouse'">{{ orgName(record.warehouseId) }}</template>
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
      </a-tabs>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { LEDGER_TYPE_NAMES } from '@fullyu/shared'
import type { StockLedgerType } from '@fullyu/shared'
import { listLedgers, listStock } from '@/api/scm'
import type { StockLedgerRow, StockRow } from '@/api/scm'
import { listOrgOptions } from '@/api/org'
import type { OrgOption } from '@/api/org'
import { dt, money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const canViewCost = computed(() => auth.hasPerm('scm:stock:cost'))

const warehouses = ref<OrgOption[]>([])
const orgName = (id: string) => warehouses.value.find((w) => w.id === id)?.shortName ?? id

const tab = ref('stock')
const warehouse = ref('')
const keyword = ref('')
const onlyWarn = ref(false)

/* ===== 库存结存 ===== */
const rows = ref<StockRow[]>([])
const loading = ref(false)

const displayRows = computed(() => (onlyWarn.value ? rows.value.filter((r) => r.belowSafety) : rows.value))
const totalQty = computed(() => rows.value.reduce((s, r) => s + r.qty, 0))
const totalAmount = computed(() => rows.value.reduce((s, r) => s + r.amount, 0))
const warnCount = computed(() => rows.value.filter((r) => r.belowSafety).length)

const columns = computed(() =>
  [
    { title: '仓库', key: 'warehouse', width: 110 },
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
  { title: '仓库', key: 'warehouse', width: 110 },
  { title: '商品', dataIndex: 'name', width: 180 },
  { title: '类型', key: 'type', width: 90 },
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

onMounted(async () => {
  try {
    warehouses.value = await listOrgOptions({ warehouse: 1 })
  } catch (e: any) {
    message.error(e?.message || '仓库列表加载失败')
  }
  await Promise.all([load(), loadLedgers()])
})
</script>

<style scoped>
.plus {
  color: #52c41a;
}
.minus {
  color: #f5222d;
}
</style>
