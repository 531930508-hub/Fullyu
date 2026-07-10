<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">会员卡管理</h2>
      <a-space>
        <a-select v-model:value="filterStatus" style="width: 120px" @change="loadCards">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option value="ACTIVE">有效</a-select-option>
          <a-select-option value="FROZEN">冻结</a-select-option>
          <a-select-option value="EXPIRED">过期</a-select-option>
        </a-select>
      </a-space>
    </div>

    <!-- 统计 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="6"><a-card><a-statistic title="总会员卡" :value="cards.length" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="有效" :value="cards.filter(c => c.status === 'ACTIVE').length" :value-style="{ color: '#27AE60' }" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="冻结" :value="cards.filter(c => c.status === 'FROZEN').length" :value-style="{ color: '#F39C12' }" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="年卡" :value="cards.filter(c => c.type === 'YEARLY').length" :value-style="{ color: '#F39C12' }" /></a-card></a-col>
    </a-row>

    <!-- 列表 -->
    <a-card>
      <a-table :columns="columns" :data-source="cards" :loading="loading" size="small" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'user'">
            <div style="display: flex; align-items: center; gap: 8px;">
              <a-avatar size="small" :style="{ backgroundColor: '#6B463C' }">{{ (record.user?.nickname || '会').charAt(0) }}</a-avatar>
              <div>
                <div style="font-weight: 500; color: #4B3621;">{{ record.user?.nickname || '未命名' }}</div>
                <div style="font-size: 12px; color: #999;">{{ record.user?.phone }}</div>
              </div>
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'type'">
            <a-tag :color="typeColors[record.type]">{{ typeLabels[record.type] }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'startDate'">
            {{ record.startDate ? dayjs(record.startDate).format('YYYY-MM-DD') : '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'endDate'">
            {{ record.endDate ? dayjs(record.endDate).format('YYYY-MM-DD') : '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <a-tag :color="statusColors[record.status]">{{ statusLabels[record.status] }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-space>
              <a-popconfirm v-if="record.status === 'ACTIVE'" title="确定冻结该会员卡？" @confirm="handleFreeze(record)">
                <a style="color: #F39C12;">冻结</a>
              </a-popconfirm>
              <a-popconfirm v-else-if="record.status === 'FROZEN'" title="确定解冻该会员卡？" @confirm="handleUnfreeze(record)">
                <a style="color: #27AE60;">解冻</a>
              </a-popconfirm>
              <span v-else style="color: #ccc;">-</span>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { adminListCards, freezeCard, unfreezeCard } from '@/api/member'

const loading = ref(false)
const filterStatus = ref('')

const typeLabels: Record<string, string> = { MONTHLY: '月卡', QUARTERLY: '季卡', YEARLY: '年卡' }
const typeColors: Record<string, string> = { MONTHLY: 'blue', QUARTERLY: 'purple', YEARLY: 'gold' }
const statusLabels: Record<string, string> = { ACTIVE: '有效', FROZEN: '冻结', EXPIRED: '过期' }
const statusColors: Record<string, string> = { ACTIVE: 'green', FROZEN: 'orange', EXPIRED: 'default' }

const columns = [
  { title: '会员', dataIndex: 'user', width: 200 },
  { title: '卡类型', dataIndex: 'type', width: 100 },
  { title: '开卡日期', dataIndex: 'startDate', width: 120 },
  { title: '到期日期', dataIndex: 'endDate', width: 120 },
  { title: '缺席次数', dataIndex: 'absences', width: 90 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

const cards = ref<any[]>([])

async function loadCards() {
  loading.value = true
  try {
    const res = await adminListCards(filterStatus.value ? { status: filterStatus.value } : undefined)
    cards.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false
  }
}

async function handleFreeze(record: any) {
  try {
    await freezeCard(record.id)
    message.success('会员卡已冻结')
    loadCards()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

async function handleUnfreeze(record: any) {
  try {
    await unfreezeCard(record.id)
    message.success('会员卡已解冻')
    loadCards()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

onMounted(() => loadCards())
</script>
