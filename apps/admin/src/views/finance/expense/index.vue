<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px">
      <h2 class="page-title">月度支出台账</h2>
      <a-space>
        <a-button v-perm="'finance:expense:import'" @click="openImport">
          <template #icon><UploadOutlined /></template>
          批量导入
        </a-button>
        <a-button v-perm="'finance:expense:create'" type="primary" @click="openCreate">
          <template #icon><PlusOutlined /></template>
          录入支出
        </a-button>
      </a-space>
    </div>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 16px"
      message="单笔录入按金额走审批流（在「审批流程设置」里按单据类型配节点），只有已生效的支出才计入财务看板；房租与物业费按门店租金参数现算（「组织架构设置」里维护），管理费与培训费按组织比例现算，耗材成本取自采购单，这几类都不用在这里重复录入。"
    />

    <!-- 筛选 -->
    <a-card size="small" style="margin-bottom: 16px">
      <a-space wrap>
        <a-select v-model:value="filter.month" style="width: 130px" @change="load">
          <a-select-option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</a-select-option>
        </a-select>
        <a-select
          v-model:value="filter.orgId"
          style="width: 170px"
          placeholder="全部门店"
          allow-clear
          show-search
          option-filter-prop="label"
          :options="orgSelectOptions"
          @change="load"
        />
        <a-select v-model:value="filter.category" style="width: 140px" placeholder="全部科目" allow-clear @change="load">
          <a-select-option v-for="(text, key) in EXPENSE_CATEGORY_NAMES" :key="key" :value="key">{{ text }}</a-select-option>
        </a-select>
        <a-select v-model:value="filter.status" style="width: 130px" placeholder="全部状态" allow-clear @change="load">
          <a-select-option v-for="(meta, key) in EXPENSE_STATUS_META" :key="key" :value="key">{{ meta.text }}</a-select-option>
        </a-select>
        <a-button :loading="loading" @click="load">查询</a-button>
        <span class="filter-total">
          已生效合计 <b>¥{{ money(effectiveTotal) }}</b>
          <template v-if="pendingTotal"> · 审批中 ¥{{ money(pendingTotal) }}</template>
        </span>
      </a-space>
    </a-card>

    <a-card>
      <a-table
        :data-source="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        size="small"
        :scroll="{ x: 1150 }"
        :pagination="{ pageSize: 15, showSizeChanger: false }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'category'">
            <a-tag :color="CATEGORY_COLOR[record.category as ExpenseCategory]">
              {{ EXPENSE_CATEGORY_NAMES[record.category as ExpenseCategory] }}
            </a-tag>
            <span v-if="record.name">{{ record.name }}</span>
          </template>
          <template v-else-if="column.key === 'amount'">
            <b>¥{{ money(record.amount) }}</b>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="EXPENSE_STATUS_META[record.status as ExpenseStatus].color">
              {{ EXPENSE_STATUS_META[record.status as ExpenseStatus].text }}
            </a-tag>
            <div v-if="record.flowName" class="sub">{{ record.flowName }}</div>
          </template>
          <template v-else-if="column.key === 'source'">
            {{ EXPENSE_SOURCE_NAMES[record.source as ExpenseSource] }}
            <div class="sub">{{ record.createdByName || record.createdBy }} · {{ day(record.createdAt) }}</div>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space size="small">
              <a v-if="record.approvalId" @click="openDetail(record)">审批进度</a>
              <a-popconfirm
                v-if="record.status === 'PENDING_APPROVAL' && record.approvalId && auth.hasPerm('flow:instance:view')"
                title="撤销后该笔支出变为已驳回，可修改后重新提交"
                @confirm="doCancel(record)"
              >
                <a>撤销审批</a>
              </a-popconfirm>
              <a
                v-if="record.status !== 'PENDING_APPROVAL' && auth.hasPerm('finance:expense:update')"
                @click="openEdit(record)"
              >
                编辑
              </a>
              <a-popconfirm
                v-if="record.status !== 'PENDING_APPROVAL' && auth.hasPerm('finance:expense:delete')"
                title="确认删除该笔支出？"
                @confirm="doRemove(record)"
              >
                <a style="color: #ff4d4f">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 录入 / 编辑 -->
    <a-modal
      v-model:open="formOpen"
      :title="editing ? '编辑支出' : '录入支出'"
      :confirm-loading="submitting"
      @ok="submit"
    >
      <a-alert
        v-if="!editing"
        :type="flowHint.includes('未命中') ? 'success' : 'info'"
        show-icon
        style="margin-bottom: 16px"
        :message="flowHint || '填写金额后可预览会走哪条审批流'"
      />
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="月份" required>
              <a-select v-model:value="form.month">
                <a-select-option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="归属门店" required>
              <a-select
                v-model:value="form.orgId"
                placeholder="选择门店"
                show-search
                option-filter-prop="label"
                :options="orgSelectOptions"
                @change="previewFlow"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="支出科目" required>
              <a-select v-model:value="form.category">
                <a-select-option v-for="(text, key) in EXPENSE_CATEGORY_NAMES" :key="key" :value="key">{{ text }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="金额（元）" required>
              <a-input-number
                v-model:value="form.amount"
                :min="0"
                :precision="2"
                style="width: 100%"
                @change="previewFlow"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item :label="form.category === 'OTHER' ? '费用名称' : '费用名称（选填）'" :required="form.category === 'OTHER'">
          <a-input v-model:value="form.name" placeholder="如：水电物业、设备维修" />
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="form.remark" placeholder="选填" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 批量导入 -->
    <a-modal v-model:open="importOpen" title="批量导入支出" :confirm-loading="importing" width="680px" @ok="submitImport">
      <a-alert
        type="warning"
        show-icon
        style="margin-bottom: 16px"
        message="导入的支出直接生效、不走审批，请确认数据无误。每行一条，用逗号分隔：门店,科目,金额,费用名称,备注"
      />
      <a-form layout="vertical">
        <a-form-item label="导入月份" required>
          <a-select v-model:value="importMonth" style="width: 160px">
            <a-select-option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="数据">
          <a-textarea
            v-model:value="importText"
            :rows="8"
            :placeholder="IMPORT_PLACEHOLDER"
            @change="parseImport"
          />
        </a-form-item>
      </a-form>
      <div v-if="importErrors.length" class="import-err">
        <div v-for="(e, i) in importErrors" :key="i">{{ e }}</div>
      </div>
      <a-table
        v-if="importRows.length"
        :data-source="importRows"
        :columns="importColumns"
        size="small"
        :pagination="false"
        :row-key="(_: ExpensePayload, i: number) => i"
        :scroll="{ y: 200 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'org'">{{ orgLabel(record.orgId) }}</template>
          <template v-else-if="column.key === 'category'">{{ EXPENSE_CATEGORY_NAMES[record.category as ExpenseCategory] }}</template>
          <template v-else-if="column.key === 'amount'">¥{{ money(record.amount) }}</template>
        </template>
      </a-table>
    </a-modal>

    <!-- 审批进度 -->
    <a-drawer v-model:open="detailOpen" title="支出审批进度" width="520px">
      <a-descriptions v-if="current" :column="1" size="small" bordered style="margin-bottom: 16px">
        <a-descriptions-item label="门店">{{ current.orgName }}</a-descriptions-item>
        <a-descriptions-item label="月份">{{ current.month }}</a-descriptions-item>
        <a-descriptions-item label="科目">
          {{ EXPENSE_CATEGORY_NAMES[current.category] }}{{ current.name ? ` · ${current.name}` : '' }}
        </a-descriptions-item>
        <a-descriptions-item label="金额">¥{{ money(current.amount) }}</a-descriptions-item>
        <a-descriptions-item label="状态">
          <a-tag :color="EXPENSE_STATUS_META[current.status].color">{{ EXPENSE_STATUS_META[current.status].text }}</a-tag>
        </a-descriptions-item>
      </a-descriptions>
      <a-spin :spinning="detailLoading">
        <ApprovalTimeline v-if="instance" :instance="instance" done-text="支出生效，计入财务看板" />
        <a-empty v-else-if="!detailLoading" description="没有审批记录或你没有查看权限" />
      </a-spin>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined, UploadOutlined } from '@ant-design/icons-vue'
import {
  EXPENSE_CATEGORY_NAMES,
  EXPENSE_SOURCE_NAMES,
  EXPENSE_STATUS_META,
  amountRangeText,
  currentMonth,
  recentMonths,
} from '@fullyu/shared'
import type { ExpenseCategory, ExpenseSource, ExpenseStatus } from '@fullyu/shared'
import {
  createExpense,
  importExpenses,
  listExpenses,
  removeExpense,
  updateExpense,
} from '@/api/finance'
import type { ExpenseEntry, ExpensePayload } from '@/api/finance'
import { cancelInstance, getInstance, previewFlowRule } from '@/api/approval'
import type { ApprovalInstance } from '@/api/approval'
import { listOrgOptions } from '@/api/org'
import type { OrgOption } from '@/api/org'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import { day, money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  LABOR: 'blue',
  MEITUAN: 'gold',
  OTHER: 'default',
}

const monthOptions = recentMonths(12)

/* ===== 组织 ===== */
const orgs = ref<OrgOption[]>([])
const orgSelectOptions = computed(() =>
  orgs.value.map((o) => ({ value: o.id, label: `${o.shortName || o.name}（${o.code}）` })),
)
const orgLabel = (id: string) => {
  const hit = orgs.value.find((o) => o.id === id)
  return hit ? hit.shortName || hit.name : id
}

/* ===== 列表 ===== */
const filter = reactive<{
  month: string
  orgId?: string
  category?: ExpenseCategory
  status?: ExpenseStatus
}>({ month: currentMonth() })

const rows = ref<ExpenseEntry[]>([])
const loading = ref(false)

const effectiveTotal = computed(() =>
  rows.value.filter((r) => r.status === 'EFFECTIVE').reduce((s, r) => s + r.amount, 0),
)
const pendingTotal = computed(() =>
  rows.value.filter((r) => r.status === 'PENDING_APPROVAL').reduce((s, r) => s + r.amount, 0),
)

const columns = [
  { title: '月份', dataIndex: 'month', width: 90 },
  { title: '门店', dataIndex: 'orgName', width: 130 },
  { title: '科目', key: 'category', width: 200 },
  { title: '金额', key: 'amount', width: 120 },
  { title: '状态', key: 'status', width: 130 },
  { title: '来源 / 录入', key: 'source', width: 160 },
  { title: '备注', dataIndex: 'remark', ellipsis: true },
  { title: '操作', key: 'action', width: 230, fixed: 'right' },
]

async function load() {
  loading.value = true
  try {
    rows.value = await listExpenses({
      month: filter.month,
      orgId: filter.orgId,
      category: filter.category,
      status: filter.status,
    })
  } catch (e: any) {
    message.error(e?.message || '加载支出台账失败')
    rows.value = []
  } finally {
    loading.value = false
  }
}

/* ===== 录入 / 编辑 ===== */
const formOpen = ref(false)
const submitting = ref(false)
const editing = ref<ExpenseEntry | null>(null)
const form = reactive({
  month: currentMonth(),
  orgId: undefined as string | undefined,
  category: 'MEITUAN' as ExpenseCategory,
  name: '',
  amount: 0,
  remark: '',
})

const flowHint = ref('')

/** 提交前先告诉录入人这笔会走哪条流程，免审也要说清楚 */
let previewTimer: number | undefined
function previewFlow() {
  window.clearTimeout(previewTimer)
  const amount = Number(form.amount) || 0
  if (!amount || !form.orgId) {
    flowHint.value = ''
    return
  }
  previewTimer = window.setTimeout(async () => {
    const org = orgs.value.find((o) => o.id === form.orgId)
    try {
      const rule = await previewFlowRule({
        bizType: 'EXPENSE_ENTRY',
        amount,
        scope: org && org.type === 'STORE' ? 'STORE' : 'HQ',
      })
      flowHint.value = rule
        ? `本笔 ¥${money(amount)} 将走「${rule.name}」（${amountRangeText(rule.minAmount, rule.maxAmount)}），共 ${rule.nodes.length} 级审批，通过后才计入看板`
        : `本笔 ¥${money(amount)} 未命中任何审批流，提交后直接生效`
    } catch {
      flowHint.value = ''
    }
  }, 300)
}

function openCreate() {
  editing.value = null
  form.month = filter.month
  form.orgId = filter.orgId
  form.category = 'MEITUAN'
  form.name = ''
  form.amount = 0
  form.remark = ''
  flowHint.value = ''
  formOpen.value = true
}

function openEdit(row: ExpenseEntry) {
  editing.value = row
  form.month = row.month
  form.orgId = row.orgId
  form.category = row.category
  form.name = row.name
  form.amount = row.amount
  form.remark = row.remark
  flowHint.value = ''
  formOpen.value = true
}

async function submit() {
  if (!form.orgId) {
    message.warning('请选择归属门店')
    return
  }
  if (!form.amount || form.amount <= 0) {
    message.warning('请输入大于 0 的金额')
    return
  }
  if (form.category === 'OTHER' && !form.name.trim()) {
    message.warning('其他支出请填写费用名称')
    return
  }
  const payload: ExpensePayload = {
    orgId: form.orgId,
    month: form.month,
    category: form.category,
    name: form.name.trim(),
    amount: form.amount,
    remark: form.remark.trim(),
  }
  submitting.value = true
  try {
    if (editing.value) {
      await updateExpense(editing.value.id, payload)
      message.success('已更新，财务看板按新数字重算')
    } else {
      const res = await createExpense(payload)
      message.success(
        res.status === 'PENDING_APPROVAL'
          ? `已提交，流程「${res.flowName}」审批通过后计入看板`
          : '该金额未命中审批流，支出已直接生效',
      )
    }
    formOpen.value = false
    load()
  } catch (e: any) {
    message.error(e?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

async function doRemove(row: ExpenseEntry) {
  try {
    await removeExpense(row.id)
    message.success('已删除')
    load()
  } catch (e: any) {
    message.error(e?.message || '删除失败')
  }
}

async function doCancel(row: ExpenseEntry) {
  if (!row.approvalId) return
  try {
    await cancelInstance(row.approvalId)
    message.success('已撤销审批，可修改后重新提交')
    load()
  } catch (e: any) {
    message.error(e?.message || '撤销失败')
  }
}

/* ===== 批量导入 ===== */
const IMPORT_PLACEHOLDER = ['蓝色港湾店,美团推广费,1280,,6月第4周点评推广', '望京店,人力成本,41000,,含兼职技师'].join('\n')

const importOpen = ref(false)
const importing = ref(false)
const importMonth = ref(currentMonth())
const importText = ref('')
const importRows = ref<ExpensePayload[]>([])
const importErrors = ref<string[]>([])

const importColumns = [
  { title: '门店', key: 'org' },
  { title: '科目', key: 'category' },
  { title: '金额', key: 'amount' },
  { title: '名称', dataIndex: 'name' },
  { title: '备注', dataIndex: 'remark' },
]

/** 科目既认中文名也认枚举值，粘 Excel 和粘导出数据都能进 */
function resolveCategory(text: string): ExpenseCategory | null {
  const key = (Object.keys(EXPENSE_CATEGORY_NAMES) as ExpenseCategory[]).find(
    (k) => k === text.toUpperCase() || EXPENSE_CATEGORY_NAMES[k] === text,
  )
  return key ?? null
}

/** 门店按简称、全称、编码依次匹配，编码不区分大小写 */
function resolveOrg(text: string): OrgOption | undefined {
  const t = text.trim()
  return orgs.value.find(
    (o) => o.shortName === t || o.name === t || o.code.toUpperCase() === t.toUpperCase(),
  )
}

function parseImport() {
  const errors: string[] = []
  const list: ExpensePayload[] = []
  const lines = importText.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  lines.forEach((line, idx) => {
    const cells = line.split(/[,，\t]/).map((c) => c.trim())
    const [orgText = '', categoryText = '', amountText = '', name = '', remark = ''] = cells
    const org = resolveOrg(orgText)
    const category = resolveCategory(categoryText)
    const amount = Number(amountText)
    if (!org) {
      errors.push(`第 ${idx + 1} 行：找不到门店「${orgText}」`)
      return
    }
    if (!category) {
      errors.push(`第 ${idx + 1} 行：科目「${categoryText}」无法识别`)
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`第 ${idx + 1} 行：金额「${amountText}」无效`)
      return
    }
    if (category === 'OTHER' && !name) {
      errors.push(`第 ${idx + 1} 行：其他支出必须填费用名称`)
      return
    }
    list.push({ orgId: org.id, month: importMonth.value, category, name, amount, remark })
  })
  importErrors.value = errors
  importRows.value = list
}

function openImport() {
  importMonth.value = filter.month
  importText.value = ''
  importRows.value = []
  importErrors.value = []
  importOpen.value = true
}

async function submitImport() {
  parseImport()
  if (importErrors.value.length) {
    message.warning('请先修正有问题的行')
    return
  }
  if (!importRows.value.length) {
    message.warning('没有可导入的数据')
    return
  }
  importing.value = true
  try {
    const res = await importExpenses(importRows.value)
    message.success(`已导入 ${res.created} 条，直接生效`)
    importOpen.value = false
    load()
  } catch (e: any) {
    message.error(e?.message || '导入失败')
  } finally {
    importing.value = false
  }
}

/* ===== 审批进度 ===== */
const detailOpen = ref(false)
const detailLoading = ref(false)
const current = ref<ExpenseEntry | null>(null)
const instance = ref<ApprovalInstance | null>(null)

async function openDetail(row: ExpenseEntry) {
  current.value = row
  instance.value = null
  detailOpen.value = true
  if (!row.approvalId) return
  detailLoading.value = true
  try {
    instance.value = await getInstance(row.approvalId)
  } catch {
    instance.value = null
  } finally {
    detailLoading.value = false
  }
}

onMounted(async () => {
  try {
    orgs.value = await listOrgOptions({ accounting: 1 })
  } catch {
    orgs.value = []
  }
  load()
})
</script>

<style scoped>
.sub {
  font-size: 12px;
  color: #8c8c8c;
}
.filter-total {
  color: #595959;
  font-size: 13px;
}
.filter-total b {
  color: #6b463c;
}
.import-err {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #fff2f0;
  border-radius: 4px;
  font-size: 12px;
  color: #cf1322;
  line-height: 1.8;
}
</style>
