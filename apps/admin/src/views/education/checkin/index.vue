<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">签到管理</h2>
      <a-space>
        <a-select
          v-model:value="selectedCourseId"
          style="width: 320px"
          placeholder="选择课程查看签到名单"
          show-search
          :filter-option="courseFilterOption"
          :options="courseOptions"
          @change="loadRoster"
        />
      </a-space>
    </div>

    <a-card v-if="selectedCourseId">
      <template #title>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span>{{ selectedCourseName }}</span>
          <a-tag color="blue">已报名 {{ roster.length }} 人</a-tag>
        </div>
      </template>
      <template #extra>
        <a-space>
          <span style="color: #666;">签到率:</span>
          <a-progress :percent="checkinRate" :width="60" type="circle" :stroke-color="'#6B463C'" />
        </a-space>
      </template>
      <a-table :columns="checkinColumns" :data-source="roster" :pagination="false" size="small" row-key="userId" :loading="loading">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'avatar'">
            <a-avatar size="small" :style="{ backgroundColor: record.checkedIn ? '#6B463C' : '#D8CBBB' }">
              {{ record.name.charAt(0) }}
            </a-avatar>
          </template>
          <template v-if="column.dataIndex === 'status'">
            <a-tag :color="record.checkedIn ? 'green' : 'default'">
              {{ record.checkedIn ? '已签到' : '未签到' }}
            </a-tag>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-button v-if="!record.checkedIn" size="small" type="primary" ghost @click="handleCheckin(record)">手动签到</a-button>
            <a-popconfirm v-else title="确定取消该学员的签到？" @confirm="handleCancel(record)">
              <a-button size="small" type="link" danger>取消签到</a-button>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-empty v-else description="请先选择课程" style="margin-top: 80px" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { courseRoster, manualCheckIn, cancelCheckIn } from '@/api/checkin'
import { adminListCourses } from '@/api/course'

const loading = ref(false)
const selectedCourseId = ref<string>()
const courseOptions = ref<any[]>([])
const roster = ref<any[]>([])

const checkinColumns = [
  { title: '', dataIndex: 'avatar', width: 40 },
  { title: '姓名', dataIndex: 'name', width: 140 },
  { title: '手机号', dataIndex: 'phone', width: 140 },
  { title: '状态', dataIndex: 'status', width: 100 },
  { title: '操作', dataIndex: 'action', width: 160 },
]

const selectedCourseName = computed(() => courseOptions.value.find(c => c.value === selectedCourseId.value)?.label || '')
const checkinRate = computed(() => {
  if (roster.value.length === 0) return 0
  return Math.round((roster.value.filter(r => r.checkedIn).length / roster.value.length) * 100)
})

function courseFilterOption(input: string, option: any) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}

async function loadCourses() {
  try {
    const data: any = await adminListCourses({ page: 1, pageSize: 100 })
    const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
    courseOptions.value = items.map((c: any) => ({ value: c.id, label: c.title }))
  } catch (e: any) {
    message.error(e?.message || '加载课程失败')
  }
}

async function loadRoster() {
  if (!selectedCourseId.value) return
  loading.value = true
  try {
    const data: any = await courseRoster(selectedCourseId.value)
    roster.value = (Array.isArray(data) ? data : []).map((o: any) => ({
      userId: o.user?.id,
      name: o.user?.nickname || o.user?.phone || '学员',
      phone: o.user?.phone || '-',
      checkedIn: o.checkedIn,
    }))
  } catch (e: any) {
    message.error(e?.message || '加载签到名单失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadCourses)

async function handleCheckin(record: any) {
  try {
    await manualCheckIn(selectedCourseId.value!, record.userId)
    message.success(`${record.name} 签到成功`)
    loadRoster()
  } catch (e: any) {
    message.error(e?.message || '签到失败')
  }
}

async function handleCancel(record: any) {
  try {
    await cancelCheckIn(selectedCourseId.value!, record.userId)
    message.success(`已取消 ${record.name} 的签到`)
    loadRoster()
  } catch (e: any) {
    message.error(e?.message || '取消签到失败')
  }
}
</script>
