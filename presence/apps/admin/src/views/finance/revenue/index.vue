<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px">
      <h2 class="page-title">收入数据源</h2>
      <a-space wrap>
        <a-select v-model:value="month" style="width: 130px" @change="loadRecords">
          <a-select-option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</a-select-option>
        </a-select>
        <a-button v-perm="'finance:revenue:import'" @click="openManual()">手工补录</a-button>
        <a-button v-perm="'finance:revenue:sync'" type="primary" :loading="syncingAll" @click="syncAll">
          <template #icon><SyncOutlined /></template>
          抽取全部已打通源
        </a-button>
      </a-space>
    </div>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 16px"
      message="收入按 月份 × 门店 × 数据源 归集：本系统小程序走「订单 → 课程 → 场馆 → 场馆所属门店」实算；在场、轻疗接口未开放前用手工补录兜底，打通后改为自动同步，手工通道保留作兜底。"
    />

    <!-- 汇总 -->
    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :xs="12" :md="6">
        <a-card :loading="loading">
          <a-statistic title="本月总收入（多源汇总）" :value="totalAll" :precision="2" prefix="¥" />
        </a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card :loading="loading">
          <a-statistic title="接口自动占比" :value="autoRate" suffix="%" :precision="1" :value-style="{ color: '#52c41a' }" />
        </a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card :loading="loading">
          <a-statistic
            title="待打通系统收入"
            :value="pendingAmount"
            :precision="2"
            prefix="¥"
            :value-style="{ color: '#d46b08' }"
          />
        </a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card :loading="loading">
          <a-statistic title="归集流水" :value="records.length" suffix="笔" />
        </a-card>
      </a-col>
    </a-row>

    <!-- 数据源 -->
    <a-card title="数据源对接状态" style="margin-bottom: 16px" :loading="sourceLoading">
      <a-row :gutter="16">
        <a-col v-for="s in sources" :key="s.key" :xs="24" :md="12" :xl="6">
          <div class="src-card" :class="s.status.toLowerCase()">
            <div class="src-head">
              <span class="src-name">{{ s.name }}</span>
              <a-tag :color="SOURCE_STATUS_META[s.status].color">{{ SOURCE_STATUS_META[s.status].text }}</a-tag>
            </div>
            <div class="src-amount">¥{{ money(sourceTotal(s.key)) }}</div>
            <div class="src-line">{{ s.intro }}</div>
            <div class="src-meta">抽数方式：{{ s.mode }}</div>
            <div class="src-meta">同步频率：{{ s.cron }}</div>
            <div class="src-meta">最近同步：{{ s.lastSyncAt ? dt(s.lastSyncAt) : '未同步' }}</div>
            <div class="src-note">{{ s.note }}</div>
            <div class="src-ops">
              <a-button
                v-if="s.key !== 'MANUAL'"
                v-perm="'finance:revenue:sync'"
                size="small"
                :type="s.status === 'CONNECTED' ? 'primary' : 'default'"
                :loading="syncingKey === s.key"
                @click="syncOne(s.key)"
              >
                立即抽取
              </a-button>
              <a-button v-if="s.status === 'PENDING'" size="small" @click="showConnect(s)">查看打通方案</a-button>
              <a-button
                v-if="s.status !== 'CONNECTED'"
                v-perm="'finance:revenue:import'"
                size="small"
                type="link"
                @click="openManual(s.key)"
              >
                手工补录
              </a-button>
            </div>
          </div>
        </a-col>
      </a-row>
    </a-card>

    <!-- 门店 × 数据源 -->
    <a-card title="门店 × 数据源 收入矩阵" style="margin-bottom: 16px">
      <a-table
        :data-source="matrix"
        :columns="matrixColumns"
        row-key="orgId"
        :pagination="false"
        :loading="loading"
        size="small"
        :scroll="{ x: 800 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'total'">
            <b>¥{{ money(record.total) }}</b>
          </template>
          <template v-else-if="String(column.key).startsWith('src_')">
            {{ record[column.key] ? `¥${money(record[column.key] as number)}` : '—' }}
          </template>
        </template>
        <template #summary>
          <a-table-summary-row>
            <a-table-summary-cell><b>合计</b></a-table-summary-cell>
            <a-table-summary-cell v-for="s in sources" :key="s.key">
              <b>¥{{ money(sourceTotal(s.key)) }}</b>
            </a-table-summary-cell>
            <a-table-summary-cell>
              <b>¥{{ money(totalAll) }}</b>
            </a-table-summary-cell>
          </a-table-summary-row>
        </template>
      </a-table>
    </a-card>

    <!-- 流水 -->
    <a-card title="归集流水明细">
      <a-space wrap style="margin-bottom: 12px">
        <a-select
          v-model:value="filterOrgId"
          style="width: 170px"
          placeholder="全部门店"
          allow-clear
          show-search
          option-filter-prop="label"
          :options="orgSelectOptions"
          @change="loadRecords"
        />
        <a-select v-model:value="filterSource" style="width: 190px" placeholder="全部数据源" allow-clear @change="loadRecords">
          <a-select-option v-for="s in sources" :key="s.key" :value="s.key">{{ s.name }}</a-select-option>
        </a-select>
        <a-button :loading="loading" @click="loadRecords">查询</a-button>
      </a-space>
      <a-table
        :data-source="records"
        :columns="recordColumns"
        row-key="id"
        :loading="loading"
        size="small"
        :pagination="{ pageSize: 12, showSizeChanger: false }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'source'">
            <a-tag :color="sourceColor(record.source)">{{ sourceName(record.source) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'amount'">
            <b>¥{{ money(record.amount) }}</b>
          </template>
          <template v-else-if="column.key === 'way'">
            {{ REVENUE_WAY_NAMES[record.way as RevenueWay] }}
          </template>
          <template v-else-if="column.key === 'syncAt'">{{ dt(record.syncAt) }}</template>
          <template v-else-if="column.key === 'action'">
            <a-popconfirm
              v-if="record.way !== 'AUTO' && auth.hasPerm('finance:revenue:import')"
              title="确认删除该条补录流水？"
              @confirm="doRemove(record)"
            >
              <a style="color: #ff4d4f">删除</a>
            </a-popconfirm>
            <span v-else class="src-meta">自动归集不可手工删</span>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 手工补录 -->
    <a-modal v-model:open="manualOpen" title="手工补录收入" :confirm-loading="submitting" @ok="submitManual">
      <a-alert
        type="warning"
        show-icon
        style="margin-bottom: 16px"
        message="用于系统外收入或未打通系统的过渡期录入。补录的流水会直接计入财务看板，同月同源可分次补录、不会互相覆盖。"
      />
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="所属月份" required>
              <a-select v-model:value="manual.month">
                <a-select-option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="归属门店" required>
              <a-select
                v-model:value="manual.orgId"
                placeholder="选择门店"
                show-search
                option-filter-prop="label"
                :options="orgSelectOptions"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="数据来源" required>
          <a-select v-model:value="manual.source">
            <a-select-option v-for="s in manualSourceOptions" :key="s.key" :value="s.key">{{ s.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="收入金额（元）" required>
              <a-input-number v-model:value="manual.amount" :min="0" :precision="2" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="对应订单数">
              <a-input-number v-model:value="manual.orderCount" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="备注">
          <a-input v-model:value="manual.remark" placeholder="如：轻疗系统 6 月导出报表" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 打通方案 -->
    <a-modal v-model:open="connectOpen" :title="`${connectSrc?.name ?? ''} · 打通方案`" :footer="null" width="600px">
      <a-steps direction="vertical" size="small" :current="1" style="margin-top: 8px">
        <a-step title="确认对接方式" description="优先 OpenAPI；无接口时用数据库只读账号或每日对账文件（CSV）落库" />
        <a-step title="门店与项目编码映射" description="双方门店编码、项目/疗程编码建立映射表，避免收入归属错门店" />
        <a-step title="联调与对账" description="试跑 7 天，逐日与对方报表核对差异，误差为 0 后切自动" />
        <a-step title="切自动同步" description="每日定时抽取 + 手动补抽，手工补录通道保留作为兜底" />
      </a-steps>
      <a-alert
        type="info"
        show-icon
        style="margin-top: 12px"
        message="待对方提供：接口文档 / 凭据、门店编码表、收入口径定义（是否含退款、是否按实收）"
      />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { SyncOutlined } from '@ant-design/icons-vue'
import { REVENUE_WAY_NAMES, SOURCE_STATUS_META, currentMonth, recentMonths } from '@fullyu/shared'
import type { RevenueSourceKey, RevenueWay } from '@fullyu/shared'
import {
  createRevenueRecords,
  listRevenueRecords,
  listRevenueSources,
  removeRevenueRecord,
  syncRevenueSource,
} from '@/api/finance'
import type { RevenueRecord, RevenueSource } from '@/api/finance'
import { listOrgOptions } from '@/api/org'
import type { OrgOption } from '@/api/org'
import { dt, money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const monthOptions = recentMonths(12)
const month = ref(currentMonth())

/* ===== 数据源 ===== */
const sources = ref<RevenueSource[]>([])
const sourceLoading = ref(false)

const sourceName = (key: RevenueSourceKey) => sources.value.find((s) => s.key === key)?.name ?? key
const sourceColor = (key: RevenueSourceKey) => {
  const status = sources.value.find((s) => s.key === key)?.status
  return status ? SOURCE_STATUS_META[status].color : 'default'
}
/** 已打通的源由接口自动入账，手工补录只留给未打通的与手工源 */
const manualSourceOptions = computed(() => sources.value.filter((s) => s.status !== 'CONNECTED'))

async function loadSources() {
  sourceLoading.value = true
  try {
    sources.value = await listRevenueSources()
  } catch (e: any) {
    message.error(e?.message || '数据源加载失败')
    sources.value = []
  } finally {
    sourceLoading.value = false
  }
}

/* ===== 流水 ===== */
const records = ref<RevenueRecord[]>([])
const loading = ref(false)
const filterOrgId = ref<string>()
const filterSource = ref<RevenueSourceKey>()

const recordColumns = [
  { title: '月份', dataIndex: 'month', width: 90 },
  { title: '门店', dataIndex: 'orgName', width: 130 },
  { title: '数据源', key: 'source', width: 150 },
  { title: '收入金额', key: 'amount', width: 130 },
  { title: '订单数', dataIndex: 'orderCount', width: 90 },
  { title: '入账方式', key: 'way', width: 110 },
  { title: '备注', dataIndex: 'remark', ellipsis: true },
  { title: '归集时间', key: 'syncAt', width: 160 },
  { title: '操作', key: 'action', width: 150 },
]

async function loadRecords() {
  loading.value = true
  try {
    records.value = await listRevenueRecords({
      month: month.value,
      orgId: filterOrgId.value,
      source: filterSource.value,
    })
  } catch (e: any) {
    message.error(e?.message || '收入流水加载失败')
    records.value = []
  } finally {
    loading.value = false
  }
}

const totalAll = computed(() => records.value.reduce((s, r) => s + r.amount, 0))
const autoRate = computed(() => {
  if (!totalAll.value) return 0
  const auto = records.value.filter((r) => r.way === 'AUTO').reduce((s, r) => s + r.amount, 0)
  return (auto / totalAll.value) * 100
})
/** 未打通系统的收入靠人工兜底，单独盯着这个数才知道打通的价值有多大 */
const pendingAmount = computed(() => {
  const keys = sources.value.filter((s) => s.status === 'PENDING').map((s) => s.key)
  return records.value.filter((r) => keys.includes(r.source)).reduce((s, r) => s + r.amount, 0)
})

const sourceTotal = (key: RevenueSourceKey) =>
  records.value.filter((r) => r.source === key).reduce((s, r) => s + r.amount, 0)

/* ===== 矩阵 ===== */
const matrix = computed(() => {
  const map = new Map<string, Record<string, any>>()
  for (const r of records.value) {
    let row = map.get(r.orgId)
    if (!row) {
      row = { orgId: r.orgId, orgName: r.orgName, total: 0 }
      for (const s of sources.value) row[`src_${s.key}`] = 0
      map.set(r.orgId, row)
    }
    row[`src_${r.source}`] = (row[`src_${r.source}`] ?? 0) + r.amount
    row.total += r.amount
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
})

const matrixColumns = computed(() => [
  { title: '门店', dataIndex: 'orgName', width: 130, fixed: 'left' },
  ...sources.value.map((s) => ({ title: s.name, key: `src_${s.key}` })),
  { title: '合计', key: 'total', width: 130 },
])

/* ===== 抽取 ===== */
const syncingKey = ref<RevenueSourceKey | null>(null)
const syncingAll = ref(false)

/** 抽取结果如实回报：skipped 是没有场馆归属的订单，不能悄悄丢掉 */
function reportSync(res: Awaited<ReturnType<typeof syncRevenueSource>>) {
  const tips = [`${res.month} 归集 ${res.orgCount} 家门店、${res.orderCount} 笔订单，合计 ¥${money(res.amount)}`]
  if (res.skipped) tips.push(`${res.skipped} 笔订单无场馆归属（多为已下线的畅练卡存量单），未计入任何门店`)
  message.success(tips.join('；'))
}

async function syncOne(key: RevenueSourceKey) {
  syncingKey.value = key
  try {
    reportSync(await syncRevenueSource(key, month.value))
    await Promise.all([loadSources(), loadRecords()])
  } catch (e: any) {
    message.warning(e?.message || '抽取失败')
  } finally {
    syncingKey.value = null
  }
}

async function syncAll() {
  const targets = sources.value.filter((s) => s.status === 'CONNECTED' && s.key !== 'MANUAL')
  if (!targets.length) {
    message.warning('当前没有已打通的数据源可抽取')
    return
  }
  syncingAll.value = true
  const fails: string[] = []
  try {
    for (const s of targets) {
      try {
        reportSync(await syncRevenueSource(s.key, month.value))
      } catch (e: any) {
        fails.push(`${s.name}：${e?.message || '抽取失败'}`)
      }
    }
    if (fails.length) message.warning(`需人工处理 —— ${fails.join('；')}`)
    await Promise.all([loadSources(), loadRecords()])
  } finally {
    syncingAll.value = false
  }
}

/* ===== 组织 ===== */
const orgs = ref<OrgOption[]>([])
const orgSelectOptions = computed(() =>
  orgs.value.map((o) => ({ value: o.id, label: `${o.shortName || o.name}（${o.code}）` })),
)

/* ===== 手工补录 ===== */
const manualOpen = ref(false)
const submitting = ref(false)
const manual = reactive({
  month: currentMonth(),
  orgId: undefined as string | undefined,
  source: 'MANUAL' as RevenueSourceKey,
  amount: undefined as number | undefined,
  orderCount: 0,
  remark: '',
})

function openManual(key?: RevenueSourceKey) {
  manual.month = month.value
  manual.orgId = filterOrgId.value
  manual.source = key ?? manualSourceOptions.value[0]?.key ?? 'MANUAL'
  manual.amount = undefined
  manual.orderCount = 0
  manual.remark = ''
  manualOpen.value = true
}

async function submitManual() {
  if (!manual.orgId) {
    message.warning('请选择归属门店')
    return
  }
  if (!manual.amount || manual.amount <= 0) {
    message.warning('请填写大于 0 的收入金额')
    return
  }
  submitting.value = true
  try {
    await createRevenueRecords({
      month: manual.month,
      orgId: manual.orgId,
      source: manual.source,
      amount: manual.amount,
      orderCount: manual.orderCount,
      remark: manual.remark.trim(),
    })
    message.success('已补录，财务看板收入同步更新')
    manualOpen.value = false
    loadRecords()
  } catch (e: any) {
    message.error(e?.message || '补录失败')
  } finally {
    submitting.value = false
  }
}

async function doRemove(row: RevenueRecord) {
  try {
    await removeRevenueRecord(row.id)
    message.success('已删除')
    loadRecords()
  } catch (e: any) {
    message.error(e?.message || '删除失败')
  }
}

/* ===== 打通方案 ===== */
const connectOpen = ref(false)
const connectSrc = ref<RevenueSource | null>(null)
function showConnect(s: RevenueSource) {
  connectSrc.value = s
  connectOpen.value = true
}

onMounted(async () => {
  try {
    orgs.value = await listOrgOptions({ accounting: 1 })
  } catch {
    orgs.value = []
  }
  loadSources()
  loadRecords()
})
</script>

<style scoped>
.src-card {
  border: 1px solid #ede5db;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 16px;
  background: #fffdfa;
  height: 100%;
}
.src-card.pending {
  border-color: #ffd591;
  background: #fffbf5;
}
.src-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.src-name {
  font-weight: 600;
  color: #4b3621;
}
.src-amount {
  font-size: 22px;
  font-weight: 700;
  color: #6b463c;
  margin-bottom: 8px;
}
.src-line {
  font-size: 12px;
  color: #4b3621;
  margin-bottom: 8px;
}
.src-meta {
  font-size: 12px;
  color: #999;
}
.src-note {
  font-size: 12px;
  color: #d46b08;
  margin: 8px 0;
  min-height: 32px;
}
.src-ops {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
