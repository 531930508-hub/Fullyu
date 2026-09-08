<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">签到管理</h2>
      <a-space>
        <a-select
          v-model:value="selectedCourseId"
          style="width: 320px"
          placeholder="搜索课程查看签到名单（尚未结课 / 近3日结课）"
          show-search
          allow-clear
          :filter-option="false"
          :options="courseOptions"
          :not-found-content="searching ? undefined : '无匹配课程'"
          @search="onCourseSearch"
          @change="onCourseChange"
        />
        <a-button @click="reloadCurrent">刷新</a-button>
      </a-space>
    </div>

    <!-- 选中某课程：单课程签到名单 -->
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
          <a-progress :percent="rosterRate(roster)" :width="60" type="circle" :stroke-color="'#6B463C'" />
        </a-space>
      </template>
      <a-table :columns="checkinColumns" :data-source="roster" :pagination="false" size="small" row-key="userId" :loading="loading">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'photo'">
            <a-image v-if="record.photo" :src="record.photo" :width="48" :height="48" style="object-fit: cover; border-radius: 4px;" />
            <a-tooltip v-else title="未录入个人照片，无法核验人脸">
              <a-tag color="warning">缺照片</a-tag>
            </a-tooltip>
          </template>
          <template v-if="column.dataIndex === 'cardType'">
            <a-tag v-if="record.cardType" :color="cardColors[record.cardType]">{{ cardLabels[record.cardType] }}</a-tag>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-if="column.dataIndex === 'status'">
            <a-tag :color="record.checkedIn ? 'green' : 'default'">{{ record.checkedIn ? '已签到' : '未签到' }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-button v-perm="'checkin:create'" v-if="!record.checkedIn" size="small" type="primary" ghost @click="handleCheckin(selectedCourseId, record)">手动签到</a-button>
            <a-popconfirm v-else title="确定取消该学员的签到？" @confirm="handleCancel(selectedCourseId, record)">
              <a-button size="small" type="link" danger>取消签到</a-button>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 默认视图：近2小时待开课的课程签到 -->
    <template v-else>
      <a-alert
        type="info"
        show-icon
        style="margin-bottom: 16px"
        message="默认展示开课时刻在 前1小时 ~ 后2小时 内的课程，便于开课前后线下核对人脸并签到。可在右上角搜索其它课程。"
      />
      <a-spin :spinning="loading">
        <template v-if="upcoming.length">
          <a-card v-for="item in upcoming" :key="item.course.id" style="margin-bottom: 16px">
            <template #title>
              <div style="display: flex; align-items: center; gap: 12px;">
                <span>{{ item.course.title }}</span>
                <a-tag color="gold">{{ courseTimeLabel(item.course) }}</a-tag>
                <a-tag color="blue">已报名 {{ item.roster.length }} 人</a-tag>
              </div>
            </template>
            <template #extra>
              <a-space>
                <span style="color: #666;">签到率:</span>
                <a-progress :percent="rosterRate(item.roster)" :width="52" type="circle" :stroke-color="'#6B463C'" />
              </a-space>
            </template>
            <a-table :columns="checkinColumns" :data-source="item.roster" :pagination="false" size="small" row-key="userId">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'photo'">
                  <a-image v-if="record.photo" :src="record.photo" :width="48" :height="48" style="object-fit: cover; border-radius: 4px;" />
                  <a-tooltip v-else title="未录入个人照片，无法核验人脸">
                    <a-tag color="warning">缺照片</a-tag>
                  </a-tooltip>
                </template>
                <template v-if="column.dataIndex === 'cardType'">
                  <a-tag v-if="record.cardType" :color="cardColors[record.cardType]">{{ cardLabels[record.cardType] }}</a-tag>
                  <span v-else style="color: #ccc;">-</span>
                </template>
                <template v-if="column.dataIndex === 'status'">
                  <a-tag :color="record.checkedIn ? 'green' : 'default'">{{ record.checkedIn ? '已签到' : '未签到' }}</a-tag>
                </template>
                <template v-if="column.dataIndex === 'action'">
                  <a-button v-perm="'checkin:create'" v-if="!record.checkedIn" size="small" type="primary" ghost @click="handleCheckin(item.course.id, record)">手动签到</a-button>
                  <a-popconfirm v-else title="确定取消该学员的签到？" @confirm="handleCancel(item.course.id, record)">
                    <a-button size="small" type="link" danger>取消签到</a-button>
                  </a-popconfirm>
                </template>
              </template>
            </a-table>
          </a-card>
        </template>
        <a-empty v-else description="近2小时内暂无待开课课程，可在右上角搜索课程查看名单" style="margin-top: 80px" />
      </a-spin>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { upcomingCheckins, checkinCourses, courseRoster, manualCheckIn, cancelCheckIn } from '@/api/checkin'

const loading = ref(false)
const searching = ref(false)
const selectedCourseId = ref<string>()
const courseOptions = ref<any[]>([])
const roster = ref<any[]>([])
const upcoming = ref<any[]>([])

const cardLabels: Record<string, string> = { MONTHLY: '月卡', QUARTERLY: '季卡', YEARLY: '年卡' }
const cardColors: Record<string, string> = { MONTHLY: 'blue', QUARTERLY: 'purple', YEARLY: 'gold' }

const checkinColumns = [
  { title: '照片', dataIndex: 'photo', width: 70 },
  { title: '姓名', dataIndex: 'name', width: 140 },
  { title: '手机号', dataIndex: 'phone', width: 130 },
  { title: '会员卡', dataIndex: 'cardType', width: 90 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '操作', dataIndex: 'action', width: 150 },
]

const selectedCourseName = computed(() => courseOptions.value.find(c => c.value === selectedCourseId.value)?.label || '')

function mapRosterItem(o: any) {
  return {
    userId: o.user?.id,
    name: o.user?.nickname || o.user?.phone || '学员',
    phone: o.user?.phone || '-',
    photo: o.user?.photo || '',
    cardType: o.cardType || '',
    checkedIn: o.checkedIn,
  }
}

function rosterRate(list: any[]) {
  if (!list || list.length === 0) return 0
  return Math.round((list.filter(r => r.checkedIn).length / list.length) * 100)
}

function courseTimeLabel(course: any) {
  const d = course.startDate ? dayjs(course.startDate).format('MM-DD') : ''
  return `${d} ${course.startTime || ''}${course.endTime ? '-' + course.endTime : ''}`.trim()
}

async function loadUpcoming() {
  loading.value = true
  try {
    const data: any = await upcomingCheckins()
    upcoming.value = (Array.isArray(data) ? data : []).map((it: any) => ({
      course: it.course,
      roster: (Array.isArray(it.roster) ? it.roster : []).map(mapRosterItem),
    }))
  } catch (e: any) {
    message.error(e?.message || '加载待签到课程失败')
  } finally {
    loading.value = false
  }
}

async function loadCourseOptions(keyword?: string) {
  searching.value = true
  try {
    const data: any = await checkinCourses(keyword)
    const items = Array.isArray(data) ? data : []
    courseOptions.value = items.map((c: any) => ({ value: c.id, label: c.title }))
  } catch (e: any) {
    message.error(e?.message || '加载课程失败')
  } finally {
    searching.value = false
  }
}

let searchTimer: any = null
function onCourseSearch(kw: string) {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadCourseOptions(kw || undefined), 300)
}

async function loadRoster() {
  if (!selectedCourseId.value) return
  loading.value = true
  try {
    const data: any = await courseRoster(selectedCourseId.value)
    roster.value = (Array.isArray(data) ? data : []).map(mapRosterItem)
  } catch (e: any) {
    message.error(e?.message || '加载签到名单失败')
  } finally {
    loading.value = false
  }
}

function onCourseChange(val: string) {
  if (val) loadRoster()
  else loadUpcoming()
}

function reloadCurrent() {
  if (selectedCourseId.value) loadRoster()
  else loadUpcoming()
}

onMounted(() => {
  loadUpcoming()
  loadCourseOptions()
})

async function handleCheckin(courseId: string | undefined, record: any) {
  if (!courseId) return
  try {
    await manualCheckIn(courseId, record.userId)
    message.success(`${record.name} 签到成功`)
    reloadCurrent()
  } catch (e: any) {
    message.error(e?.message || '签到失败')
  }
}

async function handleCancel(courseId: string | undefined, record: any) {
  if (!courseId) return
  try {
    await cancelCheckIn(courseId, record.userId)
    message.success(`已取消 ${record.name} 的签到`)
    reloadCurrent()
  } catch (e: any) {
    message.error(e?.message || '取消签到失败')
  }
}
</script>
