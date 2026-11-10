<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <div>
        <h2 class="page-title">导师等级配置</h2>
        <div style="color: #7D665C; font-size: 13px; margin-top: 4px;">配置各等级名称与默认时薪，新增/编辑导师选择等级时会自动带出该等级默认时薪</div>
      </div>
      <a-button type="primary" @click="openAdd">+ 新增等级</a-button>
    </div>

    <a-table
      :columns="columns"
      :data-source="levels"
      :loading="loading"
      row-key="id"
      :pagination="false"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'level'">
          <a-tag color="#6B463C">LV{{ record.level }}</a-tag>
        </template>
        <template v-if="column.dataIndex === 'hourlyRate'">
          ¥{{ Number(record.hourlyRate) }}
        </template>
        <template v-if="column.dataIndex === 'action'">
          <a-space>
            <a @click="openEdit(record)">编辑</a>
            <a-popconfirm title="确认删除该等级？" @confirm="remove(record)">
              <a style="color: #C0392B;">删除</a>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="modalVisible"
      :title="editing ? '编辑等级' : '新增等级'"
      :confirm-loading="saving"
      @ok="submit"
    >
      <a-form layout="vertical">
        <a-form-item label="等级数值" required>
          <a-input-number v-model:value="form.level" :min="1" :max="99" :disabled="editing" style="width: 100%" placeholder="如 1 表示 LV1" />
        </a-form-item>
        <a-form-item label="等级名称" required>
          <a-input v-model:value="form.name" placeholder="如 LV1 初级导师" />
        </a-form-item>
        <a-form-item label="默认时薪（元）">
          <a-input-number v-model:value="form.hourlyRate" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="排序值">
          <a-input-number v-model:value="form.sort" :min="0" style="width: 100%" placeholder="默认与等级数值一致，升序排列" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { listTrainerLevels, createTrainerLevel, updateTrainerLevel, removeTrainerLevel } from '@/api/trainerLevel'

const columns = [
  { title: '等级', dataIndex: 'level', width: 120 },
  { title: '等级名称', dataIndex: 'name' },
  { title: '默认时薪', dataIndex: 'hourlyRate', width: 140 },
  { title: '排序', dataIndex: 'sort', width: 100 },
  { title: '操作', dataIndex: 'action', width: 140 },
]

const loading = ref(false)
const levels = ref<any[]>([])
const modalVisible = ref(false)
const editing = ref(false)
const saving = ref(false)
const currentId = ref('')
const form = ref<any>({ level: undefined, name: '', hourlyRate: 0, sort: undefined })

async function load() {
  loading.value = true
  try {
    const data: any = await listTrainerLevels()
    levels.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    message.error(e?.message || '加载等级失败')
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editing.value = false
  currentId.value = ''
  form.value = { level: undefined, name: '', hourlyRate: 0, sort: undefined }
  modalVisible.value = true
}

function openEdit(record: any) {
  editing.value = true
  currentId.value = record.id
  form.value = { level: record.level, name: record.name, hourlyRate: Number(record.hourlyRate), sort: record.sort }
  modalVisible.value = true
}

async function submit() {
  if (!editing.value && !form.value.level) { message.warning('请填写等级数值'); return }
  if (!form.value.name) { message.warning('请填写等级名称'); return }
  saving.value = true
  try {
    if (editing.value) {
      await updateTrainerLevel(currentId.value, {
        name: form.value.name,
        hourlyRate: form.value.hourlyRate,
        sort: form.value.sort,
      })
      message.success('等级已更新')
    } else {
      await createTrainerLevel({
        level: form.value.level,
        name: form.value.name,
        hourlyRate: form.value.hourlyRate,
        sort: form.value.sort,
      })
      message.success('等级已新增')
    }
    modalVisible.value = false
    load()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(record: any) {
  try {
    await removeTrainerLevel(record.id)
    message.success('已删除')
    load()
  } catch (e: any) {
    message.error(e?.message || '删除失败')
  }
}

onMounted(load)
</script>
