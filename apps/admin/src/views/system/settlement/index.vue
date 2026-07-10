<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">结算管理</h2>
      <a-space>
        <a-select v-model:value="filterTrainer" style="width: 180px" allow-clear placeholder="全部导师" @change="loadSettlements">
          <a-select-option v-for="t in trainers" :key="t.id" :value="t.id">{{ t.name }}</a-select-option>
        </a-select>
        <a-button type="primary" @click="openSettle">+ 生成结算</a-button>
      </a-space>
    </div>

    <!-- 结算概览 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="8"><a-card><a-statistic title="结算笔数" :value="settlements.length" suffix="笔" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="结算总额" prefix="¥" :value="totalAmount" :value-style="{ color: '#27AE60' }" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="累计课时" :value="totalHours" suffix="小时" /></a-card></a-col>
    </a-row>

    <a-card>
      <a-table :columns="columns" :data-source="settlements" :loading="loading" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'trainer'">
            <div style="display: flex; align-items: center; gap: 8px;">
              <a-avatar size="small" :style="{ backgroundColor: '#6B463C' }">{{ (trainerMap[record.trainerId] || '导').charAt(0) }}</a-avatar>
              <span style="font-weight: 500;">{{ trainerMap[record.trainerId] || record.trainerId }}</span>
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'course'">
            {{ courseMap[record.courseId] || record.courseId }}
          </template>
          <template v-else-if="column.dataIndex === 'hours'">
            {{ Number(record.hours) }} 小时
          </template>
          <template v-else-if="column.dataIndex === 'rate'">
            ¥{{ Number(record.rate) }}/小时
          </template>
          <template v-else-if="column.dataIndex === 'amount'">
            <span style="font-weight: 600; color: #4B3621;">¥{{ Number(record.amount).toLocaleString() }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'settledAt'">
            {{ record.settledAt ? dayjs(record.settledAt).format('YYYY-MM-DD HH:mm') : '-' }}
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 生成结算弹窗 -->
    <a-modal v-model:open="settleVisible" title="生成课程结算" :confirm-loading="settling" @ok="confirmSettle">
      <a-form layout="vertical" style="margin-top: 8px;">
        <a-form-item label="选择课程" required>
          <a-select v-model:value="settleForm.courseId" show-search placeholder="选择已结束课程" :options="courseOptions" :filter-option="filterCourseOption" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="课程时长（小时）" required>
              <a-input-number v-model:value="settleForm.hours" :min="0.5" :step="0.5" style="width: 100%" placeholder="如 1.5" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="小时单价（元，选填）">
              <a-input-number v-model:value="settleForm.rate" :min="0" style="width: 100%" placeholder="默认取导师课酬" />
            </a-form-item>
          </a-col>
        </a-row>
        <div style="color: #999; font-size: 12px;">留空单价则按导师档案的课酬标准计算。</div>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { listSettlements, settle } from '@/api/settlement'
import { listTrainers } from '@/api/trainer'
import { adminListCourses } from '@/api/course'

const loading = ref(false)
const settling = ref(false)
const filterTrainer = ref<string | undefined>(undefined)
const settlements = ref<any[]>([])
const trainers = ref<any[]>([])
const courses = ref<any[]>([])

const columns = [
  { title: '导师', dataIndex: 'trainer', width: 160 },
  { title: '课程', dataIndex: 'course' },
  { title: '课时', dataIndex: 'hours', width: 100 },
  { title: '单价', dataIndex: 'rate', width: 120 },
  { title: '结算金额', dataIndex: 'amount', width: 120 },
  { title: '结算时间', dataIndex: 'settledAt', width: 160 },
]

const trainerMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  trainers.value.forEach((t: any) => { m[t.id] = t.name })
  return m
})
const courseMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  courses.value.forEach((c: any) => { m[c.id] = c.title })
  return m
})
const courseOptions = computed(() => courses.value.map((c: any) => ({ label: c.title, value: c.id })))

const totalAmount = computed(() => settlements.value.reduce((s, r) => s + Number(r.amount || 0), 0))
const totalHours = computed(() => settlements.value.reduce((s, r) => s + Number(r.hours || 0), 0))

function filterCourseOption(input: string, option: any) {
  return String(option.label || '').toLowerCase().includes(input.toLowerCase())
}

async function loadSettlements() {
  loading.value = true
  try {
    const res = await listSettlements(filterTrainer.value)
    settlements.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false
  }
}

async function loadRefs() {
  try {
    const t = await listTrainers()
    trainers.value = Array.isArray(t) ? t : (t?.list || [])
  } catch (e) {}
  try {
    const c = await adminListCourses({ page: 1, pageSize: 200 })
    courses.value = Array.isArray(c) ? c : (c?.list || [])
  } catch (e) {}
}

// 生成结算
const settleVisible = ref(false)
const settleForm = ref<{ courseId: string | undefined; hours: number | null; rate: number | null }>({ courseId: undefined, hours: null, rate: null })

function openSettle() {
  settleForm.value = { courseId: undefined, hours: null, rate: null }
  settleVisible.value = true
}

async function confirmSettle() {
  if (!settleForm.value.courseId) {
    message.warning('请选择课程')
    return
  }
  if (!settleForm.value.hours) {
    message.warning('请填写课程时长')
    return
  }
  settling.value = true
  try {
    await settle({
      courseId: settleForm.value.courseId,
      hours: settleForm.value.hours,
      ...(settleForm.value.rate != null ? { rate: settleForm.value.rate } : {}),
    })
    message.success('结算已生成')
    settleVisible.value = false
    loadSettlements()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    settling.value = false
  }
}

onMounted(() => {
  loadSettlements()
  loadRefs()
})
</script>
