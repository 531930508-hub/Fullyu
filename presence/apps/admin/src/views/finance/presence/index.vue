<template>
  <div class="page-container">
    <div class="page-header page-header-flex">
      <div class="title-wrap">
        <h2 class="page-title">在场业务看板</h2>
        <a-tag v-if="dashboard" :color="dashboard.period.status === 'CLOSED' ? 'default' : 'green'">
          {{ dashboard.period.status === 'CLOSED' ? '已关账' : '记账中' }}
        </a-tag>
      </div>
      <a-space wrap>
        <a-select v-model:value="month" style="width: 130px" @change="reloadAll">
          <a-select-option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</a-select-option>
        </a-select>
        <a-select
          v-model:value="orgId"
          style="width: 180px"
          allow-clear
          placeholder="全部组织"
          @change="reloadAll"
        >
          <a-select-option v-for="o in orgs" :key="o.id" :value="o.id">
            {{ o.shortName || o.name }}
          </a-select-option>
        </a-select>
        <a-button :loading="loading" @click="reloadAll">刷新</a-button>
        <a-button
          v-if="canClose && dashboard?.period.status === 'OPEN'"
          danger
          :loading="closing"
          @click="handleClose"
        >
          提前关账
        </a-button>
      </a-space>
    </div>

    <a-alert
      v-if="dashboard?.period.status === 'CLOSED'"
      type="info"
      show-icon
      style="margin-bottom: 16px"
      :message="`${dashboard.month} 已关账，报表数字已锁定；退款与结算调整只会进入未关账月份，不会改写历史报表。`"
    />

    <!-- 核心口径：钱进来多少、确认多少、还欠多少、付出多少 -->
    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :xs="24" :sm="12" :xl="6">
        <a-card :loading="loading" class="kpi-card">
          <a-statistic title="本月实收" :value="toYuan(dashboard?.cash.totalFen)" :precision="2" prefix="¥" />
          <div class="stat-sub">
            报课 ¥{{ money(toYuan(dashboard?.cash.courseFen)) }} · 畅练卡（历史） ¥{{ money(toYuan(dashboard?.cash.memberCardFen)) }}
          </div>
          <div class="stat-sub">
            候补 ¥{{ money(toYuan(dashboard?.cash.waitlistFen)) }} · 社群 ¥{{ money(toYuan(dashboard?.cash.communityFen)) }}
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :xl="6">
        <a-card :loading="loading" class="kpi-card">
          <a-statistic
            title="本月确认收入"
            :value="toYuan(dashboard?.revenue.totalFen)"
            :precision="2"
            prefix="¥"
            :value-style="{ color: '#6B463C' }"
          />
          <div class="stat-sub">
            课程 ¥{{ money(toYuan(dashboard?.revenue.courseFen)) }} · 畅练卡（历史） ¥{{ money(toYuan(dashboard?.revenue.memberCardFen)) }}
          </div>
          <div class="stat-sub">
            社群手续费 ¥{{ money(toYuan(dashboard?.revenue.communityFeeFen)) }}
            <span v-if="dashboard?.revenue.reversalFen" class="negative">
              · 退款冲减 ¥{{ money(toYuan(dashboard.revenue.reversalFen)) }}
            </span>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :xl="6">
        <a-card :loading="loading" class="kpi-card">
          <a-statistic
            title="期末预收"
            :value="toYuan(dashboard?.deferred.totalFen)"
            :precision="2"
            prefix="¥"
            :value-style="{ color: '#C08B5C' }"
          />
          <div class="stat-sub">
            课程 ¥{{ money(toYuan(dashboard?.deferred.courseFen)) }} · 畅练卡（历史） ¥{{ money(toYuan(dashboard?.deferred.memberCardFen)) }}
          </div>
          <div class="stat-sub">候补定金 ¥{{ money(toYuan(dashboard?.deferred.waitlistFen)) }} · 尚未确认的收入</div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :xl="6">
        <a-card :loading="loading" class="kpi-card">
          <a-statistic
            title="本月导师结算"
            :value="toYuan(dashboard?.trainer.costFen)"
            :precision="2"
            prefix="¥"
            :value-style="{ color: '#fa8c16' }"
          />
          <div class="stat-sub">{{ dashboard?.trainer.settlementCount ?? 0 }} 笔结算 · 按结算单归集</div>
          <div class="stat-sub">
            在场毛利
            <b :style="{ color: (dashboard?.grossProfitFen ?? 0) >= 0 ? '#52c41a' : '#f5222d' }">
              ¥{{ money(toYuan(dashboard?.grossProfitFen)) }}
            </b>
            = 确认收入 − 导师结算
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :xs="24" :lg="10">
        <a-card title="社群代收与手续费" :loading="loading" style="height: 100%">
          <a-row :gutter="12">
            <a-col :span="12">
              <a-statistic title="本月代收" :value="toYuan(dashboard?.community.cashFen)" :precision="2" prefix="¥" />
              <div class="stat-sub">年费全额进入代收</div>
            </a-col>
            <a-col :span="12">
              <a-statistic
                title="手续费收入"
                :value="toYuan(dashboard?.community.feeFen)"
                :precision="2"
                prefix="¥"
                :value-style="{ color: '#6B463C' }"
              />
              <div class="stat-sub">10% 一次性确认</div>
            </a-col>
            <a-col :span="12" style="margin-top: 14px">
              <a-statistic
                title="应结主理人"
                :value="toYuan(dashboard?.community.payableFen)"
                :precision="2"
                prefix="¥"
                :value-style="{ color: '#C08B5C' }"
              />
              <div class="stat-sub">累计代收 − 累计手续费</div>
            </a-col>
            <a-col :span="12" style="margin-top: 14px">
              <a-statistic
                title="本月退费冲减"
                :value="toYuan(dashboard?.community.feeReversalFen)"
                :precision="2"
                prefix="¥"
                :value-style="{ color: '#f5222d' }"
              />
              <div class="stat-sub">退款时手续费同步冲回</div>
            </a-col>
          </a-row>
          <div class="table-tip">
            社群年费不是我们的预收：90% 是代收，需结算给主理人；只有 10% 手续费确认为平台收入。
          </div>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="14">
        <a-card title="近半年在场业务趋势" :loading="loading" style="height: 100%">
          <a-table
            :data-source="dashboard?.trend ?? []"
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
              <template v-else-if="column.key === 'cashFen'">¥{{ money(toYuan(record.cashFen)) }}</template>
              <template v-else-if="column.key === 'revenueFen'">
                ¥{{ money(toYuan(record.revenueFen)) }}
              </template>
              <template v-else-if="column.key === 'trainerFen'">
                ¥{{ money(toYuan(record.trainerFen)) }}
              </template>
              <template v-else-if="column.key === 'profitFen'">
                <span :style="{ color: record.revenueFen - record.trainerFen >= 0 ? '#52c41a' : '#f5222d' }">
                  ¥{{ money(toYuan(record.revenueFen - record.trainerFen)) }}
                </span>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>

    <a-card :loading="loading">
      <a-tabs v-model:activeKey="activeTab">
        <!-- 报课与畅练卡（历史） -->
        <a-tab-pane key="courses" tab="报课与畅练卡（历史）">
          <div class="tab-toolbar">
            <a-input-search
              v-model:value="courseKeyword"
              placeholder="订单号 / 课程 / 门店"
              allow-clear
              style="width: 260px"
              @search="loadCourses(1)"
            />
            <span class="tab-tip">按订单聚合，确认收入按服务有效期逐日分摊；退款在退款当月冲减</span>
          </div>
          <a-table
            :data-source="courseRows"
            :columns="courseColumns"
            row-key="orderId"
            size="small"
            :loading="courseLoading"
            :scroll="{ x: 1180 }"
            :pagination="coursePagination"
            @change="onCourseTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'orderNo'">
                <span class="mono">{{ record.orderNo || record.orderId.slice(-8) }}</span>
              </template>
              <template v-else-if="column.key === 'name'">
                <a-tag :color="record.category === 'MEMBER_CARD' ? 'gold' : 'blue'">
                  {{ record.category === 'MEMBER_CARD' ? '畅练卡（历史）' : '课程' }}
                </a-tag>
                {{ record.name }}
              </template>
              <template v-else-if="column.key === 'orgName'">{{ record.orgName || '—' }}</template>
              <template v-else-if="column.key === 'service'">
                {{ day(record.serviceStart) }} ~ {{ day(record.serviceEnd) }}
              </template>
              <template v-else-if="column.key === 'monthCashFen'">
                ¥{{ money(toYuan(record.monthCashFen)) }}
              </template>
              <template v-else-if="column.key === 'monthRevenueFen'">
                <b>¥{{ money(toYuan(record.monthRevenueFen)) }}</b>
                <div v-if="record.monthReversalFen" class="negative small">
                  含冲减 ¥{{ money(toYuan(record.monthReversalFen)) }}
                </div>
              </template>
              <template v-else-if="column.key === 'cumulativeRevenueFen'">
                ¥{{ money(toYuan(record.cumulativeRevenueFen)) }}
              </template>
              <template v-else-if="column.key === 'deferredFen'">
                <span class="deferred">¥{{ money(toYuan(record.deferredFen)) }}</span>
              </template>
            </template>
          </a-table>
          <div class="table-summary">
            筛选范围合计：本月实收 ¥{{ money(toYuan(courseSummary.monthCashFen)) }} · 本月确认
            ¥{{ money(toYuan(courseSummary.monthRevenueFen)) }} · 退款冲减
            ¥{{ money(toYuan(courseSummary.monthReversalFen)) }} · 剩余预收
            ¥{{ money(toYuan(courseSummary.deferredFen)) }}
          </div>
        </a-tab-pane>

        <!-- 社群代收 -->
        <a-tab-pane key="community" tab="社群代收">
          <div class="tab-toolbar">
            <a-input-search
              v-model:value="communityKeyword"
              placeholder="社群 / 主理人"
              allow-clear
              style="width: 240px"
              @search="loadCommunity(1)"
            />
            <span class="tab-tip">90% 代收需结算给主理人；退款时 10% 手续费同步冲减</span>
          </div>
          <a-table
            :data-source="communityRows"
            :columns="communityColumns"
            row-key="communityId"
            size="small"
            :loading="communityLoading"
            :scroll="{ x: 980 }"
            :pagination="communityPagination"
            @change="onCommunityTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'communityName'">{{ record.communityName }}</template>
              <template v-else-if="column.key === 'hostName'">{{ record.hostName }}</template>
              <template v-else-if="column.key === 'monthCashFen'">
                ¥{{ money(toYuan(record.monthCashFen)) }}
              </template>
              <template v-else-if="column.key === 'monthFeeFen'">
                <b>¥{{ money(toYuan(record.monthFeeFen)) }}</b>
                <div v-if="record.monthReversalFen" class="negative small">
                  含冲减 ¥{{ money(toYuan(record.monthReversalFen)) }}
                </div>
              </template>
              <template v-else-if="column.key === 'cumulativeFeeFen'">
                ¥{{ money(toYuan(record.cumulativeFeeFen)) }}
              </template>
              <template v-else-if="column.key === 'payableFen'">
                <span class="deferred">¥{{ money(toYuan(record.payableFen)) }}</span>
              </template>
            </template>
          </a-table>
          <div class="table-summary">
            筛选范围合计：本月代收 ¥{{ money(toYuan(communitySummary.monthCashFen)) }} · 手续费
            ¥{{ money(toYuan(communitySummary.monthFeeFen)) }} · 退费冲减
            ¥{{ money(toYuan(communitySummary.monthReversalFen)) }} · 累计应结
            ¥{{ money(toYuan(communitySummary.payableFen)) }}
          </div>
        </a-tab-pane>

        <!-- 导师结算 -->
        <a-tab-pane key="trainers" tab="导师结算">
          <div class="tab-toolbar">
            <a-input-search
              v-model:value="trainerKeyword"
              placeholder="导师 / 课程 / 门店"
              allow-clear
              style="width: 240px"
              @search="loadTrainers(1)"
            />
            <span class="tab-tip">结算月已关账后再调整的金额，会以补差流水落在未关账月份</span>
          </div>
          <a-table
            :data-source="trainerRows"
            :columns="trainerColumns"
            row-key="settlementId"
            size="small"
            :loading="trainerLoading"
            :scroll="{ x: 1050 }"
            :pagination="trainerPagination"
            @change="onTrainerTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'trainerName'">{{ record.trainerName }}</template>
              <template v-else-if="column.key === 'courseName'">{{ record.courseName }}</template>
              <template v-else-if="column.key === 'orgName'">{{ record.orgName || '—' }}</template>
              <template v-else-if="column.key === 'hours'">{{ record.hours ?? '—' }}</template>
              <template v-else-if="column.key === 'rate'">
                {{ record.rate === null ? '—' : `¥${money(record.rate)}` }}
              </template>
              <template v-else-if="column.key === 'amountFen'">
                <b>¥{{ money(toYuan(record.amountFen)) }}</b>
                <a-tag v-if="record.adjusted" color="orange" style="margin-left: 4px">补差</a-tag>
              </template>
              <template v-else-if="column.key === 'entryDate'">{{ day(record.entryDate) }}</template>
            </template>
          </a-table>
          <div class="table-summary">
            筛选范围合计：导师结算 ¥{{ money(toYuan(trainerSummary.costFen)) }} ·
            {{ trainerSummary.trainerCount ?? 0 }} 位导师 · {{ trainerSummary.settlementCount ?? 0 }} 笔
          </div>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-card title="关账期间" size="small" style="margin-top: 16px" :loading="periodLoading">
      <a-space wrap>
        <a-tag v-for="p in periods" :key="p.month" :color="p.status === 'CLOSED' ? 'default' : 'green'">
          {{ p.month }} · {{ p.status === 'CLOSED' ? '已关账' : '记账中' }}
        </a-tag>
      </a-space>
      <div class="table-tip">
        每月 1 日 00:10 自动关账（北京时间）。已关账月份的台账与报表数字不再变化；退款、结算调整只会以负数或补差流水进入未关账月份。
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { currentMonth, recentMonths } from '@fullyu/shared'
import { listOrgOptions } from '@/api/org'
import type { OrgOption } from '@/api/org'
import {
  closePresencePeriod,
  getPresenceDashboard,
  listPresenceCommunity,
  listPresenceCourses,
  listPresencePeriods,
  listPresenceTrainers,
} from '@/api/finance'
import type {
  PresenceCommunityRow,
  PresenceCourseRow,
  PresenceDashboard,
  PresencePeriod,
  PresenceTrainerRow,
} from '@/api/finance'
import { day, money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const monthOptions = recentMonths(12)
const month = ref(currentMonth())
const orgId = ref<string | undefined>()
const orgs = ref<OrgOption[]>([])
const dashboard = ref<PresenceDashboard | null>(null)
const loading = ref(false)
const closing = ref(false)
const activeTab = ref('courses')
const canClose = computed(() => auth.hasPerm('finance:presence:close'))

function toYuan(fen?: number | null): number {
  return Math.round(Number(fen ?? 0)) / 100
}

/* ===== 总览 ===== */

async function loadDashboard() {
  loading.value = true
  try {
    dashboard.value = await getPresenceDashboard({
      month: month.value,
      orgId: orgId.value || undefined,
    })
  } catch (e: any) {
    message.error(e?.message || '在场看板加载失败')
  } finally {
    loading.value = false
  }
}

const trendColumns = [
  { title: '月份', key: 'month', width: 120 },
  { title: '实收', key: 'cashFen', width: 130 },
  { title: '确认收入', key: 'revenueFen', width: 130 },
  { title: '导师结算', key: 'trainerFen', width: 130 },
  { title: '在场毛利', key: 'profitFen', width: 130 },
]

/* ===== 报课与畅练卡（历史） ===== */

const courseRows = ref<PresenceCourseRow[]>([])
const courseTotal = ref(0)
const coursePage = ref(1)
const coursePageSize = 20
const courseKeyword = ref('')
const courseLoading = ref(false)
const courseSummary = ref<Record<string, number>>({})

const courseColumns = [
  { title: '订单号', key: 'orderNo', width: 150 },
  { title: '课程 / 畅练卡', key: 'name', width: 220 },
  { title: '归属组织', key: 'orgName', width: 120 },
  { title: '服务期', key: 'service', width: 200 },
  { title: '本月实收', key: 'monthCashFen', width: 120 },
  { title: '本月确认', key: 'monthRevenueFen', width: 130 },
  { title: '累计确认', key: 'cumulativeRevenueFen', width: 120 },
  { title: '剩余预收', key: 'deferredFen', width: 120 },
]

const coursePagination = computed(() => ({
  current: coursePage.value,
  pageSize: coursePageSize,
  total: courseTotal.value,
  showSizeChanger: false,
  showTotal: (total: number) => `共 ${total} 笔`,
}))

async function loadCourses(page = coursePage.value) {
  courseLoading.value = true
  try {
    const res = await listPresenceCourses({
      month: month.value,
      orgId: orgId.value || undefined,
      keyword: courseKeyword.value || undefined,
      page,
      pageSize: coursePageSize,
    })
    courseRows.value = res.list
    courseTotal.value = res.total
    courseSummary.value = res.summary
    coursePage.value = page
  } catch (e: any) {
    message.error(e?.message || '报课明细加载失败')
  } finally {
    courseLoading.value = false
  }
}

function onCourseTableChange(pagination: any) {
  loadCourses(pagination?.current || 1)
}

/* ===== 社群代收 ===== */

const communityRows = ref<PresenceCommunityRow[]>([])
const communityTotal = ref(0)
const communityPage = ref(1)
const communityPageSize = 20
const communityKeyword = ref('')
const communityLoading = ref(false)
const communitySummary = ref<Record<string, number>>({})

const communityColumns = [
  { title: '社群', key: 'communityName', width: 220 },
  { title: '主理人', key: 'hostName', width: 130 },
  { title: '本月代收', key: 'monthCashFen', width: 130 },
  { title: '本月手续费', key: 'monthFeeFen', width: 140 },
  { title: '累计手续费', key: 'cumulativeFeeFen', width: 130 },
  { title: '累计应结主理人', key: 'payableFen', width: 150 },
]

const communityPagination = computed(() => ({
  current: communityPage.value,
  pageSize: communityPageSize,
  total: communityTotal.value,
  showSizeChanger: false,
  showTotal: (total: number) => `共 ${total} 个社群`,
}))

async function loadCommunity(page = communityPage.value) {
  communityLoading.value = true
  try {
    const res = await listPresenceCommunity({
      month: month.value,
      keyword: communityKeyword.value || undefined,
      page,
      pageSize: communityPageSize,
    })
    communityRows.value = res.list
    communityTotal.value = res.total
    communitySummary.value = res.summary
    communityPage.value = page
  } catch (e: any) {
    message.error(e?.message || '社群代收加载失败')
  } finally {
    communityLoading.value = false
  }
}

function onCommunityTableChange(pagination: any) {
  loadCommunity(pagination?.current || 1)
}

/* ===== 导师结算 ===== */

const trainerRows = ref<PresenceTrainerRow[]>([])
const trainerTotal = ref(0)
const trainerPage = ref(1)
const trainerPageSize = 20
const trainerKeyword = ref('')
const trainerLoading = ref(false)
const trainerSummary = ref<Record<string, number>>({})

const trainerColumns = [
  { title: '导师', key: 'trainerName', width: 120 },
  { title: '课程', key: 'courseName', width: 220 },
  { title: '归属组织', key: 'orgName', width: 120 },
  { title: '课时', key: 'hours', width: 80 },
  { title: '时薪', key: 'rate', width: 100 },
  { title: '本月结算', key: 'amountFen', width: 140 },
  { title: '结算日', key: 'entryDate', width: 120 },
]

const trainerPagination = computed(() => ({
  current: trainerPage.value,
  pageSize: trainerPageSize,
  total: trainerTotal.value,
  showSizeChanger: false,
  showTotal: (total: number) => `共 ${total} 笔`,
}))

async function loadTrainers(page = trainerPage.value) {
  trainerLoading.value = true
  try {
    const res = await listPresenceTrainers({
      month: month.value,
      orgId: orgId.value || undefined,
      keyword: trainerKeyword.value || undefined,
      page,
      pageSize: trainerPageSize,
    })
    trainerRows.value = res.list
    trainerTotal.value = res.total
    trainerSummary.value = res.summary
    trainerPage.value = page
  } catch (e: any) {
    message.error(e?.message || '导师结算加载失败')
  } finally {
    trainerLoading.value = false
  }
}

function onTrainerTableChange(pagination: any) {
  loadTrainers(pagination?.current || 1)
}

/* ===== 关账期间 ===== */

const periods = ref<PresencePeriod[]>([])
const periodLoading = ref(false)

async function loadPeriods() {
  periodLoading.value = true
  try {
    const res = await listPresencePeriods()
    periods.value = res.periods
  } catch (e: any) {
    periods.value = []
  } finally {
    periodLoading.value = false
  }
}

function handleClose() {
  Modal.confirm({
    title: `确认提前关账 ${month.value}？`,
    content:
      '关账后本月台账不再随业务变化重算，后续退款与结算调整会进入未关账月份。已关账月份不能撤回。',
    okText: '确认关账',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      closing.value = true
      try {
        await closePresencePeriod(month.value)
        message.success(`${month.value} 已关账`)
        await reloadAll()
      } catch (e: any) {
        message.error(e?.message || '关账失败')
      } finally {
        closing.value = false
      }
    },
  })
}

/* ===== 初始化与刷新 ===== */

function reloadAll() {
  coursePage.value = 1
  communityPage.value = 1
  trainerPage.value = 1
  loadDashboard()
  loadCourses(1)
  loadCommunity(1)
  loadTrainers(1)
  loadPeriods()
}

onMounted(async () => {
  try {
    orgs.value = await listOrgOptions({ accounting: 1 })
  } catch (e) {
    orgs.value = []
  }
  reloadAll()
})
</script>

<style scoped>
.page-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.kpi-card :deep(.ant-statistic-content) {
  font-size: 24px;
}
.stat-sub {
  margin-top: 6px;
  font-size: 12px;
  color: #8c8c8c;
  line-height: 1.6;
}
.negative {
  color: #f5222d;
}
.small {
  font-size: 11px;
}
.deferred {
  color: #c08b5c;
  font-weight: 600;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.tab-tip {
  font-size: 12px;
  color: #8c8c8c;
}
.table-summary {
  margin-top: 12px;
  font-size: 12px;
  color: #595959;
  background: #faf7f2;
  border-radius: 6px;
  padding: 8px 12px;
}
.table-tip {
  margin-top: 12px;
  font-size: 12px;
  color: #8c8c8c;
  line-height: 1.7;
}
</style>
