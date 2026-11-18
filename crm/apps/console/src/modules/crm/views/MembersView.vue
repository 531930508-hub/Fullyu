<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { crmApi, type MemberRow } from '../api'
import { ApiError } from '@/shell/api'
import { bizLabel, statusLabel, statusTone, tagColor } from '@/shell/format'

const route = useRoute()
const router = useRouter()

const filters = reactive({ q: '', business: '' })
const rows = ref<MemberRow[]>([])
const loading = ref(false)
const error = ref('')

const businessOptions = [
  { value: '', label: '全部' },
  { value: 'sx', label: '时叙' },
  { value: 'ql', label: '轻疗' },
  { value: 'zc', label: '在场' }
]

const columns = [
  { title: '会员号', dataIndex: 'memberNo', key: 'memberNo' },
  { title: '姓名', dataIndex: 'name', key: 'name' },
  { title: '手机号', dataIndex: 'phone', key: 'phone' },
  { title: '积分余额', dataIndex: 'balance', key: 'balance' },
  { title: '业务身份', dataIndex: 'identities', key: 'identities' },
  { title: '状态', dataIndex: 'status', key: 'status' }
]

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function identityText(identities: { business: string }[]): string {
  return identities.map((row) => bizLabel(row.business)).join(' · ') || '—'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = await crmApi.members({
      q: filters.q.trim() || undefined,
      business: filters.business || undefined
    })
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function submit() {
  await router.replace({
    path: '/members',
    query: {
      ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
      ...(filters.business ? { business: filters.business } : {})
    }
  })
  await load()
}

onMounted(() => {
  filters.q = str(route.query.q)
  filters.business = str(route.query.business)
  void load()
})
</script>

<template>
  <a-card size="small" class="block">
    <div class="toolbar">
      <div class="field">
        <label>搜索</label>
        <a-input
          v-model:value="filters.q"
          placeholder="姓名 / 手机号 / 会员号"
          allow-clear
          style="width: 240px"
          @press-enter="submit"
        />
      </div>
      <div class="field">
        <label>业务身份</label>
        <a-select v-model:value="filters.business" :options="businessOptions" style="width: 140px" />
      </div>
      <a-button type="primary" @click="submit">查询</a-button>
    </div>
  </a-card>

  <a-alert v-if="error" type="error" :message="error" show-icon class="block" />

  <a-card size="small">
    <template #title>
      <span class="help">共 {{ rows.length }} 位（最多显示 50）</span>
    </template>
    <a-table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="false"
      row-key="id"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'memberNo'">
          <span class="mono">{{ record.memberNo }}</span>
        </template>
        <template v-else-if="column.key === 'phone'">
          <span class="mono">{{ record.phone }}</span>
        </template>
        <template v-else-if="column.key === 'identities'">
          {{ identityText(record.identities) }}
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="tagColor(statusTone(record.status))">{{ statusLabel(record.status) }}</a-tag>
        </template>
      </template>
    </a-table>
    <div class="help">会员详情页尚未迁移，本批次先提供列表与筛选。</div>
  </a-card>
</template>

<style scoped>
.block {
  margin-bottom: 16px;
}
</style>