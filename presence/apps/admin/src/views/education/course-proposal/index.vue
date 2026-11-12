<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <div>
        <h2 class="page-title">课程提案审核</h2>
        <div class="page-sub">导师在门户提交的课程提案；通过时确定场地与排期，可直接上架或留草稿</div>
      </div>
      <a-space wrap>
        <a-input-search v-model:value="keyword" placeholder="课程名 / 导师" allow-clear style="width: 220px" @search="load" />
        <a-select v-model:value="status" style="width: 140px" @change="load">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option v-for="(meta, key) in PROPOSAL_STATUS" :key="key" :value="key">{{ meta.text }}</a-select-option>
        </a-select>
        <a-button :loading="loading" @click="load">刷新</a-button>
      </a-space>
    </div>

    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        row-key="id"
        size="middle"
        :pagination="pagination"
        :scroll="{ x: 1040 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'course'">
            <div class="course-cell">
              <a-image :src="record.coverImage" :width="56" :height="42" :preview="false" class="course-cover" />
              <div>
                <div class="course-title">{{ record.title }}</div>
                <div class="muted">{{ record.theme || '未选主题' }}</div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'trainer'">
            <div>{{ record.trainer?.displayName || '—' }}</div>
            <div class="muted">{{ record.phone || '—' }}</div>
          </template>
          <template v-else-if="column.key === 'sessions'">
            {{ record.durationMinutes }} 分钟<template v-if="record.totalSessions > 1"> × {{ record.totalSessions }} 节</template>
          </template>
          <template v-else-if="column.key === 'capacity'">
            {{ record.requestedMaxCapacity ? `${record.requestedMaxCapacity} 人` : '—' }}
          </template>
          <template v-else-if="column.key === 'requestedPrice'">
            <template v-if="record.requestedPrice !== null && record.requestedPrice !== undefined">¥{{ record.requestedPrice }}</template>
            <span v-else class="muted">—</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="PROPOSAL_STATUS[record.status]?.color">{{ record.statusText }}</a-tag>
          </template>
          <template v-else-if="column.key === 'submittedAt'">{{ formatTime(record.submittedAt) }}</template>
          <template v-else-if="column.key === 'actions'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="openDetail(record.id)">
                {{ ['SUBMITTED', 'REVIEWING'].includes(record.status) ? '处理' : '查看' }}
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 提案详情 -->
    <a-drawer v-model:open="detailOpen" title="课程提案详情" width="720" :body-style="{ paddingBottom: '80px' }">
      <a-spin :spinning="detailLoading">
        <template v-if="detail">
          <a-image :src="detail.coverImage" :width="'100%'" :height="220" style="object-fit: cover; border-radius: 8px; margin-bottom: 16px" />

          <div class="detail-head">
            <div>
              <div class="detail-name">{{ detail.title }}</div>
              <div class="muted">{{ detail.theme || '未选主题' }}</div>
            </div>
            <a-tag :color="PROPOSAL_STATUS[detail.status]?.color">{{ detail.statusText }}</a-tag>
          </div>

          <a-alert
            v-if="detail.status === 'REJECTED' && detail.rejectReason"
            type="error"
            show-icon
            style="margin-bottom: 16px"
            :message="`需修改：${detail.rejectReason}`"
          >
            <template #description v-if="(detail.rejectFields || []).length">
              涉及内容：{{ rejectFieldLabels(detail) }}
            </template>
          </a-alert>

          <a-alert
            v-if="detail.publishedCourseId"
            type="success"
            show-icon
            style="margin-bottom: 16px"
            :message="`已生成课程 ${detail.publishedCourseId}`"
          />

          <a-descriptions :column="2" bordered size="small">
            <a-descriptions-item label="导师">{{ detail.trainer?.displayName || '—' }}</a-descriptions-item>
            <a-descriptions-item label="联系电话">{{ detail.phone || '—' }}</a-descriptions-item>
            <a-descriptions-item label="单节时长">{{ detail.durationMinutes }} 分钟</a-descriptions-item>
            <a-descriptions-item label="总节数">{{ detail.totalSessions }} 节</a-descriptions-item>
            <a-descriptions-item label="建议价格">
              <template v-if="detail.requestedPrice !== null && detail.requestedPrice !== undefined">¥{{ detail.requestedPrice }}</template>
              <span v-else class="muted">—</span>
            </a-descriptions-item>
            <a-descriptions-item label="建议人数">{{ detail.requestedMaxCapacity ? `${detail.requestedMaxCapacity} 人` : '—' }}</a-descriptions-item>
            <a-descriptions-item label="分类" :span="2">
              <a-space :size="4" wrap>
                <a-tag v-for="c in detail.categories || []" :key="c" color="purple">{{ c }}</a-tag>
                <span v-if="!(detail.categories || []).length" class="muted">—</span>
              </a-space>
            </a-descriptions-item>
            <a-descriptions-item label="适合人群" :span="2">
              <a-space :size="4" wrap>
                <a-tag v-for="c in detail.targetAudience || []" :key="c">{{ c }}</a-tag>
                <span v-if="!(detail.targetAudience || []).length" class="muted">—</span>
              </a-space>
            </a-descriptions-item>
            <a-descriptions-item label="提交时间" :span="2">{{ formatTime(detail.createdAt) }}</a-descriptions-item>
          </a-descriptions>

          <div class="section">
            <div class="section-title">课程介绍</div>
            <div class="section-text">{{ detail.description || '—' }}</div>
          </div>
          <div class="section">
            <div class="section-title">学员收获 / 成果</div>
            <div class="section-text">{{ detail.goals || '—' }}</div>
          </div>
          <div class="section">
            <div class="section-title">对学员的要求</div>
            <div class="section-text">{{ detail.requirements || '—' }}</div>
          </div>
          <div class="section">
            <div class="section-title">希望平台提供的支持 <a-tag color="orange">内部</a-tag></div>
            <div class="section-text">{{ detail.supportNeeds || '—' }}</div>
          </div>
          <div class="section" v-if="(detail.materials || []).length">
            <div class="section-title">物料需求</div>
            <pre class="json-block">{{ JSON.stringify(detail.materials, null, 2) }}</pre>
          </div>

          <a-descriptions v-if="detail.scheduledDate" :column="2" bordered size="small" title="教务排期" style="margin-top: 16px">
            <a-descriptions-item label="场地">{{ venueName(detail.scheduledVenueId) }}</a-descriptions-item>
            <a-descriptions-item label="日期">{{ String(detail.scheduledDate).slice(0, 10) }}</a-descriptions-item>
            <a-descriptions-item label="时间">{{ detail.scheduledStartTime }} - {{ detail.scheduledEndTime }}</a-descriptions-item>
            <a-descriptions-item label="人数">
              {{ detail.finalMaxCapacity || '—' }}
            </a-descriptions-item>
            <a-descriptions-item label="价格">¥{{ detail.finalPrice ?? '—' }}</a-descriptions-item>
            <a-descriptions-item label="审核人">{{ detail.reviewerName || '—' }}</a-descriptions-item>
          </a-descriptions>
        </template>
      </a-spin>

      <div v-if="canHandle" class="drawer-footer">
        <a-button v-if="detail?.status === 'SUBMITTED'" :loading="reviewing" @click="startReview">开始审核</a-button>
        <template v-else>
          <a-button danger @click="openReject">驳回 / 要求修改</a-button>
          <a-button type="primary" @click="openApprove">通过并安排排期</a-button>
        </template>
      </div>
    </a-drawer>

    <!-- 通过并排期 -->
    <a-modal v-model:open="approveOpen" title="通过提案并安排排期" :confirm-loading="approving" width="620px" ok-text="确认通过" @ok="submitApprove">
      <a-alert
        type="info"
        show-icon
        message="通过后会按这里填写的场地、日期、时间生成一门课程；选择「直接上架」学员立即可报名。"
        style="margin-bottom: 16px"
      />
      <a-form layout="vertical">
        <a-form-item label="上课场地" required>
          <a-select v-model:value="approveForm.venueId" show-search :filter-option="filterVenue" placeholder="搜索场地名称" :options="venueOptions" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="上课日期" required>
              <a-date-picker v-model:value="approveForm.date" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="开始时间" required>
              <a-time-picker v-model:value="approveForm.startTime" format="HH:mm" value-format="HH:mm" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="结束时间" required>
              <a-time-picker v-model:value="approveForm.endTime" format="HH:mm" value-format="HH:mm" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="售价（元）" required>
              <a-input-number v-model:value="approveForm.price" :min="0" :precision="2" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="最大人数" required>
              <a-input-number v-model:value="approveForm.maxCapacity" :min="1" :max="200" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="最低开班人数">
              <a-input-number v-model:value="approveForm.minCapacity" :min="1" :max="200" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item>
          <a-checkbox v-model:checked="approveForm.contentConfirmed">已人工核对课程封面、标题与介绍，可以对外展示</a-checkbox>
        </a-form-item>
        <a-form-item label="通过后的处理">
          <a-radio-group v-model:value="approveForm.publish">
            <a-radio :value="true">直接上架，学员可报名</a-radio>
            <a-radio :value="false">仅通过，生成草稿由运营补齐图集后再上架</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 驳回 -->
    <a-modal v-model:open="rejectOpen" title="驳回课程提案" :confirm-loading="rejecting" ok-text="确认驳回" @ok="submitReject">
      <a-form layout="vertical">
        <a-form-item label="需要修改的内容" required>
          <a-checkbox-group v-model:value="rejectFields" style="display: flex; flex-direction: column; gap: 8px">
            <a-checkbox v-for="f in rejectFieldOptions" :key="f.key" :value="f.key">{{ f.label }}</a-checkbox>
          </a-checkbox-group>
        </a-form-item>
        <a-form-item label="驳回说明" required>
          <a-textarea v-model:value="rejectReason" :rows="4" placeholder="说明具体问题与修改建议，导师会在门户看到，至少 4 个字" :maxlength="300" show-count />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { COURSE_PROPOSAL_STATUS_META } from '@fullyu/shared'
import {
  approveCourseProposal,
  getCourseProposal,
  listCourseProposals,
  rejectCourseProposal,
  startReviewCourseProposal,
} from '@/api/trainerPortal'
import { listVenues } from '@/api/venue'

const PROPOSAL_STATUS = COURSE_PROPOSAL_STATUS_META as Record<string, { text: string; color: string }>

const route = useRoute()

const keyword = ref('')
const status = ref('')
const loading = ref(false)
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(10)

const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: list.value.length,
  showTotal: (t: number) => `共 ${t} 条`,
  onChange: (p: number) => (page.value = p),
}))

const columns = [
  { title: '课程', key: 'course', width: 260 },
  { title: '导师', key: 'trainer', width: 140 },
  { title: '时长', key: 'sessions', width: 120 },
  { title: '建议价格', key: 'requestedPrice', width: 100 },
  { title: '建议人数', key: 'capacity', width: 100 },
  { title: '状态', key: 'status', width: 110 },
  { title: '提交时间', key: 'submittedAt', width: 170 },
  { title: '操作', key: 'actions', width: 90, fixed: 'right' as const },
]

const venues = ref<any[]>([])
const venueOptions = computed(() =>
  venues.value.map((v: any) => ({
    value: v.id,
    label: `${v.name}${v.city ? ` · ${v.city}` : ''}`,
    disabled: v.isAvailable === false,
  })),
)

async function loadVenues() {
  try {
    const data: any = await listVenues()
    venues.value = Array.isArray(data) ? data : data?.list || []
  } catch {
    venues.value = []
  }
}

function venueName(id?: string | null) {
  if (!id) return '—'
  return venues.value.find((v: any) => v.id === id)?.name || id
}

function filterVenue(input: string, option: any) {
  return String(option.label || '').includes(input)
}

async function load() {
  loading.value = true
  page.value = 1
  try {
    const params: any = {}
    if (status.value) params.status = status.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    const data: any = await listCourseProposals(params)
    list.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    message.error(e?.message || '加载课程提案失败')
  } finally {
    loading.value = false
  }
}

function formatTime(t?: string | null) {
  if (!t) return '—'
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

// ---------- 详情 ----------
const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<any>(null)

const canHandle = computed(() => ['SUBMITTED', 'REVIEWING'].includes(detail.value?.status))

async function openDetail(id: string) {
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await getCourseProposal(id)
  } catch (e: any) {
    message.error(e?.message || '加载提案详情失败')
    detailOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

function rejectFieldLabels(d: any) {
  const map: Record<string, string> = {}
  for (const f of d.rejectFieldOptions || []) map[f.key] = f.label
  return (d.rejectFields || []).map((k: string) => map[k] || k).join('、')
}

// ---------- 开始审核 ----------
const reviewing = ref(false)

async function startReview() {
  if (!detail.value) return
  reviewing.value = true
  try {
    await startReviewCourseProposal(detail.value.id)
    message.success('已进入审核中，导师端可见进度')
    await openDetail(detail.value.id)
    await load()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  } finally {
    reviewing.value = false
  }
}

// ---------- 通过 ----------
const approveOpen = ref(false)
const approving = ref(false)
const approveForm = reactive({
  venueId: undefined as string | undefined,
  date: '',
  startTime: '',
  endTime: '',
  price: 0,
  maxCapacity: 8,
  minCapacity: 4,
  publish: true,
  contentConfirmed: true,
})

function openApprove() {
  if (!detail.value) return
  const d = detail.value
  approveForm.venueId = d.scheduledVenueId || undefined
  approveForm.date = d.scheduledDate ? String(d.scheduledDate).slice(0, 10) : ''
  approveForm.startTime = d.scheduledStartTime || ''
  approveForm.endTime = d.scheduledEndTime || ''
  approveForm.price = d.requestedPrice ?? d.finalPrice ?? 0
  approveForm.maxCapacity = d.finalMaxCapacity || d.requestedMaxCapacity || 8
  approveForm.minCapacity = Math.max(1, Math.floor((approveForm.maxCapacity || 8) / 2))
  approveForm.publish = true
  approveForm.contentConfirmed = true
  approveOpen.value = true
}

async function submitApprove() {
  if (!detail.value) return
  const f = approveForm
  if (!f.venueId) return message.warning('请选择上课场地')
  if (!f.date) return message.warning('请选择上课日期')
  if (!f.startTime || !f.endTime) return message.warning('请填写上下课时间')
  if (f.startTime >= f.endTime) return message.warning('下课时间需晚于上课时间')
  if (f.publish && !f.contentConfirmed) return message.warning('上架前请先勾选「已人工核对课程内容」')

  approving.value = true
  try {
    const res: any = await approveCourseProposal(detail.value.id, {
      venueId: f.venueId,
      date: f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      price: Number(f.price),
      maxCapacity: Number(f.maxCapacity),
      minCapacity: Number(f.minCapacity || Math.floor(f.maxCapacity / 2)),
      publish: f.publish,
      contentConfirmed: f.contentConfirmed,
    })
    message.success(f.publish ? '已通过并上架' : '已通过，课程草稿已生成')
    approveOpen.value = false
    await openDetail(detail.value.id)
    await load()
    if (res?.courseId && f.publish) {
      message.info(`课程ID：${res.courseId}，可在课程管理继续编辑`)
    }
  } catch (e: any) {
    message.error(e?.message || '通过提案失败')
  } finally {
    approving.value = false
  }
}

// ---------- 驳回 ----------
const rejectOpen = ref(false)
const rejecting = ref(false)
const rejectReason = ref('')
const rejectFields = ref<string[]>([])
const rejectFieldOptions = computed<any[]>(() => detail.value?.rejectFieldOptions || [])

function openReject() {
  rejectReason.value = ''
  rejectFields.value = []
  rejectOpen.value = true
}

async function submitReject() {
  if (!detail.value) return
  if (!rejectFields.value.length) return message.warning('请勾选需要修改的内容')
  const reason = rejectReason.value.trim()
  if (reason.length < 4) return message.warning('请填写驳回说明（至少 4 个字）')
  rejecting.value = true
  try {
    await rejectCourseProposal(detail.value.id, reason, rejectFields.value)
    message.success('已驳回，导师可在门户按说明修改')
    rejectOpen.value = false
    await openDetail(detail.value.id)
    await load()
  } catch (e: any) {
    message.error(e?.message || '驳回失败')
  } finally {
    rejecting.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadVenues(), load()])
  const focus = route.query.focus
  if (typeof focus === 'string' && focus) await openDetail(focus)
})
</script>

<style scoped>
.page-sub {
  margin-top: 4px;
  font-size: 13px;
  color: #8c8c8c;
}
.muted {
  color: #999;
  font-size: 12px;
}
.course-cell {
  display: flex;
  gap: 10px;
  align-items: center;
}
.course-cover {
  flex: 0 0 auto;
  border-radius: 6px;
  overflow: hidden;
}
.course-title {
  font-weight: 500;
}
.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 12px;
}
.detail-name {
  font-size: 18px;
  font-weight: 600;
}
.section {
  margin-top: 16px;
}
.section-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.section-text {
  white-space: pre-wrap;
  color: #595959;
  line-height: 1.7;
}
.json-block {
  margin: 0;
  padding: 8px;
  background: #fafafa;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
}
.drawer-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 24px;
  background: #fff;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>