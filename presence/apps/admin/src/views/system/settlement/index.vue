<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">结算管理</h2>
      <a-space>
        <a-select v-model:value="filterTrainer" style="width: 180px" allow-clear placeholder="全部导师" show-search :filter-option="filterOption" @change="loadSettlements">
          <a-select-option v-for="t in trainers" :key="t.id" :value="t.id">{{ t.displayName }}</a-select-option>
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
      <a-table :columns="columns" :data-source="settlements" :loading="loading" row-key="id" :row-selection="{ selectedRowKeys, onChange: onSelectChange }">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'trainer'">
            <div style="display: flex; align-items: center; gap: 8px;">
              <a-avatar size="small" :style="{ backgroundColor: '#6B463C' }">{{ (record.trainerName || '导').charAt(0) }}</a-avatar>
              <span style="font-weight: 500;">{{ record.trainerName || record.trainerId }}</span>
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'course'">
            {{ record.courseName || record.courseId }}
          </template>
          <template v-else-if="column.dataIndex === 'hours'">
            {{ Number(record.hours) }} 小时
          </template>
          <template v-else-if="column.dataIndex === 'rate'">
            ¥{{ Number(record.rate) }}/小时
          </template>
          <template v-else-if="column.dataIndex === 'amount'">
            <div>
              <span style="font-weight: 600; color: #4B3621;">¥{{ Number(record.adjustedAmount ?? record.amount).toLocaleString() }}</span>
              <div v-if="record.status === 'ADJUSTED'" style="font-size: 11px; color: #F39C12;">已调整（原 ¥{{ Number(record.amount).toLocaleString() }}）</div>
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <a-tag :color="record.status === 'ADJUSTED' ? 'orange' : 'green'">{{ record.status === 'ADJUSTED' ? '已调整' : '正常' }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'settledAt'">
            {{ record.settledAt ? dayjs(record.settledAt).format('YYYY-MM-DD HH:mm') : '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-button type="link" size="small" @click="openAdjust(record)">调整</a-button>
          </template>
        </template>
      </a-table>
      <div v-if="selectedRowKeys.length > 0" style="margin-top: 12px;">
        <a-button type="primary" ghost @click="openBatchAdjust">批量调整（已选 {{ selectedRowKeys.length }} 笔）</a-button>
      </div>
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
              <a-input-number v-model:value="settleForm.rate" :min="0" style="width: 100%" placeholder="默认取导师等级课酬" />
            </a-form-item>
          </a-col>
        </a-row>
        <div style="color: #999; font-size: 12px;">留空单价则按导师等级配置的课酬标准计算。</div>
      </a-form>
    </a-modal>

    <!-- 人工调整弹窗 -->
    <a-modal v-model:open="adjustVisible" title="人工调整结算" :confirm-loading="adjusting" @ok="confirmAdjust">
      <a-form layout="vertical">
        <a-form-item label="当前结算金额">
          <span style="font-weight: 600;">¥{{ Number(adjustForm.originalAmount).toLocaleString() }}</span>
          <span style="margin-left: 8px; color: #999;">（{{ adjustForm.trainerName }} / {{ adjustForm.courseName }}）</span>
        </a-form-item>
        <a-form-item label="调整后金额（元）" required>
          <a-input-number v-model:value="adjustForm.adjustedAmount" :min="0" style="width: 100%" prefix="¥" />
        </a-form-item>
        <a-form-item label="调整原因" required>
          <a-input v-model:value="adjustForm.adjustNote" placeholder="请说明调整原因" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 批量调整弹窗 -->
    <a-modal v-model:open="batchAdjustVisible" title="批量调整结算" :confirm-loading="batchAdjusting" @ok="confirmBatchAdjust">
      <a-form layout="vertical">
        <a-form-item label="调整说明" required>
          <a-input v-model:value="batchForm.adjustNote" placeholder="本次批量调整的统一说明" />
        </a-form-item>
        <a-form-item label="调整方式">
          <a-radio-group v-model:value="batchForm.mode">
            <a-radio value="fixed">固定金额</a-radio>
            <a-radio value="percent">按比例</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="batchForm.mode === 'fixed'" label="调整后金额（元）">
          <a-input-number v-model:value="batchForm.fixedAmount" :min="0" style="width: 100%" prefix="¥" />
        </a-form-item>
        <a-form-item v-else label="调整比例（%）">
          <a-input-number v-model:value="batchForm.percent" :min="0" :max="200" style="width: 100%" :formatter="(v: any) => `${v}%`" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { listSettlements, settle, adjustSettlement, batchAdjustSettlements } from '@/api/settlement'
import { listTrainers } from '@/api/trainer'
import { adminListCourses } from '@/api/course'

const loading = ref(false)
const settling = ref(false)
const adjusting = ref(false)
const batchAdjusting = ref(false)
const filterTrainer = ref<string | undefined>(undefined)
const settlements = ref<any[]>([])
const trainers = ref<any[]>([])
const courses = ref<any[]>([])
const selectedRowKeys = ref<string[]>([])

const columns = [
  { title: '导师', dataIndex: 'trainer', width: 160 },
  { title: '课程', dataIndex: 'course' },
  { title: '课时', dataIndex: 'hours', width: 100 },
  { title: '单价', dataIndex: 'rate', width: 120 },
  { title: '结算金额', dataIndex: 'amount', width: 140 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '结算时间', dataIndex: 'settledAt', width: 160 },
  { title: '操作', dataIndex: 'action', width: 80 },
]

const courseOptions = computed(() => courses.value.map((c: any) => ({ label: c.title, value: c.id })))

const totalAmount = computed(() => settlements.value.reduce((s, r) => s + Number(r.adjustedAmount ?? r.amount ?? 0), 0))
const totalHours = computed(() => settlements.value.reduce((s, r) => s + Number(r.hours || 0), 0))

function filterOption(input: string, option: any) {
  return String(option.children || option.label || '').toLowerCase().includes(input.toLowerCase())
}
function filterCourseOption(input: string, option: any) {
  return String(option.label || '').toLowerCase().includes(input.toLowerCase())
}
function onSelectChange(keys: string[]) {
  selectedRowKeys.value = keys
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
  if (!settleForm.value.courseId) { message.warning('请选择课程'); return }
  if (!settleForm.value.hours) { message.warning('请填写课程时长'); return }
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
  } catch (e) {} finally { settling.value = false }
}

// 人工调整（单笔）
const adjustVisible = ref(false)
const adjustForm = ref({ id: '', originalAmount: 0, adjustedAmount: 0, adjustNote: '', trainerName: '', courseName: '' })

function openAdjust(record: any) {
  adjustForm.value = {
    id: record.id,
    originalAmount: Number(record.amount),
    adjustedAmount: Number(record.adjustedAmount ?? record.amount),
    adjustNote: '',
    trainerName: record.trainerName || '',
    courseName: record.courseName || '',
  }
  adjustVisible.value = true
}

async function confirmAdjust() {
  if (!adjustForm.value.adjustNote) { message.warning('请填写调整原因'); return }
  adjusting.value = true
  try {
    await adjustSettlement(adjustForm.value.id, {
      adjustedAmount: adjustForm.value.adjustedAmount,
      adjustNote: adjustForm.value.adjustNote,
    })
    message.success('结算已调整')
    adjustVisible.value = false
    loadSettlements()
  } catch (e) {} finally { adjusting.value = false }
}

// 批量调整
const batchAdjustVisible = ref(false)
const batchForm = ref({ mode: 'fixed' as 'fixed' | 'percent', fixedAmount: 0, percent: 100, adjustNote: '' })

function openBatchAdjust() {
  batchForm.value = { mode: 'fixed', fixedAmount: 0, percent: 100, adjustNote: '' }
  batchAdjustVisible.value = true
}

async function confirmBatchAdjust() {
  if (!batchForm.value.adjustNote) { message.warning('请填写调整说明'); return }
  const items = selectedRowKeys.value.map(id => {
    const record = settlements.value.find(s => s.id === id)
    let adjustedAmount = batchForm.value.fixedAmount
    if (batchForm.value.mode === 'percent' && record) {
      adjustedAmount = Math.round(Number(record.amount) * batchForm.value.percent / 100)
    }
    return { id, adjustedAmount, adjustNote: batchForm.value.adjustNote }
  })
  batchAdjusting.value = true
  try {
    await batchAdjustSettlements(items)
    message.success('批量调整完成')
    batchAdjustVisible.value = false
    selectedRowKeys.value = []
    loadSettlements()
  } catch (e) {} finally { batchAdjusting.value = false }
}

onMounted(() => {
  loadSettlements()
  loadRefs()
})
</script>
