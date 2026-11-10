<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">会员卡时段折扣</h2>
      <a-space>
        <a-select v-model:value="filterOrg" style="width: 160px" allow-clear placeholder="全部门店">
          <a-select-option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</a-select-option>
        </a-select>
        <a-select v-model:value="filterCard" style="width: 120px" allow-clear placeholder="全部卡类型">
          <a-select-option v-for="(label, t) in typeLabels" :key="t" :value="t">{{ label }}</a-select-option>
        </a-select>
        <a-select v-model:value="filterStatus" style="width: 110px">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option value="ENABLED">启用中</a-select-option>
          <a-select-option value="DISABLED">已停用</a-select-option>
        </a-select>
        <a-button v-perm="'membercard:timediscount'" type="primary" @click="openAdd">+ 新建规则</a-button>
      </a-space>
    </div>

    <a-alert
      style="margin-bottom: 16px"
      type="info"
      show-icon
      message="匹配顺序：显式门店规则（按优先级）→ 全局规则（门店不选=全部，新店自动生效）→ 课程固定折扣 → 原价。折扣率 100% = 原价，>100% = 峰时加价；判定口径为本单预约开始时间。"
    />

    <a-card style="margin-bottom: 16px" title="一周总览预览">
      <template #extra>
        <a-space>
          <a-select v-model:value="pvOrg" style="width: 150px" placeholder="选择门店">
            <a-select-option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</a-select-option>
          </a-select>
          <a-select v-model:value="pvCard" style="width: 110px">
            <a-select-option v-for="(label, t) in typeLabels" :key="t" :value="t">{{ label }}</a-select-option>
          </a-select>
          <a-select v-model:value="pvDuration" style="width: 110px">
            <a-select-option v-for="d in [30, 45, 60, 90]" :key="d" :value="d">{{ d }} 分钟项目</a-select-option>
          </a-select>
        </a-space>
      </template>
      <div style="overflow-x: auto">
        <table style="border-collapse: collapse; width: 100%; font-size: 12px; text-align: center">
          <thead>
            <tr>
              <th style="padding: 4px 8px; color: #A08A72; text-align: left">日期</th>
              <th v-for="h in previewHours" :key="h" style="padding: 4px; color: #A08A72">{{ h }}:00</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="day in previewDays" :key="day.key">
              <td style="padding: 4px 8px; text-align: left; color: #4B3621; white-space: nowrap">{{ day.label }}</td>
              <td v-for="h in previewHours" :key="h" style="padding: 2px">
                <a-tooltip :title="cellOf(day.date, h).tip">
                  <div :style="cellStyle(cellOf(day.date, h))">{{ cellOf(day.date, h).text }}</div>
                </a-tooltip>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="margin-top: 8px; font-size: 12px; color: #A08A72">
        绿 = 折扣 · 红 = 峰时加价 · 蓝 = 时长固定价 · 黄 = 原价 · 灰「—」= 未命中时段规则（回退课程固定折扣/原价）。hover 查看命中规则。预览基于当前已保存的启用规则，按未来 7 天演算（日期范围规则自然纳入）。
      </div>
    </a-card>

    <a-card>
      <a-table :columns="columns" :data-source="filteredRules" :loading="loading" size="small" row-key="id">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.dataIndex === 'priority'">
            <a-space>
              <span>{{ record.priority }}</span>
              <a-button size="small" type="text" :disabled="sortDisabled || index === 0" @click="move(record, -1)">↑</a-button>
              <a-button size="small" type="text" :disabled="sortDisabled || index === filteredRules.length - 1" @click="move(record, 1)">↓</a-button>
            </a-space>
          </template>
          <template v-if="column.dataIndex === 'name'">
            <div style="font-weight: 500; color: #4B3621;">{{ record.name }}</div>
            <div style="font-size: 12px; color: #999;" v-if="record.remark">{{ record.remark }}</div>
          </template>
          <template v-if="column.dataIndex === 'orgIds'">
            <a-tag v-if="!record.orgIds?.length" color="gold">全部门店</a-tag>
            <a-tag v-for="oid in record.orgIds || []" :key="oid">{{ orgName(oid) }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'cardTypes'">
            <a-tag v-if="!record.cardTypes?.length" color="gold">全部卡</a-tag>
            <template v-else>
              <a-tag v-for="t in record.cardTypes" :key="t" :color="typeColors[t]">{{ typeLabels[t] }}</a-tag>
            </template>
          </template>
          <template v-if="column.dataIndex === 'weekdays'">
            {{ weekdayText(record.weekdays) }}
          </template>
          <template v-if="column.dataIndex === 'timeRanges'">
            {{ timeRangeText(record.timeRanges) }}
          </template>
          <template v-if="column.dataIndex === 'validRange'">
            {{ dateRangeText(record) }}
          </template>
          <template v-if="column.dataIndex === 'action'">
            <template v-if="record.actionType === 'PERCENT'">
              <a-tag :color="record.discountPercent > 100 ? 'red' : record.discountPercent < 100 ? 'green' : 'default'">
                {{ record.discountPercent }}%
              </a-tag>
            </template>
            <a-tooltip v-else :title="fixedPriceText(record.fixedPrices)">
              <a-tag color="blue">按时长固定价</a-tag>
            </a-tooltip>
          </template>
          <template v-if="column.dataIndex === 'status'">
            <a-tag :color="record.status === 'ENABLED' ? 'green' : 'default'">
              {{ record.status === 'ENABLED' ? '启用中' : '已停用' }}
            </a-tag>
          </template>
          <template v-if="column.dataIndex === 'ops'">
            <a-space>
              <a v-perm="'membercard:timediscount'" @click="openEdit(record)">编辑</a>
              <a v-perm="'membercard:timediscount'" @click="toggleStatus(record)">
                {{ record.status === 'ENABLED' ? '停用' : '启用' }}
              </a>
              <a-popconfirm v-perm="'membercard:timediscount'" title="确定删除该规则？" @confirm="removeRule(record)">
                <a style="color: #C0392B;">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建/编辑抽屉 -->
    <a-drawer v-model:open="drawerVisible" :title="isEdit ? '编辑时段折扣规则' : '新建时段折扣规则'" width="640" placement="right">
      <a-form layout="vertical">
        <a-form-item label="规则名称" required>
          <a-input v-model:value="form.name" placeholder="如：周末峰值 / 闲时引流 / 国庆假期" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="适用门店（不选 = 全部门店，新店自动生效）">
              <a-select v-model:value="form.orgIds" mode="multiple" placeholder="全部门店" :options="storeOptions" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="适用卡类型（不选 = 全部卡）">
              <a-select v-model:value="form.cardTypes" mode="multiple" placeholder="全部卡类型" allow-clear>
                <a-select-option v-for="(label, t) in typeLabels" :key="t" :value="t">{{ label }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="星期（不选 = 每天）">
              <a-select v-model:value="form.weekdays" mode="multiple" placeholder="不限星期" allow-clear>
                <a-select-option v-for="(label, i) in weekdayLabels" :key="i + 1" :value="i + 1">{{ label }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="日期范围（留空 = 长期有效；节假日在此配，如 10-01 ~ 10-07）">
              <a-space>
                <a-date-picker v-model:value="form.validFrom" value-format="YYYY-MM-DD" placeholder="开始日期" style="width: 130px" />
                <span>~</span>
                <a-date-picker v-model:value="form.validTo" value-format="YYYY-MM-DD" placeholder="结束日期" style="width: 130px" />
              </a-space>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="时间段（不添加 = 全天；含头不含尾，不支持跨午夜）">
          <div v-for="(tr, i) in form.timeRanges" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px;">
            <a-time-picker v-model:value="tr.start" value-format="HH:mm" format="HH:mm" placeholder="开始" style="width: 110px" />
            <span style="line-height: 32px">~</span>
            <a-time-picker v-model:value="tr.end" value-format="HH:mm" format="HH:mm" placeholder="结束" style="width: 110px" />
            <a-button type="text" danger @click="form.timeRanges.splice(i, 1)">删除</a-button>
          </div>
          <a-button type="dashed" size="small" @click="form.timeRanges.push({ start: '', end: '' })">＋ 加一个时间段</a-button>
        </a-form-item>

        <a-divider orientation="left">折扣动作</a-divider>
        <a-form-item>
          <a-radio-group v-model:value="form.actionType">
            <a-radio value="PERCENT">百分比折扣率</a-radio>
            <a-radio value="FIXED_BY_DURATION">按时长固定价</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="form.actionType === 'PERCENT'" label="折扣率 %（50–200；100 = 原价，85 = 8.5 折，115 = 峰时加价 15%）" required>
          <a-input-number v-model:value="form.discountPercent" :min="50" :max="200" :precision="0" style="width: 160px" />
        </a-form-item>
        <template v-else>
          <a-form-item label="时长价目表（按本单服务时长匹配；时长不在表内则该规则不生效）" required>
            <div v-for="(fp, i) in form.fixedPrices" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px;">
              <a-input-number v-model:value="fp.minutes" :min="1" :precision="0" addon-after="分钟" style="width: 150px" />
              <a-input-number v-model:value="fp.price" :min="0" :precision="2" addon-before="¥" style="width: 150px" />
              <a-button type="text" danger :disabled="form.fixedPrices.length <= 1" @click="form.fixedPrices.splice(i, 1)">删除</a-button>
            </div>
            <a-button type="dashed" size="small" @click="form.fixedPrices.push({ minutes: null, price: null })">＋ 加一档时长</a-button>
          </a-form-item>
        </template>
        <a-form-item label="备注">
          <a-textarea v-model:value="form.remark" :rows="2" placeholder="选填，如定价依据" />
        </a-form-item>

        <a-button type="primary" block :loading="saving" @click="saveRule">{{ isEdit ? '保存修改' : '创建规则' }}</a-button>
      </a-form>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { listOrgs } from '@/api/org'
import { pickTimeDiscountRule, type TimeDiscountRuleLike } from '@fullyu/shared'
import {
  listTimeDiscountRules,
  createTimeDiscountRule,
  updateTimeDiscountRule,
  setTimeDiscountRuleStatus,
  removeTimeDiscountRule,
  reorderTimeDiscountRules,
} from '@/api/timeDiscount'

const typeLabels: Record<string, string> = { MONTHLY: '月卡', QUARTERLY: '季卡', YEARLY: '年卡' }
const typeColors: Record<string, string> = { MONTHLY: 'blue', QUARTERLY: 'purple', YEARLY: 'gold' }
const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const loading = ref(false)
const saving = ref(false)
const rules = ref<any[]>([])
const stores = ref<any[]>([])
const filterOrg = ref<string | undefined>()
const filterCard = ref<string | undefined>()
const filterStatus = ref('')

const storeOptions = computed(() => stores.value.map((s) => ({ value: s.id, label: s.name })))
const orgName = (id: string) => stores.value.find((s) => s.id === id)?.name ?? id

const columns = [
  { title: '优先级', dataIndex: 'priority', width: 110 },
  { title: '规则名', dataIndex: 'name', width: 150 },
  { title: '门店', dataIndex: 'orgIds', width: 160 },
  { title: '卡类型', dataIndex: 'cardTypes', width: 130 },
  { title: '星期', dataIndex: 'weekdays', width: 130 },
  { title: '时间段', dataIndex: 'timeRanges', width: 170 },
  { title: '日期范围', dataIndex: 'validRange', width: 160 },
  { title: '折扣动作', dataIndex: 'action', width: 120 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '操作', dataIndex: 'ops', width: 150 },
]

/** 过滤只做展示；调序按钮在筛选激活时禁用，避免局部视图误改全局顺序 */
const sortDisabled = computed(() => !!filterOrg.value || !!filterCard.value || !!filterStatus.value)

const filteredRules = computed(() =>
  rules.value.filter((r) => {
    if (filterStatus.value && r.status !== filterStatus.value) return false
    // 全局规则（orgIds 空）对任何门店都生效，筛选门店时保留
    if (filterOrg.value && r.orgIds?.length && !r.orgIds.includes(filterOrg.value)) return false
    if (filterCard.value && r.cardTypes?.length && !r.cardTypes.includes(filterCard.value)) return false
    return true
  }),
)

function weekdayText(ws: number[]) {
  return ws?.length ? ws.map((w) => weekdayLabels[w - 1]).join(' ') : '不限'
}
function timeRangeText(rs: any[]) {
  return rs?.length ? rs.map((r) => `${r.start}–${r.end}`).join('、') : '全天'
}
function dateRangeText(r: any) {
  const f = r.validFrom ? String(r.validFrom).slice(5, 10) : ''
  const t = r.validTo ? String(r.validTo).slice(5, 10) : ''
  if (!f && !t) return '长期'
  return `${f || '…'} ~ ${t || '长期'}`
}
function fixedPriceText(fps: any[]) {
  return (fps || []).map((p) => `${p.minutes}分钟 = ¥${p.price}`).join('；')
}

async function loadRules() {
  loading.value = true
  try {
    const res = await listTimeDiscountRules()
    rules.value = (Array.isArray(res) ? res : res?.list || []) as any[]
  } finally {
    loading.value = false
  }
}

async function loadStores() {
  const res: any = await listOrgs({ type: 'STORE', status: 'ACTIVE' })
  stores.value = Array.isArray(res) ? res : res?.list || []
}

async function move(record: any, dir: -1 | 1) {
  const all = [...rules.value] // 已按 priority 升序
  const i = all.findIndex((r) => r.id === record.id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= all.length) return
  ;[all[i], all[j]] = [all[j], all[i]]
  await reorderTimeDiscountRules(all.map((r) => r.id))
  message.success('优先级已更新')
  loadRules()
}

// ===== 新建/编辑 =====
const drawerVisible = ref(false)
const isEdit = ref(false)
const editingId = ref('')
const form = ref(emptyForm())

function emptyForm() {
  return {
    name: '',
    orgIds: [] as string[],
    cardTypes: [] as string[],
    weekdays: [] as number[],
    timeRanges: [] as { start: string; end: string }[],
    validFrom: null as string | null,
    validTo: null as string | null,
    actionType: 'PERCENT' as 'PERCENT' | 'FIXED_BY_DURATION',
    discountPercent: 90 as number | null,
    fixedPrices: [{ minutes: 30 as number | null, price: null as number | null }],
    remark: '',
  }
}

function openAdd() {
  isEdit.value = false
  form.value = emptyForm()
  drawerVisible.value = true
}

function openEdit(record: any) {
  isEdit.value = true
  editingId.value = record.id
  form.value = {
    name: record.name,
    orgIds: record.orgIds ?? [],
    cardTypes: record.cardTypes ?? [],
    weekdays: record.weekdays ?? [],
    timeRanges: (record.timeRanges ?? []).map((r: any) => ({ ...r })),
    validFrom: record.validFrom ? String(record.validFrom).slice(0, 10) : null,
    validTo: record.validTo ? String(record.validTo).slice(0, 10) : null,
    actionType: record.actionType,
    discountPercent: record.discountPercent,
    fixedPrices: (record.fixedPrices ?? []).map((p: any) => ({ ...p })),
    remark: record.remark ?? '',
  }
  if (!form.value.fixedPrices.length) form.value.fixedPrices = [{ minutes: 30, price: null }]
  drawerVisible.value = true
}

function validateForm(): string | null {
  const f = form.value
  if (!f.name.trim()) return '规则名称必填'
  for (const tr of f.timeRanges) {
    if (!tr.start || !tr.end) return '时间段需填写完整'
    if (tr.start >= tr.end) return `时间段 ${tr.start}–${tr.end} 开始须早于结束`
  }
  if (f.validFrom && f.validTo && f.validFrom > f.validTo) return '日期范围开始不能晚于结束'
  if (f.actionType === 'PERCENT') {
    if (f.discountPercent == null || f.discountPercent < 50 || f.discountPercent > 200) return '折扣率须在 50–200 之间'
  } else {
    if (!f.fixedPrices.length) return '至少需要一档时长价目'
    const seen = new Set<number>()
    for (const fp of f.fixedPrices) {
      if (fp.minutes == null || fp.minutes <= 0) return '时长（分钟）须为正整数'
      if (seen.has(fp.minutes)) return `时长 ${fp.minutes} 分钟重复`
      seen.add(fp.minutes)
      if (fp.price == null || fp.price < 0) return '固定价须为非负数'
    }
  }
  return null
}

async function saveRule() {
  const err = validateForm()
  if (err) return message.warning(err)
  saving.value = true
  try {
    const payload = { ...form.value }
    if (isEdit.value) {
      await updateTimeDiscountRule(editingId.value, payload)
      message.success('规则已更新')
    } else {
      await createTimeDiscountRule(payload)
      message.success('规则已创建')
    }
    drawerVisible.value = false
    loadRules()
  } finally {
    saving.value = false
  }
}

async function toggleStatus(record: any) {
  const next = record.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  await setTimeDiscountRuleStatus(record.id, next)
  message.success(next === 'ENABLED' ? `${record.name} 已启用` : `${record.name} 已停用`)
  loadRules()
}

async function removeRule(record: any) {
  await removeTimeDiscountRule(record.id)
  message.success('已删除')
  loadRules()
}

// ===== 一周总览预览 =====
const pvOrg = ref<string>('')
const pvCard = ref<string>('YEARLY')
const pvDuration = ref<number>(60)
const previewHours = Array.from({ length: 13 }, (_, i) => 10 + i) // 10:00–22:00

const previewDays = computed(() => {
  const out: { key: string; label: string; date: Date }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    d.setHours(0, 0, 0, 0)
    out.push({
      key: d.toISOString().slice(0, 10),
      label: `${weekdayLabels[((d.getDay() + 6) % 7)]} ${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      date: d,
    })
  }
  return out
})

function toRuleLikes(rows: any[]): TimeDiscountRuleLike[] {
  return rows
    .filter((r) => r.status === 'ENABLED')
    .map((r) => ({
      id: r.id,
      name: r.name,
      orgIds: r.orgIds ?? [],
      cardTypes: r.cardTypes ?? [],
      priority: r.priority,
      weekdays: r.weekdays ?? [],
      timeRanges: r.timeRanges ?? [],
      validFrom: r.validFrom,
      validTo: r.validTo,
      actionType: r.actionType,
      discountPercent: r.discountPercent,
      fixedPrices: r.fixedPrices,
      enabled: true,
    }))
}

function cellOf(day: Date, hour: number) {
  const start = new Date(day)
  start.setHours(hour, 0, 0, 0)
  const hit = pickTimeDiscountRule(toRuleLikes(rules.value), {
    orgId: pvOrg.value || null,
    cardType: pvCard.value,
    appointmentStart: start,
    durationMinutes: pvDuration.value,
  })
  if (!hit) return { text: '—', tip: '未命中时段规则：回退课程固定折扣/原价', kind: 'none' }
  if (hit.actionType === 'FIXED_BY_DURATION') {
    return { text: `¥${hit.fixedPrice}`, tip: `命中「${hit.ruleName}」：${pvDuration.value}分钟固定价`, kind: 'fixed' }
  }
  const p = hit.discountPercent as number
  if (p > 100) return { text: `${p}%`, tip: `命中「${hit.ruleName}」：峰时加价 ${p - 100}%`, kind: 'up' }
  if (p < 100) return { text: `${p}%`, tip: `命中「${hit.ruleName}」：${(p / 10).toFixed(1)} 折`, kind: 'down' }
  return { text: '100%', tip: `命中「${hit.ruleName}」：原价（取消折扣）`, kind: 'flat' }
}

const CELL_COLORS: Record<string, { bg: string; color: string }> = {
  none: { bg: '#f5f5f5', color: '#bbb' },
  fixed: { bg: '#E3F2FD', color: '#1565C0' },
  up: { bg: '#FFEBEE', color: '#C62828' },
  down: { bg: '#E8F5E9', color: '#2E7D32' },
  flat: { bg: '#FFFDE7', color: '#8D6E63' },
}

function cellStyle(cell: { kind: string }) {
  const c = CELL_COLORS[cell.kind] ?? CELL_COLORS.none
  return { background: c.bg, color: c.color, borderRadius: '4px', padding: '4px 0', fontWeight: 600 }
}

onMounted(async () => {
  await loadStores()
  pvOrg.value = stores.value[0]?.id ?? ''
  loadRules()
})
</script>
