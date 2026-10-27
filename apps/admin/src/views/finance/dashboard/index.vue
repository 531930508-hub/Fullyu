<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px">
      <h2 class="page-title">全业务财务看板</h2>
      <a-space wrap>
        <a-select v-model:value="month" style="width: 130px" @change="load">
          <a-select-option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</a-select-option>
        </a-select>
        <a-button :loading="loading" @click="load">刷新</a-button>
      </a-space>
    </div>

    <!-- 收入口径来源 -->
    <a-card v-if="dashboard" size="small" style="margin-bottom: 16px">
      <a-space wrap>
        <span class="src-label">收入口径：</span>
        <a-tag v-for="s in dashboard.sourceMeta" :key="s.key" :color="SOURCE_STATUS_META[s.status].color">
          {{ s.name }} · {{ s.statusText }}
        </a-tag>
        <a-button type="link" size="small" @click="$router.push('/finance/revenue')">数据源管理</a-button>
      </a-space>
    </a-card>

    <a-alert
      v-if="dashboard && !dashboard.profitVisible"
      type="warning"
      show-icon
      style="margin-bottom: 16px"
      message="你的角色没有「利润与成本明细」权限，看板只展示收入口径，成本与利润相关列已隐藏。"
    />

    <!-- 汇总：收入 / 成本 / 利润 三件事 -->
    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :xs="12" :md="6">
        <a-card :loading="loading">
          <a-statistic title="当月收入" :value="total.revenue" :precision="2" prefix="¥" />
          <div class="stat-sub">{{ total.storeCount }} 家门店有本月流水 · {{ channels.length }} 个收入渠道</div>
        </a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card :loading="loading">
          <a-statistic v-if="profitVisible" title="当月成本" :value="total.totalExpense" :precision="2" prefix="¥" :value-style="{ color: '#fa8c16' }" />
          <a-statistic v-else title="当月成本" value="—" />
          <div v-if="profitVisible" class="stat-sub">
            租金 ¥{{ shortMoney(total.rent + total.property) }} · 人力 ¥{{ shortMoney(total.labor) }} · 耗材 ¥{{ shortMoney(total.consumable) }}
          </div>
        </a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card :loading="loading">
          <a-statistic
            v-if="profitVisible"
            title="当月利润"
            :value="total.profit"
            :precision="2"
            prefix="¥"
            :value-style="{ color: total.profit >= 0 ? '#52c41a' : '#f5222d' }"
          />
          <a-statistic v-else title="当月利润" value="—" />
          <div v-if="profitVisible" class="stat-sub">收入 - 成本，成本含现算租金与上缴</div>
        </a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card :loading="loading">
          <a-statistic
            v-if="profitVisible"
            title="净利率"
            :value="total.profitRate"
            :precision="2"
            suffix="%"
            :value-style="{ color: total.profitRate >= 0 ? '#52c41a' : '#f5222d' }"
          />
          <a-statistic v-else title="净利率" value="—" />
          <div v-if="profitVisible" class="stat-sub">成本率 {{ costRate }}%</div>
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" style="margin-bottom: 16px">
      <!-- 收入渠道构成 -->
      <a-col :xs="24" :lg="12">
        <a-card :title="`${month} 收入渠道构成`" :loading="loading" style="height: 100%">
          <a-empty v-if="!channels.length || !total.revenue" description="本月暂无收入流水" />
          <div v-else>
            <div v-for="c in channels" :key="c.source" class="channel">
              <div class="channel-head">
                <span>{{ c.name }}</span>
                <span class="channel-amount">¥{{ money(c.amount) }} <i class="channel-share">{{ c.share }}%</i></span>
              </div>
              <a-progress :percent="c.share" :show-info="false" :stroke-color="channelColor(c.source)" size="small" />
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 近半年经营趋势 -->
      <a-col :xs="24" :lg="12">
        <a-card title="近半年经营趋势" :loading="trendLoading" style="height: 100%">
          <a-table
            :data-source="trendRows"
            :columns="trendColumns"
            row-key="month"
            size="small"
            :pagination="false"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'month'">
                {{ record.month }}
                <a-tag v-if="record.month === month" color="blue" style="margin-left: 4px">本月</a-tag>
              </template>
              <template v-else-if="column.key === 'revenue'">
                ¥{{ shortMoney(record.revenue) }}
                <span v-if="record.mom !== null" class="mom" :class="{ down: record.mom < 0 }">
                  {{ record.mom > 0 ? '+' : '' }}{{ record.mom }}%
                </span>
              </template>
              <template v-else-if="column.key === 'totalExpense'">¥{{ shortMoney(record.totalExpense) }}</template>
              <template v-else-if="column.key === 'profit'">
                <span :style="{ color: record.profit >= 0 ? '#52c41a' : '#f5222d' }">¥{{ shortMoney(record.profit) }}</span>
              </template>
              <template v-else-if="column.key === 'profitRate'">{{ record.profitRate }}%</template>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>

    <!-- 门店损益 -->
    <a-card :title="`${month} 门店损益明细`">
      <a-table
        :data-source="stores"
        :columns="columns"
        row-key="orgId"
        :loading="loading"
        :scroll="{ x: 1500 }"
        size="small"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'revenue'">
            <b>¥{{ money(record.revenue) }}</b>
            <div class="src-detail">
              <span v-for="s in record.sources" :key="s.source">{{ s.name }} ¥{{ shortMoney(s.amount) }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'rent'">
            ¥{{ money(record.rent) }}
            <a-tooltip :title="rentTip(record)">
              <span class="rate">{{ RENT_MODE_NAMES[record.rentMode as RentMode] }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'property'">¥{{ money(record.property) }}</template>
          <template v-else-if="column.key === 'labor'">¥{{ money(record.labor) }}</template>
          <template v-else-if="column.key === 'meituan'">¥{{ money(record.meituan) }}</template>
          <template v-else-if="column.key === 'other'">¥{{ money(record.other) }}</template>
          <template v-else-if="column.key === 'consumable'">¥{{ money(record.consumable) }}</template>
          <template v-else-if="column.key === 'mgmtFee'">
            ¥{{ money(record.mgmtFee) }}
            <span class="rate">{{ record.mgmtRate }}%</span>
          </template>
          <template v-else-if="column.key === 'trainingFee'">
            ¥{{ money(record.trainingFee) }}
            <span class="rate">{{ record.trainingRate }}%</span>
          </template>
          <template v-else-if="column.key === 'totalExpense'">¥{{ money(record.totalExpense) }}</template>
          <template v-else-if="column.key === 'profit'">
            <b :style="{ color: record.profit >= 0 ? '#52c41a' : '#f5222d' }">¥{{ money(record.profit) }}</b>
            <div class="rate">{{ record.profitRate }}%</div>
          </template>
        </template>
        <template #summary>
          <a-table-summary-row>
            <a-table-summary-cell>合计</a-table-summary-cell>
            <a-table-summary-cell>¥{{ money(total.revenue) }}</a-table-summary-cell>
            <template v-if="profitVisible">
              <a-table-summary-cell>¥{{ money(total.rent) }}</a-table-summary-cell>
              <a-table-summary-cell>¥{{ money(total.property) }}</a-table-summary-cell>
              <a-table-summary-cell>¥{{ money(total.labor) }}</a-table-summary-cell>
              <a-table-summary-cell>¥{{ money(total.meituan) }}</a-table-summary-cell>
              <a-table-summary-cell>¥{{ money(total.other) }}</a-table-summary-cell>
              <a-table-summary-cell>¥{{ money(total.consumable) }}</a-table-summary-cell>
              <a-table-summary-cell>¥{{ money(total.mgmtFee) }}</a-table-summary-cell>
              <a-table-summary-cell>¥{{ money(total.trainingFee) }}</a-table-summary-cell>
              <a-table-summary-cell>¥{{ money(total.totalExpense) }}</a-table-summary-cell>
              <a-table-summary-cell>¥{{ money(total.profit) }}</a-table-summary-cell>
            </template>
          </a-table-summary-row>
        </template>
      </a-table>
      <div class="table-tip">
        房租按「月保底租金」与「当月收入 × 提成比例」取高现算，物业费取门店设定的月固定额，两项参数都在「组织架构设置」里维护，不需要在支出台账里重复录入；
        耗材成本取该门店向总部的采购单金额；管理费与培训费按当月营收 × 组织上设定的比例现算。
        当月还没有任何收入、支出或采购流水的门店不列入本表，避免只背一笔保底租金就被算成亏损。
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { RENT_MODE_NAMES, SOURCE_STATUS_META, currentMonth, recentMonths } from '@fullyu/shared'
import type { RentMode, RevenueSourceKey, StoreProfit } from '@fullyu/shared'
import { getDashboard, getDashboardTrend } from '@/api/finance'
import type { DashboardTotal, FinanceDashboard, TrendPoint } from '@/api/finance'
import { money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const monthOptions = recentMonths(12)
const month = ref(currentMonth())

const dashboard = ref<FinanceDashboard | null>(null)
const loading = ref(false)

const EMPTY_TOTAL: DashboardTotal = {
  revenue: 0,
  rent: 0,
  property: 0,
  labor: 0,
  meituan: 0,
  other: 0,
  mgmtFee: 0,
  trainingFee: 0,
  consumable: 0,
  totalExpense: 0,
  profit: 0,
  profitRate: 0,
  storeCount: 0,
}

const total = computed<DashboardTotal>(() => dashboard.value?.total ?? EMPTY_TOTAL)
const stores = computed<StoreProfit[]>(() => dashboard.value?.stores ?? [])
/** 后端已按权限抹零，这里再据此决定列是否渲染，避免展示一片 ¥0.00 让人误判 */
const profitVisible = computed(
  () => dashboard.value?.profitVisible ?? auth.hasPerm('finance:dashboard:profit'),
)

const costRate = computed(() =>
  total.value.revenue ? Math.round((total.value.totalExpense / total.value.revenue) * 10000) / 100 : 0,
)

/** 各渠道来了多少钱 —— 门店最关心的收入拆分 */
const channels = computed(() => {
  const map = new Map<string, { name: string; amount: number }>()
  for (const store of stores.value) {
    for (const src of store.sources) {
      const cur = map.get(src.source) ?? { name: src.name, amount: 0 }
      cur.amount += src.amount
      map.set(src.source, cur)
    }
  }
  const sum = [...map.values()].reduce((acc, it) => acc + it.amount, 0)
  return [...map.entries()]
    .map(([source, it]) => ({
      source: source as RevenueSourceKey,
      name: it.name,
      amount: Math.round(it.amount * 100) / 100,
      share: sum ? Math.round((it.amount / sum) * 1000) / 10 : 0,
    }))
    .filter((it) => it.amount > 0)
    .sort((a, b) => b.amount - a.amount)
})

const CHANNEL_COLORS: Record<string, string> = {
  SELF: '#6B463C',
  ONSITE: '#C08B5C',
  QINGLIAO: '#8FA98F',
  MANUAL: '#BFBFBF',
}
const channelColor = (key: string) => CHANNEL_COLORS[key] ?? '#D9B99B'

/** 房租取高的过程说给人看，免得门店以为数字是拍的 */
function rentTip(row: StoreProfit): string {
  return `保底 ¥${money(row.baseRent)}，提成 ¥${money(row.ratioRent)}（营收 × ${row.rentRate}%），二者取高`
}

const columns = computed(() =>
  [
    { title: '门店', dataIndex: 'storeName', width: 130, fixed: 'left' },
    { title: '营收', key: 'revenue', width: 190 },
    ...(profitVisible.value
      ? [
          { title: '房租', key: 'rent', width: 140 },
          { title: '物业', key: 'property', width: 100 },
          { title: '人力', key: 'labor', width: 110 },
          { title: '美团推广', key: 'meituan', width: 110 },
          { title: '其他', key: 'other', width: 100 },
          { title: '耗材成本', key: 'consumable', width: 110 },
          { title: '管理费', key: 'mgmtFee', width: 120 },
          { title: '培训费', key: 'trainingFee', width: 120 },
          { title: '支出合计', key: 'totalExpense', width: 120 },
          { title: '净利润', key: 'profit', width: 130 },
        ]
      : []),
  ],
)

async function load() {
  loading.value = true
  try {
    dashboard.value = await getDashboard(month.value)
  } catch (e: any) {
    message.error(e?.message || '看板加载失败')
  } finally {
    loading.value = false
  }
}

/* ===== 趋势 ===== */
const trend = ref<TrendPoint[]>([])
const trendLoading = ref(false)

const trendColumns = computed(() =>
  [
    { title: '月份', key: 'month', width: 130 },
    { title: '收入', key: 'revenue', width: 130 },
    ...(profitVisible.value
      ? [
          { title: '成本', key: 'totalExpense', width: 110 },
          { title: '利润', key: 'profit', width: 110 },
          { title: '净利率', key: 'profitRate', width: 90 },
        ]
      : []),
  ],
)

/** 表里按时间倒序看更顺手，环比要拿上一月比，所以先正序算完再倒过来 */
const trendRows = computed(() => {
  const asc = [...trend.value].sort((a, b) => a.month.localeCompare(b.month))
  return asc
    .map((row, i) => {
      const prev = i > 0 ? asc[i - 1] : null
      const mom =
        prev && prev.revenue ? Math.round(((row.revenue - prev.revenue) / prev.revenue) * 1000) / 10 : null
      return { ...row, mom }
    })
    .reverse()
})

/** 万元以上折成「x.x万」，看板横向空间有限 */
function shortMoney(value: number): string {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : money(value)
}

async function loadTrend() {
  trendLoading.value = true
  try {
    trend.value = await getDashboardTrend({ count: 6 })
  } catch (e: any) {
    trend.value = []
  } finally {
    trendLoading.value = false
  }
}

onMounted(() => {
  load()
  loadTrend()
})
</script>

<style scoped>
.src-label {
  color: #8c8c8c;
  font-size: 13px;
}
.stat-sub {
  margin-top: 6px;
  font-size: 12px;
  color: #8c8c8c;
}
.src-detail {
  font-size: 11px;
  color: #8c8c8c;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rate {
  font-size: 11px;
  color: #8c8c8c;
  margin-left: 4px;
}
.channel {
  margin-bottom: 14px;
}
.channel-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  margin-bottom: 2px;
}
.channel-amount {
  color: #595959;
}
.channel-share {
  font-style: normal;
  font-size: 11px;
  color: #8c8c8c;
  margin-left: 4px;
}
.mom {
  font-size: 11px;
  color: #52c41a;
  margin-left: 4px;
}
.mom.down {
  color: #f5222d;
}
.table-tip {
  margin-top: 12px;
  font-size: 12px;
  color: #8c8c8c;
  line-height: 1.7;
}
</style>
