<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
      <h2 class="page-title">生产工单</h2>
      <a-button v-perm="'scm:production:create'" type="primary" @click="openCreate">
        <template #icon><PlusOutlined /></template>
        新建工单
      </a-button>
    </div>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 16px"
      message="按生效 BOM 领料生产：待领料 → 领料 → 完工入库。自产在领料时直接消耗材料；委外先把材料调拨到代工厂处，完工时在代工厂核销，成品入自有仓。创建工单按最新采购价快照成本，领料时按批次先进先出扣减并回写实际材料成本，之后改配方或调价都不影响已领料工单。完工时按成品保质期自动推算到期日。"
    />

    <a-card>
      <a-space style="margin-bottom: 16px" wrap>
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索工单号/成品/批号"
          style="width: 240px"
          allow-clear
          @search="load"
        />
        <a-select v-model:value="statusFilter" style="width: 130px" allow-clear placeholder="状态" @change="load">
          <a-select-option v-for="(meta, key) in PRODUCTION_STATUS_META" :key="key" :value="key">
            {{ meta.text }}
          </a-select-option>
        </a-select>
        <a-button @click="load">刷新</a-button>
      </a-space>

      <a-table
        :data-source="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :scroll="{ x: 1250 }"
        size="small"
        :pagination="{ pageSize: 10 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'product'">
            <div>{{ record.productName }}</div>
            <div class="sub-text">{{ record.productSpec }}</div>
          </template>
          <template v-else-if="column.key === 'qty'">
            {{ record.outputQty || '—' }} / {{ record.plannedQty }} {{ record.productUnit }}
          </template>
          <template v-else-if="column.key === 'mode'">
            <a-tag :color="record.mode === 'OUTSOURCE' ? 'orange' : 'blue'">
              {{ PRODUCTION_MODE_NAMES[record.mode as ProductionMode] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'route'">
            <div>{{ record.sourceLocationName }} → {{ record.outputLocationName }}</div>
            <div v-if="record.factoryLocationName" class="sub-text">
              代工：{{ record.factoryLocationName }}
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="PRODUCTION_STATUS_META[record.status as ScmProductionStatus]?.color">
              {{ PRODUCTION_STATUS_META[record.status as ScmProductionStatus]?.text }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'cost'">
            <template v-if="record.costVisible">¥{{ money(record.totalCost) }}</template>
            <span v-else class="sub-text">—</span>
          </template>
          <template v-else-if="column.key === 'createdAt'">{{ dt(record.createdAt) }}</template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="12">
              <a @click="openDetail(record)">详情</a>
              <a
                v-if="record.status === 'APPROVED'"
                v-perm="'scm:production:issue'"
                @click="doIssue(record)"
              >
                领料
              </a>
              <a
                v-if="record.status === 'ISSUED'"
                v-perm="'scm:production:complete'"
                @click="openComplete(record)"
              >
                完工
              </a>
              <a
                v-if="record.status === 'APPROVED'"
                v-perm="'scm:production:create'"
                class="danger-link"
                @click="doCancel(record)"
              >
                取消
              </a>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建工单 -->
    <a-modal
      v-model:open="createOpen"
      title="新建生产/委外工单"
      width="920px"
      :confirm-loading="saving"
      @ok="submitCreate"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="成品" required>
              <a-select
                v-model:value="form.productId"
                placeholder="选择成品"
                show-search
                option-filter-prop="label"
                @change="onProductChange"
              >
                <a-select-option
                  v-for="p in finishedOptions"
                  :key="p.id"
                  :value="p.id"
                  :label="`${p.code} ${p.name}`"
                >
                  {{ p.code }} · {{ p.name }}{{ p.spec ? ` / ${p.spec}` : '' }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="计划产量" required>
              <a-input-number
                v-model:value="form.plannedQty"
                :min="0"
                :precision="3"
                style="width: 100%"
                :addon-after="productUnit"
              />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item v-if="!activeBom && form.productId" label="配方状态">
          <a-alert type="warning" show-icon message="该成品还没有生效的 BOM，请先到「基础档案 › BOM 配方」维护。" />
        </a-form-item>
        <a-form-item v-else-if="activeBom" label="用料预览">
          <a-table
            :data-source="requiredPreview"
            :columns="previewColumns"
            row-key="componentId"
            size="small"
            :pagination="false"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'required'">
                {{ record.requiredQty }} {{ record.unit }}
              </template>
              <template v-else-if="column.key === 'available'">
                <span :class="{ 'danger-text': record.available < record.requiredQty }">
                  {{ record.available }} {{ record.unit }}
                </span>
              </template>
              <template v-else-if="column.key === 'cost'">
                <template v-if="activeBom.costVisible">¥{{ money(record.amount) }}</template>
                <span v-else class="sub-text">—</span>
              </template>
            </template>
          </a-table>
        </a-form-item>

        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="领料来源地点" required>
              <a-select v-model:value="form.sourceLocationId" placeholder="材料所在地点" show-search @change="loadSourceStock">
                <a-select-option v-for="loc in locations" :key="loc.id" :value="loc.id">
                  {{ loc.name }}（{{ LOCATION_TYPE_NAMES[loc.type] }}）
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="成品入库仓" required help="必须是自产/委外方名下的自有仓">
              <a-select v-model:value="form.outputLocationId" placeholder="选择自有仓" show-search>
                <a-select-option v-for="loc in ownLocations" :key="loc.id" :value="loc.id">
                  {{ loc.name }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="代工厂（委外时选）">
              <a-select v-model:value="form.factoryLocationId" placeholder="不选即自产" allow-clear show-search>
                <a-select-option v-for="loc in factoryLocations" :key="loc.id" :value="loc.id">
                  {{ loc.name }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="批号">
              <a-input v-model:value="form.batchNo" placeholder="如 EO-202611-01" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="生产日期">
              <a-date-picker v-model:value="form.productionDate" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="有效期">
              <a-date-picker v-model:value="form.expiryDate" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="加工费（元）" help="委外时填代工厂加工费，计入成品成本">
              <a-input-number v-model:value="form.processingFee" :min="0" :precision="2" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="16">
            <a-form-item label="备注">
              <a-input v-model:value="form.remark" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 完工入库 -->
    <a-modal
      v-model:open="completeOpen"
      title="完工入库"
      width="560px"
      :confirm-loading="completing"
      @ok="submitComplete"
    >
      <template v-if="current">
        <a-descriptions :column="1" size="small" bordered style="margin-bottom: 16px">
          <a-descriptions-item label="工单">{{ current.id }}</a-descriptions-item>
          <a-descriptions-item label="成品">{{ current.productName }} {{ current.productSpec }}</a-descriptions-item>
          <a-descriptions-item label="计划产量">{{ current.plannedQty }} {{ current.productUnit }}</a-descriptions-item>
        </a-descriptions>
        <a-form layout="vertical">
          <a-form-item label="实际完工数量" required>
            <a-input-number v-model:value="completeForm.outputQty" :min="0" :precision="3" style="width: 100%" :addon-after="current.productUnit" />
          </a-form-item>
          <a-form-item label="批号" help="留空则沿用建单批号，仍为空时以工单号作为批号">
            <a-input v-model:value="completeForm.batchNo" />
          </a-form-item>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="生产日期" help="留空则按完工日期">
                <a-date-picker v-model:value="completeForm.productionDate" value-format="YYYY-MM-DD" style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="有效期" :help="completeExpiryHelp">
                <a-date-picker v-model:value="completeForm.expiryDate" value-format="YYYY-MM-DD" style="width: 100%" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-alert
            v-if="completeShelfLife > 0"
            type="info"
            show-icon
            style="margin-bottom: 16px"
            :message="`该成品保质期 ${completeShelfLife} 天，填生产日期后会自动推算有效期；手工填写则优先使用手工值。`"
          />
          <a-alert
            v-else
            type="warning"
            show-icon
            style="margin-bottom: 16px"
            message="该成品未维护保质期，完工入库不会自动生成到期日。可到「基础档案 › 商品档案」补充保质期。"
          />
          <a-form-item label="备注">
            <a-textarea v-model:value="completeForm.remark" :rows="2" />
          </a-form-item>
        </a-form>
      </template>
    </a-modal>

    <!-- 详情 -->
    <a-modal v-model:open="detailOpen" title="生产工单详情" width="900px" :footer="null">
      <template v-if="current">
        <a-descriptions :column="3" size="small" bordered>
          <a-descriptions-item label="工单号">{{ current.id }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="PRODUCTION_STATUS_META[current.status as ScmProductionStatus]?.color">
              {{ PRODUCTION_STATUS_META[current.status as ScmProductionStatus]?.text }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="模式">
            {{ PRODUCTION_MODE_NAMES[current.mode as ProductionMode] }}
          </a-descriptions-item>
          <a-descriptions-item label="成品">{{ current.productName }} {{ current.productSpec }}</a-descriptions-item>
          <a-descriptions-item label="BOM 版本">v{{ current.bomVersion }}</a-descriptions-item>
          <a-descriptions-item label="批号">{{ current.batchNo || '—' }}</a-descriptions-item>
          <a-descriptions-item label="计划产量">{{ current.plannedQty }} {{ current.productUnit }}</a-descriptions-item>
          <a-descriptions-item label="完工产量">{{ current.outputQty || '—' }} {{ current.productUnit }}</a-descriptions-item>
          <a-descriptions-item label="单位成本">
            <template v-if="current.costVisible">¥{{ current.unitCost }}</template>
            <span v-else>—</span>
          </a-descriptions-item>
          <a-descriptions-item label="领料地点">{{ current.sourceLocationName }}</a-descriptions-item>
          <a-descriptions-item label="入库地点">{{ current.outputLocationName }}</a-descriptions-item>
          <a-descriptions-item label="代工厂">{{ current.factoryLocationName || '自产' }}</a-descriptions-item>
          <a-descriptions-item label="材料成本">
            <template v-if="current.costVisible">¥{{ money(current.materialCost) }}</template>
            <span v-else>—</span>
          </a-descriptions-item>
          <a-descriptions-item label="加工费">
            <template v-if="current.costVisible">¥{{ money(current.processingFee) }}</template>
            <span v-else>—</span>
          </a-descriptions-item>
          <a-descriptions-item label="总成本">
            <template v-if="current.costVisible">¥{{ money(current.totalCost) }}</template>
            <span v-else>—</span>
          </a-descriptions-item>
          <a-descriptions-item label="生产日期">{{ current.productionDate ? current.productionDate.slice(0, 10) : '—' }}</a-descriptions-item>
          <a-descriptions-item label="有效期">{{ current.expiryDate ? current.expiryDate.slice(0, 10) : '—' }}</a-descriptions-item>
          <a-descriptions-item label="创建人">{{ current.createdByName || current.createdBy }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="3">{{ current.remark || '—' }}</a-descriptions-item>
        </a-descriptions>

        <a-table
          :data-source="current.items"
          :columns="detailItemColumns"
          row-key="componentId"
          size="small"
          :pagination="false"
          style="margin-top: 16px"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'required'">{{ record.requiredQty }} {{ record.unit }}</template>
            <template v-else-if="column.key === 'issued'">{{ record.issuedQty }} {{ record.unit }}</template>
            <template v-else-if="column.key === 'unitPrice'">
              <template v-if="current.costVisible">¥{{ record.unitPrice }}</template>
              <span v-else class="sub-text">—</span>
            </template>
            <template v-else-if="column.key === 'amount'">
              <template v-if="current.costVisible">¥{{ money(record.amount) }}</template>
              <span v-else class="sub-text">—</span>
            </template>
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
  cancelProductionOrder,
  completeProductionOrder,
  createProductionOrder,
  issueProductionOrder,
  listBoms,
  listLocations,
  listProductionOrders,
  listProducts,
  listStock,
} from '@/api/scm'
import type { BomItem, ProductionOrder, ScmBom, ScmLocation, ScmProduct, StockRow } from '@/api/scm'
import type { ProductionMode, ScmProductionStatus } from '@fullyu/shared'
import {
  LOCATION_TYPE_NAMES,
  PRODUCTION_MODE_NAMES,
  PRODUCTION_STATUS_META,
} from '@fullyu/shared'
import { dt, money } from '@/utils/format'

const rows = ref<ProductionOrder[]>([])
const loading = ref(false)
const keyword = ref('')
const statusFilter = ref<ScmProductionStatus | undefined>(undefined)
const current = ref<ProductionOrder | null>(null)

const locations = ref<ScmLocation[]>([])
const products = ref<ScmProduct[]>([])
/** 领料地点决定物权组织，成品仓与代工厂只能从同一物权下选，避免提交后才报错 */
const sourceOwnerOrgId = computed(
  () => locations.value.find((loc) => loc.id === form.sourceLocationId)?.orgId ?? null,
)
const ownLocations = computed(() =>
  locations.value.filter(
    (loc) => loc.type === 'OWN' && (!sourceOwnerOrgId.value || loc.orgId === sourceOwnerOrgId.value),
  ),
)
const factoryLocations = computed(() =>
  locations.value.filter(
    (loc) => loc.type === 'FACTORY' && (!sourceOwnerOrgId.value || loc.orgId === sourceOwnerOrgId.value),
  ),
)
const finishedOptions = computed(() =>
  products.value.filter((p) => p.type !== 'RAW' && p.type !== 'PACK'),
)

const columns = [
  { title: '工单号', dataIndex: 'id', width: 170 },
  { title: '成品', key: 'product', width: 190 },
  { title: '完工/计划', key: 'qty', width: 150 },
  { title: '模式', key: 'mode', width: 80 },
  { title: '地点', key: 'route', width: 250 },
  { title: '状态', key: 'status', width: 90 },
  { title: '总成本', key: 'cost', width: 110 },
  { title: '创建时间', key: 'createdAt', width: 150 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const },
]

const detailItemColumns = [
  { title: '组件', dataIndex: 'name', width: 180 },
  { title: '规格', dataIndex: 'spec' },
  { title: '单位用量', dataIndex: 'qtyPerUnit', width: 100 },
  { title: '应领', key: 'required', width: 120 },
  { title: '实领', key: 'issued', width: 120 },
  { title: '单价（领料后为实际）', key: 'unitPrice', width: 150 },
  { title: '成本', key: 'amount', width: 110 },
]

const previewColumns = computed(() => [
  { title: '组件', dataIndex: 'name', width: 200 },
  { title: '应领用量', key: 'required', width: 140 },
  { title: '来源可用', key: 'available', width: 140 },
  ...(productCostVisible.value ? [{ title: '成本', key: 'cost', width: 110 }] : []),
])

const productCostVisible = computed(() => activeBom.value?.costVisible ?? false)

const productUnit = computed(
  () => products.value.find((p) => p.id === form.productId)?.unit ?? '',
)

async function load() {
  loading.value = true
  try {
    rows.value = await listProductionOrders({
      keyword: keyword.value || undefined,
      status: statusFilter.value,
    })
  } catch (e: any) {
    message.error(e?.message || '生产工单加载失败')
  } finally {
    loading.value = false
  }
}

/* ===== 新建 ===== */
const createOpen = ref(false)
const saving = ref(false)
const activeBom = ref<ScmBom | null>(null)
const sourceStock = ref<StockRow[]>([])

const form = reactive({
  productId: undefined as string | undefined,
  plannedQty: 0,
  sourceLocationId: undefined as string | undefined,
  outputLocationId: undefined as string | undefined,
  factoryLocationId: undefined as string | undefined,
  batchNo: '',
  productionDate: undefined as string | undefined,
  expiryDate: undefined as string | undefined,
  processingFee: 0,
  remark: '',
})

const requiredPreview = computed(() => {
  if (!activeBom.value) return []
  return activeBom.value.items.map((item: BomItem) => {
    const requiredQty = roundQty(
      (Number(form.plannedQty) || 0) * item.qtyPerUnit * (1 + item.lossRate),
    )
    const available = roundQty(
      sourceStock.value.find((row) => row.productId === item.componentId)?.qty ?? 0,
    )
    return {
      componentId: item.componentId,
      name: item.name,
      unit: item.unit,
      requiredQty,
      available,
      amount: roundMoney(requiredQty * item.unitPrice),
    }
  })
})

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function openCreate() {
  form.productId = undefined
  form.plannedQty = 0
  form.sourceLocationId = undefined
  form.outputLocationId = undefined
  form.factoryLocationId = undefined
  form.batchNo = ''
  form.productionDate = undefined
  form.expiryDate = undefined
  form.processingFee = 0
  form.remark = ''
  activeBom.value = null
  sourceStock.value = []
  createOpen.value = true
}

async function onProductChange(productId: string) {
  if (!productId) {
    activeBom.value = null
    return
  }
  try {
    const boms = await listBoms({ productId, status: 'ACTIVE' })
    activeBom.value = boms[0] ?? null
    const product = products.value.find((p) => p.id === productId)
    if (product && form.plannedQty <= 0) form.plannedQty = 1
  } catch {
    activeBom.value = null
  }
}

async function loadSourceStock(locationId: string) {
  // 切换物权组织后，旧的成品仓/代工厂可能已不匹配，清空重选
  form.outputLocationId = ownLocations.value.length === 1 ? ownLocations.value[0].id : undefined
  form.factoryLocationId = undefined
  try {
    sourceStock.value = locationId ? await listStock({ warehouseId: locationId }) : []
  } catch {
    sourceStock.value = []
  }
}

async function submitCreate() {
  if (!form.productId) return message.warning('请选择成品')
  if (!(Number(form.plannedQty) > 0)) return message.warning('计划产量必须大于 0')
  if (!activeBom.value) return message.warning('该成品没有生效的 BOM')
  if (!form.sourceLocationId) return message.warning('请选择领料来源地点')
  if (!form.outputLocationId) return message.warning('请选择成品入库仓')
  saving.value = true
  try {
    await createProductionOrder({
      productId: form.productId,
      plannedQty: Number(form.plannedQty),
      sourceLocationId: form.sourceLocationId,
      outputLocationId: form.outputLocationId,
      factoryLocationId: form.factoryLocationId,
      batchNo: form.batchNo,
      productionDate: form.productionDate,
      expiryDate: form.expiryDate,
      processingFee: Number(form.processingFee) || 0,
      remark: form.remark,
    })
    message.success('工单已创建，等待领料')
    createOpen.value = false
    await load()
  } catch (e: any) {
    message.error(e?.message || '创建失败')
  } finally {
    saving.value = false
  }
}

/* ===== 领料 / 完工 / 取消 ===== */
function doIssue(row: ProductionOrder) {
  Modal.confirm({
    title: '确认领料？',
    content:
      `${row.mode === 'OUTSOURCE' ? `将把工单所需材料从「${row.sourceLocationName}」调拨到「${row.factoryLocationName}」，材料物权不变。` : `将从「${row.sourceLocationName}」直接扣减工单所需材料，并记出库流水。`}系统按批次到期日先进先出扣减，领料后按实际批次成本重算本单材料成本。`,
    onOk: async () => {
      try {
        await issueProductionOrder(row.id)
        message.success('领料完成')
        await load()
      } catch (e: any) {
        message.error(e?.message || '领料失败，请检查库存是否充足')
      }
    },
  })
}

const completeOpen = ref(false)
const completing = ref(false)
const completeForm = reactive({
  outputQty: 0,
  batchNo: '',
  productionDate: undefined as string | undefined,
  expiryDate: undefined as string | undefined,
  remark: '',
})

/** 完工时按成品保质期推算到期日，与后端 createReceipt 的兜底逻辑保持一致 */
const completeShelfLife = computed(() => {
  const product = products.value.find((p) => p.id === current.value?.productId)
  return Math.max(0, Math.round(Number(product?.shelfLifeDays ?? 0)))
})

const completeAutoExpiry = computed(() => {
  if (completeShelfLife.value <= 0) return ''
  const base = completeForm.productionDate
    ? new Date(`${completeForm.productionDate}T00:00:00`)
    : new Date()
  if (Number.isNaN(base.getTime())) return ''
  base.setDate(base.getDate() + completeShelfLife.value)
  return base.toISOString().slice(0, 10)
})

const completeExpiryHelp = computed(() => {
  if (completeForm.expiryDate) return '已手工填写，优先于自动推算'
  return completeAutoExpiry.value ? `留空将自动推算为 ${completeAutoExpiry.value}` : '留空则按成品保质期自动推算'
})

function openComplete(row: ProductionOrder) {
  current.value = row
  completeForm.outputQty = row.plannedQty
  completeForm.batchNo = row.batchNo
  completeForm.productionDate = row.productionDate ? row.productionDate.slice(0, 10) : undefined
  completeForm.expiryDate = row.expiryDate ? row.expiryDate.slice(0, 10) : undefined
  completeForm.remark = ''
  completeOpen.value = true
}

async function submitComplete() {
  if (!current.value) return
  if (!(Number(completeForm.outputQty) > 0)) return message.warning('完工数量必须大于 0')
  completing.value = true
  try {
    await completeProductionOrder(current.value.id, {
      outputQty: Number(completeForm.outputQty),
      batchNo: completeForm.batchNo,
      productionDate: completeForm.productionDate,
      expiryDate: completeForm.expiryDate,
      remark: completeForm.remark,
    })
    message.success('已完工入库')
    completeOpen.value = false
    await load()
  } catch (e: any) {
    message.error(e?.message || '完工入库失败')
  } finally {
    completing.value = false
  }
}

function doCancel(row: ProductionOrder) {
  Modal.confirm({
    title: '取消该工单？',
    content: '只有尚未领料的工单可以取消；已领料工单请通过库存调整处理材料损耗。',
    okType: 'danger',
    onOk: async () => {
      try {
        await cancelProductionOrder(row.id)
        message.success('工单已取消')
        await load()
      } catch (e: any) {
        message.error(e?.message || '取消失败')
      }
    },
  })
}

/* ===== 详情 ===== */
const detailOpen = ref(false)

function openDetail(row: ProductionOrder) {
  current.value = row
  detailOpen.value = true
}

onMounted(async () => {
  try {
    const [locs, prods] = await Promise.all([listLocations(), listProducts({ enabled: true })])
    locations.value = locs
    products.value = prods
  } catch (e: any) {
    message.error(e?.message || '基础数据加载失败')
  }
  await load()
})
</script>

<style scoped>
.sub-text {
  color: #999;
  font-size: 12px;
}

.danger-text {
  color: #ff4d4f;
  font-weight: 600;
}

.danger-link {
  color: #ff4d4f;
}
</style>
