<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">活动管理</h2>
      <a-space>
        <a-select v-model:value="filterCommunity" style="width: 200px" allow-clear placeholder="全部社群" @change="loadList">
          <a-select-option v-for="c in communities" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
        </a-select>
        <a-button type="primary" @click="openAdd">+ 新增活动</a-button>
      </a-space>
    </div>

    <a-card>
      <a-table :columns="columns" :data-source="list" :loading="loading" size="small" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'eventDate'">
            <span>{{ fmtDate(record.eventDate) }}</span>
          </template>
          <template v-if="column.dataIndex === 'type'">
            <a-tag :color="typeColor(record.type)">{{ typeText(record.type) }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'joined'">
            <span>{{ record.joined }}/{{ record.capacity || '不限' }}</span>
          </template>
          <template v-if="column.dataIndex === 'courseId'">
            <a-tag v-if="record.courseId" color="gold">官方课程</a-tag>
            <span v-else style="color: #999;">—</span>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-space>
              <a @click="openEdit(record)">编辑</a>
              <a-popconfirm title="确定删除该活动？" @confirm="onRemove(record)">
                <a style="color: #C0392B;">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-drawer v-model:open="drawerVisible" :title="isEdit ? '编辑活动' : '新增活动'" width="520" placement="right">
      <a-form layout="vertical">
        <a-form-item label="所属社群" required>
          <a-select v-model:value="form.communityId" placeholder="选择社群">
            <a-select-option v-for="c in communities" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="活动标题" required>
          <a-input v-model:value="form.title" placeholder="如：线下静心工作坊 · 颂钵体验" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="日期" required>
              <a-date-picker v-model:value="form.eventDate" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="开始时间">
              <a-time-picker v-model:value="form.time" value-format="HH:mm" format="HH:mm" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="形式">
              <a-select v-model:value="form.type">
                <a-select-option value="OFFLINE">线下课程/活动</a-select-option>
                <a-select-option value="LIVE">直播</a-select-option>
                <a-select-option value="ONLINE">线上</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="场地（线下）">
              <a-input v-model:value="form.venue" placeholder="如：总店·瑜伽馆" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="容量（0 = 不限）">
              <a-input-number v-model:value="form.capacity" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="已报名">
              <a-input-number v-model:value="form.joined" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="关联官方课程（可选）">
          <a-select
            v-model:value="form.courseId"
            allow-clear
            show-search
            option-filter-prop="label"
            placeholder="选择后，C 端日历点击可直接跳转课程页报名"
            :options="courseOptions"
          />
        </a-form-item>

        <a-button type="primary" block :loading="saving" @click="onSave">{{ isEdit ? '保存修改' : '确认新增' }}</a-button>
      </a-form>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { adminListEvents, createEvent, updateEvent, deleteEvent, adminListCommunities } from '@/api/community'
import { adminListCourses } from '@/api/course'

const loading = ref(false)
const saving = ref(false)
const list = ref<any[]>([])
const communities = ref<any[]>([])
const courseOptions = ref<{ label: string; value: string }[]>([])
const filterCommunity = ref<string | undefined>(undefined)

const columns = [
  { title: '社群', dataIndex: ['community', 'name'], width: 140 },
  { title: '日期', dataIndex: 'eventDate', width: 110 },
  { title: '时间', dataIndex: 'time', width: 70 },
  { title: '活动', dataIndex: 'title' },
  { title: '形式', dataIndex: 'type', width: 90 },
  { title: '场地', dataIndex: 'venue', width: 120 },
  { title: '报名', dataIndex: 'joined', width: 90 },
  { title: '官方课程', dataIndex: 'courseId', width: 100 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

function typeText(t: string) {
  return t === 'OFFLINE' ? '线下' : t === 'LIVE' ? '直播' : '线上'
}
function typeColor(t: string) {
  return t === 'OFFLINE' ? 'orange' : t === 'LIVE' ? 'green' : 'blue'
}
function fmtDate(d: string) {
  if (!d) return ''
  return d.slice(0, 10)
}

async function loadList() {
  loading.value = true
  try {
    const res = await adminListEvents(filterCommunity.value)
    list.value = Array.isArray(res) ? res : []
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false
  }
}

async function loadCommunities() {
  try {
    const res = await adminListCommunities()
    communities.value = Array.isArray(res) ? res : []
  } catch (e) {
    // 忽略
  }
}

async function loadCourses() {
  try {
    const res: any = await adminListCourses({ page: 1, pageSize: 200 })
    const rows = Array.isArray(res) ? res : res?.list || res?.items || []
    courseOptions.value = rows.map((c: any) => ({ label: c.title, value: c.id }))
  } catch (e) {
    // 忽略
  }
}

const drawerVisible = ref(false)
const isEdit = ref(false)
const editingId = ref('')

function emptyForm() {
  return {
    communityId: undefined as string | undefined,
    title: '',
    eventDate: '',
    time: '',
    type: 'OFFLINE',
    venue: '',
    capacity: 0,
    joined: 0,
    courseId: undefined as string | undefined,
  }
}
const form = ref(emptyForm())

function openAdd() {
  isEdit.value = false
  form.value = emptyForm()
  drawerVisible.value = true
}

function openEdit(record: any) {
  isEdit.value = true
  editingId.value = record.id
  form.value = {
    communityId: record.communityId,
    title: record.title,
    eventDate: fmtDate(record.eventDate),
    time: record.time || '',
    type: record.type || 'OFFLINE',
    venue: record.venue || '',
    capacity: record.capacity ?? 0,
    joined: record.joined ?? 0,
    courseId: record.courseId || undefined,
  }
  drawerVisible.value = true
}

async function onSave() {
  if (!form.value.communityId || !form.value.title?.trim() || !form.value.eventDate) {
    message.warning('社群、标题与日期为必填')
    return
  }
  saving.value = true
  try {
    const body = { ...form.value, courseId: form.value.courseId || null }
    if (isEdit.value) {
      await updateEvent(editingId.value, body)
      message.success('活动已更新')
    } else {
      await createEvent(body)
      message.success('活动已创建')
    }
    drawerVisible.value = false
    loadList()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    saving.value = false
  }
}

async function onRemove(record: any) {
  try {
    await deleteEvent(record.id)
    message.success('已删除')
    loadList()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

onMounted(() => {
  loadList()
  loadCommunities()
  loadCourses()
})
</script>
