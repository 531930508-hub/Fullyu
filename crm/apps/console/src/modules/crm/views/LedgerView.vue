<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { crmApi, type LedgerResult, type LedgerRow } from '../api'
import { ApiError } from '@/shell/api'
import {
  bizLabel,
  fmt,
  LEDGER_TYPE_LABEL,
  LEDGER_TYPE_TONE,
  shanghaiMonth,
  tagColor
} from '@/shell/format'
import { message } from 'ant-design-vue'

const route = useRoute()
const router = useRouter()

const filters = reactive({ q: '', type: '', business: '', ref: '', from: '', to: '', size: '50' })
const page = ref(1)
const data = ref<LedgerResult | null>(null)
const loading = ref(false)
const exporting = ref(false)
const error = ref('')

const typeOptions = [
  { value: '', label: '全部' },
  ...Object.entries(LEDGER_TYPE_LABEL).map(([value, label]) => ({ value, label }))
]

const businessOptions = [
  { value: '', label: '全部' },
  { value: 'sx', label: '时叙' },
  { value: 'ql', label: '轻疗' },
  { value: 'zc', label: '在场' },
  { value: 'hq', label: '总部' }
]

const sizeOptions = ['20', '50', '100', '200'].map((value) => ({ value, label: value }))

const columns = [
  { title: '时间', dataIndex: 'createdAt', key: 'createdAt' },
  { title: '会员', dataIndex: 'memberNo', key: 'memberNo' },
  { title: '类型', dataIndex: 'type', key: 'type' },
  { title: '变动', dataIndex: 'delta', key: 'delta' },
  { title: '变动后', dataIndex: 'balanceAfter', key: 'balanceAfter' },
  { title: '业务', dataIndex: 'business', key: 'business' },
  { title: '来源单号', dataIndex: 'ref', key: 'ref' },
  { title: '操作人', dataIndex: 'operatorName', key: 'operatorName' },
  { title: '备注', dataIndex: 'note', key: 'note' }
]

const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total || 0) / (data.value?.size || 50))))

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function currentQuery(): Record<string, string> {
  const query: Record<string, string> = {}
  if (filters.q.trim()) query.q = filters.q.trim()
  if (filters.type) query.type = filters.type
  if (filters.business) query.business = filters.business
  if (filters.ref.trim()) query.ref = filters.ref.trim()
  if (filters.from) query.from = filters.from
  if (filters.to) query.to = filters.to
  if (filters.size !== '50') query.size = filters.size
  return query
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await crmApi.ledger({
      q: filters.q.trim() || undefined,
      type: filters.type || undefined,
      business: filters.business || undefined,
      ref: filters.ref.trim() || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      size: Number(filters.size) || 50,
      page: page.value
    })
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function search() {
  page.value = 1
  await router.replace({ path: '/ledger', query: currentQuery() })
  await load()
}

async function reset() {
  filters.q = ''
  filters.type = ''
  filters.business = ''
  filters.ref = ''
  filters.from = ''
  filters.to = ''
  filters.size = '50'
  await search()
}

async function goPage(next: number) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  await router.replace({ path: '/ledger', query: { ...currentQuery(), ...(next > 1 ? { page: String(next) } : {}) } })
  await load()
}

/** 导出与旧后台同一口径：最多 20 页 × 200 条，BOM + CRLF，Excel 直接打开不乱码。 */
async function exportCsv() {
  exporting.value = true
  try {
    const all: LedgerRow[] = []
    for (let p = 1; p <= 20; p += 1) {
      const chunk = await crmApi.ledger({
        q: filters.q.trim() || undefined,
        type: filters.type || undefined,
        business: filters.business || undefined,
        ref: filters.ref.trim() || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        page: p,
        size: 200
      })
      all.push(...chunk.rows)
      if (!chunk.rows.length || all.length >= chunk.total) break
    }
    if (!all.length) {
      message.warning('没有可导出的流水')
      return
    }
    const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['时间', '会员号', '姓名', '手机号', '类型', '变动', '变动后', '业务', '来源单号', '操作人', '备注'],
      ...all.map((row) => [
        fmt(row.createdAt),
        row.memberNo,
        row.memberName,
        row.phone,
        LEDGER_TYPE_LABEL[row.type] || row.type,
        row.delta,
        row.balanceAfter,
        bizLabel(row.business),
        row.ref,
        row.operatorName || '',
        row.note
      ])
    ].map((line) => line.map(cell).join(','))
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `积分流水-${shanghaiMonth()}.csv`
    link.click()
    URL.revokeObjectURL(url)
    message.success(`已导出 ${all.length} 条`)
  } catch (err) {
    message.error(err instanceof ApiError ? err.message : '导出失败，请稍后重试')
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  filters.q = str(route.query.q)
  filters.type = str(route.query.type)
  filters.business = str(route.query.business)
  filters.ref = str(route.query.ref)
  filters.from = str(route.query.from)
  filters.to = str(route.query.to)
  filters.size = str(route.query.size) || '50'
  page.value = Math.max(1, Number(str(route.query.page)) || 1)
  void load()
})
</script>

<template>
  <a-card size="small" class="block">
    <div class="toolbar">
      <div class="field">
        <label>会员</label>
        <a-input v-model:value="filters.q" placeholder="姓名 / 手机号 / 会员号" allow-clear />
      </div>
      <div class="field">
        <label>类型</label>
        <a-select v-model:value="filters.type" :options="typeOptions" style="width: 120px" />
      </div>
      <div class="field">
        <label>业务</label>
        <a-select v-model:value="filters.business" :options="businessOptions" style="width: 120px" />
      </div>
      <div class="field">
        <label>来源单号</label>
        <a-input v-model:value="filters.ref" placeholder="订单号 / 调整单号" allow-clear />
      </div>
      <div class="field">
        <label>开始日期</label>
        <a-input v-model:value="filters.from" type="date" style="width: 150px" />
      </div>
      <div class="field">
        <label>结束日期</label>
        <a-input v-model:value="filters.to" type="date" style="width: 150px" />
      </div>
      <div class="field">
        <label>每页</label>
        <a-select v-model:value="filters.size" :options="sizeOptions" style="width: 90px" />
      </div>
      <a-button type="primary" @click="search">查询</a-button>
      <a-button @click="reset">重置</a-button>
      <a-button :loading="exporting" @click="exportCsv">导出 CSV</a-button>
    </div>
    <div v-if="data" class="help block-gap">
      共 {{ data.total }} 条 · 正向 +{{ data.summary.plus }} · 负向 {{ data.summary.minus }} · 第
      {{ data.page }}/{{ totalPages }} 页
    </div>
  </a-card>

  <a-alert v-if="error" type="error" :message="error" show-icon class="block" />

  <a-card size="small">
    <a-table
      :columns="columns"
      :data-source="data?.rows || []"
      :loading="loading"
      :pagination="false"
      row-key="id"
      size="middle"
      :scroll="{ x: 1100 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'createdAt'">
          <span class="small">{{ fmt(record.createdAt) }}</span>
        </template>
        <template v-else-if="column.key === 'memberNo'">
          <div class="mono">{{ record.memberNo }}</div>
          <div class="help">{{ record.memberName }} · {{ record.phone }}</div>
        </template>
        <template v-else-if="column.key === 'type'">
          <a-tag :color="tagColor(LEDGER_TYPE_TONE[record.type] || '')">
            {{ LEDGER_TYPE_LABEL[record.type] || record.type }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'delta'">
          <b>{{ record.delta > 0 ? '+' : '' }}{{ record.delta }}</b>
        </template>
        <template v-else-if="column.key === 'business'">{{ bizLabel(record.business) }}</template>
        <template v-else-if="column.key === 'ref'">
          <span class="mono">{{ record.ref || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'operatorName'">{{ record.operatorName || '—' }}</template>
        <template v-else-if="column.key === 'note'">{{ record.note || '' }}</template>
      </template>
    </a-table>
    <div class="pager">
      <a-pagination
        :current="page"
        :page-size="data?.size || 50"
        :total="data?.total || 0"
        :show-size-changer="false"
        :show-total="(total: number) => `共 ${total} 条`"
        @change="goPage"
      />
    </div>
  </a-card>
</template>

<style scoped>
.block {
  margin-bottom: 16px;
}

.block-gap {
  margin-top: 10px;
}

.small {
  font-size: 12px;
}

.pager {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}
</style>