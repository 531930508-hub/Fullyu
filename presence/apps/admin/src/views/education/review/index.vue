<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">课程评价</h2>
      <a-space>
        <a-select v-model:value="filterCourses" mode="multiple" style="width: 280px" placeholder="课程筛选（模糊搜索多选）"
          :filter-option="courseFilterOption" :options="courseOptions" allow-clear />
        <a-select v-model:value="filterRating" style="width: 120px">
          <a-select-option :value="0">全部评分</a-select-option>
          <a-select-option :value="5">5星</a-select-option>
          <a-select-option :value="4">4星</a-select-option>
          <a-select-option :value="3">≤ 3星（低星）</a-select-option>
        </a-select>
      </a-space>
    </div>

    <!-- 评价统计 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="8"><a-card><a-statistic title="总评价数" :value="reviews.length" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="平均评分" :value="avgRating" :precision="1" :value-style="{ color: '#F39C12' }" suffix="/ 5" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="低星评价（≤3）" :value="lowRatingCount" :value-style="{ color: '#C0392B' }" /></a-card></a-col>
    </a-row>

    <!-- 评价列表 -->
    <a-card :loading="loading">
      <a-list :data-source="filteredReviews" item-layout="vertical">
        <template #renderItem="{ item }">
          <a-list-item>
            <template #actions>
              <a-button v-if="item.rating <= 3" type="link" size="small" @click="openVisit(item)" style="color: #F39C12;">回访</a-button>
              <a-popconfirm v-perm="'review:delete'" title="确定删除该评价？" @confirm="deleteReview(item)">
                <a-button type="link" size="small" danger>删除</a-button>
              </a-popconfirm>
            </template>
            <a-list-item-meta>
              <template #avatar>
                <a-avatar :style="{ backgroundColor: '#6B463C' }">{{ item.userName.charAt(0) }}</a-avatar>
              </template>
              <template #title>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span>{{ item.userName }}</span>
                  <a-rate :value="item.rating" disabled :style="{ fontSize: '14px' }" />
                  <a-tag>{{ item.courseName }}</a-tag>
                </div>
              </template>
              <template #description>
                <span style="color: #999">{{ item.date }}</span>
              </template>
            </a-list-item-meta>
            <div style="color: #4B3621; line-height: 1.8;">{{ item.content }}</div>
          </a-list-item>
        </template>
      </a-list>
    </a-card>

    <!-- 回访抽屉（本地记录，暂不落库） -->
    <a-drawer v-model:open="visitDrawerVisible" title="低星评价回访" width="560" placement="right">
      <template v-if="visitTarget">
        <a-alert :message="`该用户给「${visitTarget.courseName}」打了 ${visitTarget.rating} 星`" type="warning" style="margin-bottom: 16px" show-icon />

        <a-descriptions bordered :column="1" size="small" title="用户信息">
          <a-descriptions-item label="昵称">{{ visitTarget.userName }}</a-descriptions-item>
          <a-descriptions-item label="评价时间">{{ visitTarget.date }}</a-descriptions-item>
        </a-descriptions>

        <a-divider />
        <h4 style="color: #4B3621;">评价内容</h4>
        <div style="background: #faf7f3; padding: 12px; border-radius: 8px; color: #4B3621; margin-bottom: 16px;">{{ visitTarget.content }}</div>

        <a-form-item label="回访记录">
          <a-textarea v-model:value="visitNote" :rows="3" placeholder="记录回访内容、处理结果…" />
        </a-form-item>
        <a-button type="primary" block @click="saveVisit">保存回访记录</a-button>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { listReviews, removeReview } from '@/api/review'
import { adminListCourses } from '@/api/course'

const loading = ref(false)
const filterCourses = ref<string[]>([])
const filterRating = ref(0)
const reviews = ref<any[]>([])
const courseOptions = ref<any[]>([])

function courseFilterOption(input: string, option: any) {
  return option.label.toLowerCase().includes(input.toLowerCase())
}

function mapReview(r: any) {
  return {
    id: r.id,
    userName: r.user?.nickname || '匿名用户',
    rating: r.rating,
    courseId: r.courseId,
    courseName: r.course?.title || '—',
    date: r.createdAt ? String(r.createdAt).slice(0, 10) : '',
    content: r.content || '',
  }
}

async function loadReviews() {
  loading.value = true
  try {
    const data: any = await listReviews()
    reviews.value = (Array.isArray(data) ? data : []).map(mapReview)
  } catch (e: any) {
    message.error(e?.message || '加载评价失败')
  } finally {
    loading.value = false
  }
}

async function loadCourses() {
  try {
    const data: any = await adminListCourses({ page: 1, pageSize: 100 })
    const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
    courseOptions.value = items.map((c: any) => ({ value: c.id, label: c.title }))
  } catch { /* 忽略 */ }
}

onMounted(() => { loadReviews(); loadCourses() })

const avgRating = computed(() => {
  if (reviews.value.length === 0) return 0
  return reviews.value.reduce((s, r) => s + r.rating, 0) / reviews.value.length
})
const lowRatingCount = computed(() => reviews.value.filter(r => r.rating <= 3).length)

const filteredReviews = computed(() => {
  return reviews.value.filter(r => {
    if (filterCourses.value.length > 0 && !filterCourses.value.includes(r.courseId)) return false
    if (filterRating.value === 5 && r.rating !== 5) return false
    if (filterRating.value === 4 && r.rating !== 4) return false
    if (filterRating.value === 3 && r.rating > 3) return false
    return true
  })
})

async function deleteReview(item: any) {
  try {
    await removeReview(item.id)
    message.success('评价已删除')
    loadReviews()
  } catch (e: any) {
    message.error(e?.message || '删除失败')
  }
}

// ===== 回访（本地） =====
const visitDrawerVisible = ref(false)
const visitTarget = ref<any>(null)
const visitNote = ref('')

function openVisit(item: any) {
  visitTarget.value = item
  visitNote.value = ''
  visitDrawerVisible.value = true
}

function saveVisit() {
  message.success('回访记录已保存')
  visitDrawerVisible.value = false
}
</script>
