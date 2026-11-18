<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { crmApi, type AdjustmentRow, type MonthlyReport, type PrizeRow, type SyncStatus } from '../api'
import { ApiError } from '@/shell/api'
import { useSessionStore } from '@/shell/session'
import { bizLabel, fmt, fmtLag, lagColor, money, shanghaiMonth } from '@/shell/format'

const session = useSessionStore()

const loading = ref(true)
const error = ref('')
const sync = ref<SyncStatus | null>(null)
const adjustments = ref<AdjustmentRow[]>([])
const prizes = ref<PrizeRow[]>([])
const report = ref<MonthlyReport | null>(null)

const month = shanghaiMonth()

const pendingAdjust = computed(() => adjustments.value.filter((row) => row.status === 'PENDING'))

/** 未接入（lag 为 null）不参与统计；三端全未接入时返回 null，避免显示成「总滞后 0 秒」。 */
const maxLag = computed(() => {
  if (!sync.value) return null
  const lags = sync.value.businesses
    .map((row) => row.lagSeconds)
    .filter((value): value is number => value !== null)
  return lags.length ? Math.max(0, ...lags) : null
})

const deliveryDisabled = computed(() =>
  Boolean(sync.value && (!sync.value.delivery || !sync.value.delivery.enabled))
)

/** 与旧后台一致：403/404 视为「没有这块数据」，不阻塞概览。 */
async function safe<T>(allowed: boolean, load: () => Promise<T>, fallback: T): Promise<T> {
  if (!allowed) return fallback
  try {
    return await load()
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return fallback
    throw err
  }
}

const syncColumns = [
  { title: '业务端', dataIndex: 'business', key: 'business' },
  { title: '最近调用', dataIndex: 'lastSeenAt', key: 'lastSeenAt' },
  { title: '滞后', dataIndex: 'lagSeconds', key: 'lagSeconds' },
  { title: 'Webhook', dataIndex: 'webhookConfigured', key: 'webhookConfigured' },
  { title: '待投递', dataIndex: 'pending', key: 'pending' },
  { title: '失败', dataIndex: 'failed', key: 'failed' },
  { title: '已投递', dataIndex: 'deliveredCount', key: 'deliveredCount' }
]

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [syncData, adjustmentData, prizeData, reportData] = await Promise.all([
      safe(session.can('crm:sync:view'), crmApi.syncStatus, null as SyncStatus | null),
      safe(
        session.canAny(['crm:adjust:create', 'crm:adjust:approve', 'crm:adjust:batch']),
        crmApi.adjustments,
        [] as AdjustmentRow[]
      ),
      safe(session.can('crm:member:view'), crmApi.pendingPrizes, { prizes: [] as PrizeRow[] }),
      safe(session.can('crm:report:view'), () => crmApi.monthlyReport(month), null as MonthlyReport | null)
    ])
    sync.value = syncData
    adjustments.value = adjustmentData
    prizes.value = prizeData.prizes
    report.value = reportData
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <a-spin :spinning="loading">
    <a-alert v-if="error" type="error" :message="error" show-icon class="block" />

    <a-row :gutter="16">
      <a-col :span="8">
        <a-card size="small">
          <a-statistic
            title="本月品牌卡"
            :value="report ? report.cards.total.count : '—'"
            :value-style="{ color: '#4B3621' }"
          />
          <div class="help">{{ report ? `实收 ${money(report.cards.total.grossCents)}` : '无对账权限' }}</div>
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card size="small">
          <a-statistic title="待审批调整" :value="pendingAdjust.length" :value-style="{ color: '#4B3621' }" />
          <div class="help">超过 500 分或批量需另一人审批</div>
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card size="small">
          <a-statistic title="待交付礼物" :value="prizes.length" :value-style="{ color: '#4B3621' }" />
          <div class="help">到店人工确认，不用扫码</div>
        </a-card>
      </a-col>
    </a-row>

    <a-card size="small" class="block" title="三端同步">
      <a-alert
        v-if="deliveryDisabled"
        type="warning"
        show-icon
        class="block-gap"
        message="投递 worker 未启用（未设置 CRM_OUTBOX_INTERVAL_MS）"
        description="事件只会累积在「待投递」，不会自动送达各端；需在 crm.env 配置间隔后重启，或手动触发投递。"
      />
      <a-table
        v-if="sync"
        :columns="syncColumns"
        :data-source="sync.businesses"
        :pagination="false"
        row-key="business"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'business'">{{ bizLabel(record.business) }}</template>
          <template v-else-if="column.key === 'lastSeenAt'">
            <a-tag v-if="!record.lastSeenAt" color="default">未接入</a-tag>
            <span v-else :title="record.lastPath">{{ fmt(record.lastSeenAt) }}</span>
          </template>
          <template v-else-if="column.key === 'lagSeconds'">
            <a-tag v-if="record.lagSeconds === null" color="default">—</a-tag>
            <a-tag v-else :color="lagColor(record.lagSeconds)">{{ fmtLag(record.lagSeconds) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'webhookConfigured'">
            <a-tag :color="record.webhookConfigured ? 'success' : 'warning'">
              {{ record.webhookConfigured ? '已配置' : '未配置' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'failed'">
            <a-tag v-if="record.failed" color="error">{{ record.failed }}</a-tag>
            <span v-else>0</span>
          </template>
          <template v-else-if="column.key === 'deliveredCount'">
            <span class="mono">{{ record.deliveredCount }}</span>
          </template>
        </template>
      </a-table>
      <div v-else class="help">{{ loading ? '加载中…' : '当前账号无同步查看权限' }}</div>
      <div v-if="sync" class="help block-gap">
        滞后 = 距该端最近一次签名调用（会员/积分与品牌卡接口都算），未接入显示「—」；超过 12 小时黄、48 小时红。
        当前总滞后（仅已接入端）{{ maxLag === null ? '无可统计的端' : fmtLag(maxLag) }}。
        「已投递」是累计成功事件数。未配置 Webhook 时事件保留在待投递，不当作已同步。
      </div>
    </a-card>

    <a-card size="small" class="block" title="快速入口">
      <a-space>
        <a-button v-if="session.can('crm:member:view')" @click="$router.push('/members')">查会员</a-button>
        <a-button v-if="session.can('crm:member:view')" @click="$router.push('/ledger')">积分流水</a-button>
        <span class="help">调整审批、游戏礼物、月度对账仍在旧后台，迁移完成后接入。</span>
      </a-space>
    </a-card>
  </a-spin>
</template>

<style scoped>
.block {
  margin-bottom: 16px;
}

.block-gap {
  margin-top: 10px;
}
</style>
