<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">代金券管理</h2>
      <a-space>
        <a-select v-model:value="filterStatus" style="width: 120px" @change="loadVouchers">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option value="UNUSED">未使用</a-select-option>
          <a-select-option value="USED">已使用</a-select-option>
          <a-select-option value="EXPIRED">已过期</a-select-option>
          <a-select-option value="REVOKED">已作废</a-select-option>
        </a-select>
        <a-button v-perm="'voucher:create'" type="primary" @click="openGrant">发放代金券</a-button>
      </a-space>
    </div>

    <!-- 统计 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="6"><a-card><a-statistic title="代金券总数" :value="vouchers.length" suffix="张" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="未使用" :value="countByStatus('UNUSED')" suffix="张" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="已使用" :value="countByStatus('USED')" suffix="张" :value-style="{ color: '#27AE60' }" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="未使用面额" prefix="¥" :value="unusedAmount" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
    </a-row>

    <!-- 代金券列表 -->
    <a-card title="代金券列表">
      <a-table :columns="columns" :data-source="vouchers" :loading="loading" row-key="id" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'user'">
            <div>{{ record.user?.nickname || '-' }}</div>
            <div style="font-size: 12px; color: #999;">{{ record.user?.phone || '' }}</div>
          </template>
          <template v-else-if="column.dataIndex === 'amount'">
            <span v-if="record.mode === 'REDUCE_TO'" style="color: #6B463C; font-weight: 600;">减至 ¥{{ Number(record.targetPrice || 0) }}</span>
            <span v-else style="color: #6B463C; font-weight: 600;">减 ¥{{ Number(record.amount || 0) }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'scope'">
            <a-tag v-if="record.applicableAll" color="blue">全部课程</a-tag>
            <a-tag v-else color="orange">指定课程 {{ (record.applicableCourseIds || []).length }} 门</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <a-tag :color="statusColorMap[record.status]">{{ statusLabelMap[record.status] || record.status }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'expiresAt'">
            {{ record.expiresAt ? dayjs(record.expiresAt).format('YYYY-MM-DD') : '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'createdAt'">
            {{ record.createdAt ? dayjs(record.createdAt).format('YYYY-MM-DD HH:mm') : '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <a-popconfirm v-perm="'voucher:update'" v-if="record.status === 'UNUSED'" title="确定作废该代金券？" @confirm="handleRevoke(record)">
              <a-button size="small" danger>作废</a-button>
            </a-popconfirm>
            <span v-else style="color: #ccc;">-</span>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 发放弹窗 -->
    <a-modal v-model:open="showGrantModal" title="发放代金券" width="560px" :confirm-loading="granting" @ok="confirmGrant">
      <a-form layout="vertical" style="margin-top: 8px;">
        <a-form-item label="发放用户" required>
          <a-select
            v-model:value="grantForm.userIds"
            mode="multiple"
            placeholder="搜索并选择用户"
            :options="userOptions"
            :filter-option="filterUserOption"
            show-search
          />
        </a-form-item>
        <a-form-item label="优惠方式" required>
          <a-radio-group v-model:value="grantForm.mode">
            <a-radio value="REDUCE_BY">减额（减多少元）</a-radio>
            <a-radio value="REDUCE_TO">减至（减到多少元）</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item v-if="grantForm.mode === 'REDUCE_BY'" label="抵扣面额（元）" required>
              <a-input-number v-model:value="grantForm.amount" prefix="¥" style="width: 100%" :min="1" placeholder="如：50" />
            </a-form-item>
            <a-form-item v-else label="减至目标价（元）" required>
              <a-input-number v-model:value="grantForm.targetPrice" prefix="¥" style="width: 100%" :min="0" placeholder="如：9.9，将实付降至此价" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="有效期至" required>
              <a-date-picker v-model:value="grantForm.expiresAt" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="来源说明">
          <a-input v-model:value="grantForm.source" placeholder="如：新人体验、活动发放" />
        </a-form-item>
        <a-form-item label="适用范围">
          <a-radio-group v-model:value="grantForm.applicableAll">
            <a-radio :value="true">全部课程</a-radio>
            <a-radio :value="false">指定课程</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="!grantForm.applicableAll" label="适用课程">
          <a-select v-model:value="grantForm.applicableCourseIds" mode="multiple" placeholder="选择适用课程" :options="courseOptions" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs, { Dayjs } from 'dayjs'
import { listVouchers, grantVoucher, revokeVoucher } from '@/api/voucher'
import { adminListUsers } from '@/api/user'
import { adminListCourses } from '@/api/course'

const loading = ref(false)
const granting = ref(false)
const filterStatus = ref('')
const showGrantModal = ref(false)
const vouchers = ref<any[]>([])
const userOptions = ref<{ label: string; value: string }[]>([])
const courseOptions = ref<{ label: string; value: string }[]>([])

const statusLabelMap: Record<string, string> = { UNUSED: '未使用', USED: '已使用', EXPIRED: '已过期', REVOKED: '已作废' }
const statusColorMap: Record<string, string> = { UNUSED: 'blue', USED: 'green', EXPIRED: 'default', REVOKED: 'red' }

const columns = [
  { title: '用户', dataIndex: 'user' },
  { title: '面额', dataIndex: 'amount' },
  { title: '适用范围', dataIndex: 'scope' },
  { title: '状态', dataIndex: 'status' },
  { title: '来源', dataIndex: 'source' },
  { title: '有效期至', dataIndex: 'expiresAt' },
  { title: '发放时间', dataIndex: 'createdAt' },
  { title: '操作', dataIndex: 'action' },
]

const grantForm = ref({
  userIds: [] as string[],
  mode: 'REDUCE_BY' as 'REDUCE_BY' | 'REDUCE_TO',
  amount: null as number | null,
  targetPrice: null as number | null,
  expiresAt: null as Dayjs | null,
  source: '',
  applicableAll: true,
  applicableCourseIds: [] as string[],
})

function countByStatus(status: string) {
  return vouchers.value.filter(v => v.status === status).length
}

const unusedAmount = computed(() =>
  vouchers.value.filter(v => v.status === 'UNUSED').reduce((sum, v) => sum + Number(v.amount || 0), 0)
)

function filterUserOption(input: string, option: any) {
  return String(option.label || '').toLowerCase().includes(input.toLowerCase())
}

async function loadVouchers() {
  loading.value = true
  try {
    const res = await listVouchers(filterStatus.value ? { status: filterStatus.value } : undefined)
    vouchers.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  try {
    const users = await adminListUsers()
    const list = Array.isArray(users) ? users : (users?.list || [])
    userOptions.value = list.map((u: any) => ({ label: `${u.nickname || '未命名'}（${u.phone || u.id}）`, value: u.id }))
  } catch (e) {}
  try {
    const res = await adminListCourses({ page: 1, pageSize: 200 })
    const list = Array.isArray(res) ? res : (res?.items || res?.list || [])
    courseOptions.value = list.map((c: any) => {
      const dateStr = c.startDate ? new Date(c.startDate).toISOString().slice(0, 10).replace(/-/g, '') : ''
      return { label: dateStr ? `${c.title}-${dateStr}` : c.title, value: c.id }
    })
  } catch (e) {}
}

function openGrant() {
  grantForm.value = { userIds: [], mode: 'REDUCE_BY', amount: null, targetPrice: null, expiresAt: null, source: '', applicableAll: true, applicableCourseIds: [] }
  showGrantModal.value = true
}

async function confirmGrant() {
  if (!grantForm.value.userIds.length) {
    message.warning('请选择发放用户')
    return
  }
  if (grantForm.value.mode === 'REDUCE_BY' && !grantForm.value.amount) {
    message.warning('请填写抵扣面额')
    return
  }
  if (grantForm.value.mode === 'REDUCE_TO' && (grantForm.value.targetPrice === null || grantForm.value.targetPrice < 0)) {
    message.warning('请填写减至目标价')
    return
  }
  if (!grantForm.value.expiresAt) {
    message.warning('请选择有效期')
    return
  }
  granting.value = true
  try {
    const res = await grantVoucher({
      userIds: grantForm.value.userIds,
      mode: grantForm.value.mode,
      amount: grantForm.value.mode === 'REDUCE_BY' ? grantForm.value.amount : undefined,
      targetPrice: grantForm.value.mode === 'REDUCE_TO' ? grantForm.value.targetPrice : undefined,
      expiresAt: grantForm.value.expiresAt.toISOString(),
      source: grantForm.value.source || 'ADMIN_GRANT',
      applicableAll: grantForm.value.applicableAll,
      applicableCourseIds: grantForm.value.applicableAll ? [] : grantForm.value.applicableCourseIds,
    })
    if (res?.pendingApproval) {
      message.success('发放申请已提交，需审批通过后生效')
    } else {
      const count = res?.granted ?? grantForm.value.userIds.length
      message.success(`已成功发放 ${count} 张代金券`)
    }
    showGrantModal.value = false
    loadVouchers()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    granting.value = false
  }
}

async function handleRevoke(record: any) {
  try {
    await revokeVoucher(record.id)
    message.success('代金券已作废')
    loadVouchers()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

onMounted(() => {
  loadVouchers()
  loadOptions()
})
</script>
