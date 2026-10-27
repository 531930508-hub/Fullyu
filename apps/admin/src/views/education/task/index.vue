<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">任务管理</h2>
      <a-space>
        <a-select v-model:value="filterScope" style="width: 120px">
          <a-select-option value="">全部范围</a-select-option>
          <a-select-option value="ALL">全员</a-select-option>
          <a-select-option value="SPECIFIC">指定导师</a-select-option>
        </a-select>
        <a-select v-model:value="filterStatus" style="width: 120px" @change="loadTasks">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option value="PUBLISHED">进行中</a-select-option>
          <a-select-option value="COMPLETED">已完成</a-select-option>
          <a-select-option value="CANCELLED">已取消</a-select-option>
        </a-select>
        <a-button v-perm="'task:create'" type="primary" @click="openCreate">发布任务</a-button>
      </a-space>
    </div>

    <!-- 任务统计 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="6"><a-card><a-statistic title="进行中" :value="stat.published" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="已完成" :value="stat.completed" :value-style="{ color: '#27AE60' }" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="累计领取" :value="stat.claimed" suffix="人次" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="任务总数" :value="tasks.length" /></a-card></a-col>
    </a-row>

    <!-- 任务列表 -->
    <a-card>
      <a-table :columns="columns" :data-source="filteredTasks" row-key="id" :loading="loading">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'name'">
            <div>
              <div style="font-weight: 500;">{{ record.title }}</div>
              <div style="color: #999; font-size: 12px;">{{ record.description }}</div>
            </div>
          </template>
          <template v-if="column.dataIndex === 'scope'">
            <a-tag :color="record.scope === 'ALL' ? 'blue' : 'orange'">{{ record.scopeLabel }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'reward'">
            <span style="color: #F39C12; font-weight: 500;">{{ record.seedsReward }} 积分</span>
          </template>
          <template v-if="column.dataIndex === 'progress'">
            <a-progress :percent="record.progress" size="small" :stroke-color="'#6B463C'" />
            <span style="font-size: 12px; color: #999;">{{ record.claimed }}/{{ record.maxParticipants }}人</span>
          </template>
          <template v-if="column.dataIndex === 'status'">
            <a-badge :status="record.status === 'PUBLISHED' ? 'processing' : record.status === 'COMPLETED' ? 'success' : 'default'" :text="record.statusLabel" />
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-space>
              <a-button v-perm="'task:update'" type="link" size="small" @click="openEdit(record)">编辑</a-button>
              <a-popconfirm v-if="record.status === 'PUBLISHED'" title="确定取消该任务？" @confirm="handleCancel(record)">
                <a-button type="link" size="small" danger>取消</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 发布/编辑任务弹窗 -->
    <a-modal v-model:open="modalVisible" :title="isEditing ? '编辑任务' : '发布任务'" width="600px" @ok="handleSave" :confirm-loading="saving">
      <a-form layout="vertical">
        <a-form-item label="任务名称"><a-input v-model:value="form.title" placeholder="如：完成3次冥想打卡" /></a-form-item>
        <a-form-item label="任务描述"><a-textarea v-model:value="form.description" :rows="2" placeholder="任务详细说明" /></a-form-item>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="任务范围">
              <a-select v-model:value="form.scope" placeholder="选择范围">
                <a-select-option value="ALL">全员</a-select-option>
                <a-select-option value="SPECIFIC">指定导师</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="奖励积分"><a-input-number v-model:value="form.seedsReward" :min="0" style="width: 100%" /></a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="参与名额"><a-input-number v-model:value="form.maxParticipants" :min="1" style="width: 100%" /></a-form-item>
          </a-col>
        </a-row>
        <a-form-item v-if="form.scope === 'SPECIFIC'" label="指定导师">
          <a-select v-model:value="form.specificTrainerIds" mode="multiple" placeholder="选择导师" :options="trainerOptions" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { listTasks, createTask, updateTask, cancelTask } from '@/api/task'
import { listTrainers } from '@/api/trainer'

const loading = ref(false)
const saving = ref(false)
const filterScope = ref('')
const filterStatus = ref('')
const tasks = ref<any[]>([])
const trainerOptions = ref<any[]>([])

const scopeLabelMap: Record<string, string> = { ALL: '全员', SPECIFIC: '指定导师' }
const statusLabelMap: Record<string, string> = { PUBLISHED: '进行中', COMPLETED: '已完成', CANCELLED: '已取消' }

const columns = [
  { title: '任务', dataIndex: 'name', width: 250 },
  { title: '范围', dataIndex: 'scope', width: 100 },
  { title: '奖励', dataIndex: 'reward', width: 100 },
  { title: '领取进度', dataIndex: 'progress', width: 200 },
  { title: '状态', dataIndex: 'status', width: 100 },
  { title: '操作', dataIndex: 'action', width: 140 },
]

function mapTask(t: any) {
  const claimed = t._count?.claims ?? 0
  const total = t.maxParticipants ?? 0
  return {
    ...t,
    scopeLabel: scopeLabelMap[t.scope] || t.scope,
    statusLabel: statusLabelMap[t.status] || t.status,
    claimed,
    progress: total > 0 ? Math.round((claimed / total) * 100) : 0,
  }
}

const filteredTasks = computed(() => {
  return tasks.value.filter(t => !filterScope.value || t.scope === filterScope.value)
})

const stat = computed(() => ({
  published: tasks.value.filter(t => t.status === 'PUBLISHED').length,
  completed: tasks.value.filter(t => t.status === 'COMPLETED').length,
  claimed: tasks.value.reduce((s, t) => s + (t.claimed || 0), 0),
}))

async function loadTasks() {
  loading.value = true
  try {
    const data: any = await listTasks(filterStatus.value || undefined)
    tasks.value = (Array.isArray(data) ? data : []).map(mapTask)
  } catch (e: any) {
    message.error(e?.message || '加载任务失败')
  } finally {
    loading.value = false
  }
}

async function loadTrainers() {
  try {
    const data: any = await listTrainers()
    trainerOptions.value = (Array.isArray(data) ? data : []).map((t: any) => ({ value: t.id, label: t.displayName }))
  } catch { /* 忽略 */ }
}

onMounted(() => { loadTasks(); loadTrainers() })

// ===== 发布/编辑 =====
const modalVisible = ref(false)
const isEditing = ref(false)
const editingId = ref('')
const form = ref<any>({ title: '', description: '', scope: 'ALL', seedsReward: 10, maxParticipants: 10, specificTrainerIds: [] as string[] })

function openCreate() {
  isEditing.value = false
  editingId.value = ''
  form.value = { title: '', description: '', scope: 'ALL', seedsReward: 10, maxParticipants: 10, specificTrainerIds: [] }
  modalVisible.value = true
}

function openEdit(record: any) {
  isEditing.value = true
  editingId.value = record.id
  form.value = {
    title: record.title,
    description: record.description,
    scope: record.scope,
    seedsReward: record.seedsReward,
    maxParticipants: record.maxParticipants,
    specificTrainerIds: record.specificTrainerIds || [],
  }
  modalVisible.value = true
}

async function handleSave() {
  if (!form.value.title) { message.warning('请输入任务名称'); return }
  saving.value = true
  try {
    const payload = {
      title: form.value.title,
      description: form.value.description,
      scope: form.value.scope,
      seedsReward: form.value.seedsReward,
      maxParticipants: form.value.maxParticipants,
      specificTrainerIds: form.value.scope === 'SPECIFIC' ? form.value.specificTrainerIds : [],
    }
    if (isEditing.value) {
      await updateTask(editingId.value, payload)
      message.success('任务更新成功')
    } else {
      await createTask(payload)
      message.success('任务发布成功')
    }
    modalVisible.value = false
    loadTasks()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleCancel(record: any) {
  try {
    await cancelTask(record.id)
    message.success(`任务「${record.title}」已取消`)
    loadTasks()
  } catch (e: any) {
    message.error(e?.message || '取消失败')
  }
}
</script>
