<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <div>
        <h2 class="page-title">导师入驻审核</h2>
        <div class="page-sub">门户提交的入驻申请在这里核对；通过后自动建导师档案并开通登录账号</div>
      </div>
      <a-space wrap>
        <a-input-search v-model:value="keyword" placeholder="姓名 / 手机号" allow-clear style="width: 220px" @search="load" />
        <a-select v-model:value="status" style="width: 130px" @change="load">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option v-for="(meta, key) in APP_STATUS" :key="key" :value="key">{{ meta.text }}</a-select-option>
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
        :scroll="{ x: 960 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'applicant'">
            <div class="applicant">
              <div class="applicant-name">{{ record.realName || '—' }}</div>
              <div class="applicant-phone">{{ record.phone || '—' }}</div>
            </div>
          </template>
          <template v-else-if="column.key === 'specialties'">
            <a-space :size="4" wrap>
              <a-tag v-for="s in (record.specialties || []).slice(0, 3)" :key="s" color="purple">{{ s }}</a-tag>
              <span v-if="(record.specialties || []).length > 3" class="muted">+{{ record.specialties.length - 3 }}</span>
              <span v-if="!(record.specialties || []).length" class="muted">—</span>
            </a-space>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="APP_STATUS[record.status]?.color">{{ record.statusText || APP_STATUS[record.status]?.text }}</a-tag>
          </template>
          <template v-else-if="column.key === 'submittedAt'">{{ formatTime(record.submittedAt) }}</template>
          <template v-else-if="column.key === 'actions'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="openDetail(record.id)">查看详情</a-button>
              <template v-if="record.status === 'PENDING'">
                <a-button v-perm="'trainer:create'" type="link" size="small" @click="openApprove(record.id)">通过</a-button>
                <a-button v-perm="'trainer:update'" type="link" size="small" danger @click="openReject(record.id)">驳回</a-button>
              </template>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 申请详情 -->
    <a-drawer v-model:open="detailOpen" title="入驻申请详情" width="640" :body-style="{ paddingBottom: '80px' }">
      <a-spin :spinning="detailLoading">
        <template v-if="detail">
          <div class="detail-head">
            <div>
              <div class="detail-name">{{ detail.realName || '—' }}</div>
              <div class="muted">{{ detail.phone || '—' }}</div>
            </div>
            <a-tag :color="APP_STATUS[detail.status]?.color">{{ detail.statusText }}</a-tag>
          </div>

          <a-alert
            v-if="detail.status === 'REJECTED' && detail.rejectReason"
            type="error"
            show-icon
            :message="`驳回原因：${detail.rejectReason}`"
            style="margin-bottom: 16px"
          />

          <a-descriptions :column="1" bordered size="small">
            <a-descriptions-item v-for="f in detail.fields || []" :key="f.key" :label="f.label">
              <template v-if="Array.isArray(f.value)">
                <a-space :size="4" wrap>
                  <a-tag v-for="(v, i) in f.value" :key="i">{{ v }}</a-tag>
                  <span v-if="!f.value.length" class="muted">—</span>
                </a-space>
              </template>
              <template v-else-if="f.value && typeof f.value === 'object'">
                <pre class="json-block">{{ JSON.stringify(f.value, null, 2) }}</pre>
              </template>
              <template v-else>{{ f.value || '—' }}</template>
            </a-descriptions-item>
          </a-descriptions>

          <a-descriptions :column="1" size="small" style="margin-top: 16px">
            <a-descriptions-item label="提交时间">{{ formatTime(detail.submittedAt) }}</a-descriptions-item>
            <a-descriptions-item label="审核人">{{ detail.reviewerName || '—' }}</a-descriptions-item>
            <a-descriptions-item label="审核时间">{{ formatTime(detail.reviewedAt) }}</a-descriptions-item>
            <a-descriptions-item label="已建导师档案">
              <template v-if="detail.trainer">{{ detail.trainer.displayName }}（L{{ detail.trainer.level }}）</template>
              <span v-else class="muted">—</span>
            </a-descriptions-item>
          </a-descriptions>
        </template>
      </a-spin>

      <div v-if="detail?.status === 'PENDING'" class="drawer-footer">
        <a-button v-perm="'trainer:update'" danger @click="openReject(detail.id)">驳回</a-button>
        <a-button v-perm="'trainer:create'" type="primary" @click="openApprove(detail.id)">通过并开通账号</a-button>
      </div>
    </a-drawer>

    <!-- 通过入驻 -->
    <a-modal
      v-model:open="approveOpen"
      title="通过入驻并开通门户账号"
      :confirm-loading="approving"
      ok-text="确认通过"
      @ok="submitApprove"
    >
      <a-alert
        type="info"
        show-icon
        message="通过后会用申请人的手机号开通导师门户账号，初始密码请当面或短信交付。"
        style="margin-bottom: 16px"
      />
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="导师等级">
              <a-select v-model:value="approveForm.level" @change="onLevelChange">
                <a-select-option v-for="lv in levelOptions" :key="lv.value" :value="lv.value">
                  {{ lv.label }}（¥{{ lv.hourlyRate }}/课时）
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="时薪（元/课时）">
              <a-input-number v-model:value="approveForm.hourlyRate" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="头衔标签">
              <a-input v-model:value="approveForm.certBadge" placeholder="如：资深导师" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Full愈认证">
              <a-switch v-model:checked="approveForm.seedifyCert" checked-children="已认证" un-checked-children="未认证" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="初始密码" required>
          <a-input-group compact style="display: flex">
            <a-input v-model:value="approveForm.initialPassword" placeholder="至少 6 位" style="flex: 1" />
            <a-button @click="generatePassword">随机生成</a-button>
          </a-input-group>
          <div class="muted" style="margin-top: 4px; font-size: 12px">导师首次登录后会被要求自行改密。</div>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 驳回 -->
    <a-modal v-model:open="rejectOpen" title="驳回入驻申请" :confirm-loading="rejecting" ok-text="确认驳回" @ok="submitReject">
      <a-form layout="vertical">
        <a-form-item label="驳回原因" required>
          <a-textarea v-model:value="rejectReason" :rows="4" placeholder="写清楚需要补充或修改的内容，至少 4 个字" :maxlength="200" show-count />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 账号交付信息 -->
    <a-modal v-model:open="credentialOpen" title="账号已开通" :footer="null" width="440px">
      <a-result status="success" title="导师档案与门户账号已创建">
        <template #subTitle>请把下方账号信息交给导师本人，并提醒首次登录按提示改密。</template>
      </a-result>
      <a-descriptions :column="1" bordered size="small">
        <a-descriptions-item label="登录手机号">{{ credential.phone }}</a-descriptions-item>
        <a-descriptions-item label="初始密码">
          <code class="credential-code">{{ credential.initialPassword }}</code>
          <a-button type="link" size="small" @click="copyText(credential.initialPassword)">复制</a-button>
        </a-descriptions-item>
        <a-descriptions-item label="门户入口">小程序 / H5「导师门户」</a-descriptions-item>
      </a-descriptions>
      <div style="text-align: right; margin-top: 16px">
        <a-button @click="credentialOpen = false">我已记录</a-button>
        <a-button type="primary" style="margin-left: 8px" @click="goTrainerList">去导师管理</a-button>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { TRAINER_APPLICATION_STATUS_META } from '@fullyu/shared'
import {
  approveTrainerApplication,
  getTrainerApplication,
  listTrainerApplications,
  rejectTrainerApplication,
} from '@/api/trainerPortal'
import { listTrainerLevels } from '@/api/trainerLevel'

const APP_STATUS = TRAINER_APPLICATION_STATUS_META as Record<string, { text: string; color: string }>

const route = useRoute()
const router = useRouter()

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
  { title: '申请人', key: 'applicant', width: 150 },
  { title: '城市', dataIndex: 'city', width: 100 },
  { title: '擅长方向', key: 'specialties' },
  { title: '从业年限', dataIndex: 'experienceYears', width: 100, customRender: ({ text }: any) => (text ? `${text} 年` : '—') },
  { title: '状态', key: 'status', width: 100 },
  { title: '提交时间', key: 'submittedAt', width: 170 },
  { title: '操作', key: 'actions', width: 170, fixed: 'right' as const },
]

const levelOptions = ref<Array<{ value: number; label: string; hourlyRate: number }>>([])

async function loadLevels() {
  try {
    const data: any = await listTrainerLevels()
    const rows = Array.isArray(data) ? data : data?.list || []
    levelOptions.value = rows.map((lv: any) => ({
      value: Number(lv.level),
      label: lv.name,
      hourlyRate: Number(lv.hourlyRate),
    }))
  } catch {
    levelOptions.value = []
  }
}

async function load() {
  loading.value = true
  page.value = 1
  try {
    const params: any = {}
    if (status.value) params.status = status.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    const data: any = await listTrainerApplications(params)
    list.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    message.error(e?.message || '加载入驻申请失败')
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

async function openDetail(id: string) {
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await getTrainerApplication(id)
  } catch (e: any) {
    message.error(e?.message || '加载申请详情失败')
    detailOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

// ---------- 通过 ----------
const approveOpen = ref(false)
const approving = ref(false)
const approveId = ref('')
const approveForm = reactive({
  level: 1,
  hourlyRate: 0,
  certBadge: '',
  seedifyCert: false,
  initialPassword: '',
})

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%&*'
  const bytes = new Uint32Array(10)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (n) => chars[n % chars.length]).join('')
}

function openApprove(id: string) {
  approveId.value = id
  const first = levelOptions.value[0]
  approveForm.level = first?.value || 1
  approveForm.hourlyRate = first?.hourlyRate || 0
  approveForm.certBadge = ''
  approveForm.seedifyCert = false
  approveForm.initialPassword = generatePassword()
  approveOpen.value = true
}

function onLevelChange(level: number) {
  const found = levelOptions.value.find((lv) => lv.value === Number(level))
  if (found) approveForm.hourlyRate = found.hourlyRate
}

const credentialOpen = ref(false)
const credential = reactive({ phone: '', initialPassword: '' })

async function submitApprove() {
  if (!approveForm.initialPassword || approveForm.initialPassword.length < 6) {
    message.warning('初始密码至少 6 位')
    return
  }
  approving.value = true
  try {
    const res: any = await approveTrainerApplication(approveId.value, {
      level: approveForm.level,
      hourlyRate: approveForm.hourlyRate,
      initialPassword: approveForm.initialPassword,
      certBadge: approveForm.certBadge || undefined,
      seedifyCert: approveForm.seedifyCert,
    })
    approveOpen.value = false
    detailOpen.value = false
    credential.phone = res?.phone || ''
    credential.initialPassword = res?.initialPassword || approveForm.initialPassword
    credentialOpen.value = true
    await load()
  } catch (e: any) {
    message.error(e?.message || '通过申请失败')
  } finally {
    approving.value = false
  }
}

// ---------- 驳回 ----------
const rejectOpen = ref(false)
const rejecting = ref(false)
const rejectId = ref('')
const rejectReason = ref('')

function openReject(id: string) {
  rejectId.value = id
  rejectReason.value = ''
  rejectOpen.value = true
}

async function submitReject() {
  const reason = rejectReason.value.trim()
  if (reason.length < 4) {
    message.warning('请填写驳回原因（至少 4 个字）')
    return
  }
  rejecting.value = true
  try {
    await rejectTrainerApplication(rejectId.value, reason)
    message.success('已驳回，导师可在门户看到原因')
    rejectOpen.value = false
    detailOpen.value = false
    await load()
  } catch (e: any) {
    message.error(e?.message || '驳回失败')
  } finally {
    rejecting.value = false
  }
}

function copyText(text: string) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => message.success('已复制'))
    .catch(() => message.warning('复制失败，请手动选中复制'))
}

function goTrainerList() {
  credentialOpen.value = false
  router.push('/education/trainers')
}

onMounted(async () => {
  await Promise.all([loadLevels(), load()])
  // 待办中心点「去审核」会带 focus=申请ID，直接打开详情
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
.applicant-name {
  font-weight: 500;
}
.applicant-phone {
  font-size: 12px;
  color: #8c8c8c;
}
.muted {
  color: #999;
}
.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.detail-name {
  font-size: 18px;
  font-weight: 600;
}
.json-block {
  margin: 0;
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
.credential-code {
  padding: 2px 6px;
  background: #f5f5f5;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>