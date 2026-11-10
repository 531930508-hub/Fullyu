<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <div>
        <h2 class="page-title" style="margin-bottom: 4px;">代金券与发券</h2>
        <div style="font-size: 12px; color: #7D665C;">指定用户发放、批量兑换码发券、券码核销与作废，都在本页完成</div>
      </div>
      <a-space>
        <a-button v-perm="'voucher:create'" @click="openGrant">发放代金券</a-button>
        <a-button v-perm="'voucher:create'" type="primary" @click="openBatchGrant">批量发券（兑换码）</a-button>
      </a-space>
    </div>

    <!-- 统计 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="6"><a-card><a-statistic title="代金券总数" :value="vouchers.length" suffix="张" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="未兑换码券" :value="countUnclaimed()" suffix="张" :value-style="{ color: '#D48806' }" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="已使用" :value="countByStatus('USED')" suffix="张" :value-style="{ color: '#27AE60' }" /></a-card></a-col>
      <a-col :span="6"><a-card><a-statistic title="未使用面额" prefix="¥" :value="unusedAmount" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
    </a-row>

    <a-tabs v-model:activeKey="activeTab" @change="onTabChange">
      <!-- ===== 代金券列表 ===== -->
      <a-tab-pane key="list" tab="代金券列表">
        <a-card>
          <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
            <a-select v-model:value="filterStatus" style="width: 160px" @change="loadVouchers">
              <a-select-option value="">全部状态</a-select-option>
              <a-select-option value="UNCLAIMED">未兑换（码券）</a-select-option>
              <a-select-option value="UNUSED">未使用</a-select-option>
              <a-select-option value="USED">已使用</a-select-option>
              <a-select-option value="EXPIRED">已过期</a-select-option>
              <a-select-option value="REVOKED">已作废</a-select-option>
            </a-select>
            <a-select v-model:value="filterBatch" style="width: 240px" allow-clear placeholder="按发券批次筛选" @change="loadVouchers">
              <a-select-option v-for="b in batches" :key="b.batchNo" :value="b.batchNo">{{ b.batchNo }}（{{ b.total }} 张）</a-select-option>
            </a-select>
            <a-button @click="loadVouchers">刷新</a-button>
          </div>
          <a-table :columns="columns" :data-source="vouchers" :loading="loading" row-key="id" size="small" :scroll="{ x: 1180 }" :pagination="{ pageSize: 20, showTotal: (t: number) => `共 ${t} 张` }">
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'user'">
                <template v-if="record.userId">
                  <div>{{ record.user?.nickname || '-' }}</div>
                  <div style="font-size: 12px; color: #999;">{{ record.user?.phone || '' }}</div>
                </template>
                <a-tag v-else color="gold">待兑换</a-tag>
              </template>
              <template v-else-if="column.dataIndex === 'amount'">
                <span v-if="record.mode === 'REDUCE_TO'" style="color: #6B463C; font-weight: 600;">减至 ¥{{ Number(record.targetPrice || 0) }}</span>
                <span v-else style="color: #6B463C; font-weight: 600;">减 ¥{{ Number(record.amount || 0) }}</span>
              </template>
              <template v-else-if="column.dataIndex === 'redeemCode'">
                <template v-if="record.redeemCode">
                  <span class="code-text">{{ formatCode(record.redeemCode) }}</span>
                  <a-button type="link" size="small" style="padding: 0 4px;" @click="copyText(formatCode(record.redeemCode))">复制</a-button>
                </template>
                <span v-else style="color: #ccc;">-</span>
              </template>
              <template v-else-if="column.dataIndex === 'scope'">
                <a-tag v-if="record.applicableAll" color="blue">全部课程</a-tag>
                <a-tag v-else color="orange">指定课程 {{ (record.applicableCourseIds || []).length }} 门</a-tag>
              </template>
              <template v-else-if="column.dataIndex === 'status'">
                <a-tag :color="displayStatus(record).color">{{ displayStatus(record).label }}</a-tag>
              </template>
              <template v-else-if="column.dataIndex === 'batchNo'">
                <a-button v-if="record.batchNo" type="link" size="small" style="padding: 0;" @click="openBatchDetail(record.batchNo)">{{ record.batchNo }}</a-button>
                <span v-else style="color: #ccc;">-</span>
              </template>
              <template v-else-if="column.dataIndex === 'expiresAt'">
                {{ record.expiresAt ? dayjs(record.expiresAt).format('YYYY-MM-DD') : '-' }}
              </template>
              <template v-else-if="column.dataIndex === 'action'">
                <a-space>
                  <a-button v-if="record.redeemCode" size="small" @click="openQr(record)">二维码</a-button>
                  <a-popconfirm v-perm="'voucher:update'" v-if="record.status === 'UNUSED'" title="确定作废该代金券？作废后兑换码立即失效。" @confirm="handleRevoke(record)">
                    <a-button size="small" danger>作废</a-button>
                  </a-popconfirm>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>

      <!-- ===== 批量发券（兑换码批次） ===== -->
      <a-tab-pane key="batches">
        <template #tab>批量发券<a-badge :count="batches.length" :offset="[6, -2]" :number-style="{ backgroundColor: '#6B463C' }" /></template>
        <a-card>
          <a-alert
            v-if="!canGrant"
            type="warning"
            show-icon
            style="margin-bottom: 16px;"
            message="当前账号可以查看券码与批次，但没有「代金券发放」权限，无法新建发券。"
            description="需要发券时，请超级管理员在「系统设置 → 权限管理」里给该角色勾选「代金券发放」。"
          />
          <a-alert
            type="info"
            show-icon
            style="margin-bottom: 16px;"
            message="批量发券生成一批一密的兑换码：每张券可单独下载二维码物料，顾客微信扫码或在小程序「我的 → 兑换代金券」输入密码领取，领取后进入「我的资产」。"
          />
          <a-table :columns="batchColumns" :data-source="batches" :loading="batchLoading" row-key="batchNo" size="small" :scroll="{ x: 1100 }" :pagination="{ pageSize: 10 }">
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'amount'">
                <span v-if="record.mode === 'REDUCE_TO'" style="color: #6B463C; font-weight: 600;">减至 ¥{{ Number(record.targetPrice || 0) }}</span>
                <span v-else style="color: #6B463C; font-weight: 600;">减 ¥{{ Number(record.amount || 0) }}</span>
              </template>
              <template v-else-if="column.dataIndex === 'progress'">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 160px;">
                  <a-progress :percent="Math.round((record.redeemed / Math.max(record.total, 1)) * 100)" size="small" style="flex: 1; margin: 0;" :stroke-color="'#6B463C'" />
                  <span style="font-size: 12px; color: #666; white-space: nowrap;">{{ record.redeemed }}/{{ record.total }}</span>
                </div>
              </template>
              <template v-else-if="column.dataIndex === 'scope'">
                <a-tag v-if="record.applicableAll" color="blue">全部课程</a-tag>
                <a-tag v-else color="orange">指定课程</a-tag>
              </template>
              <template v-else-if="column.dataIndex === 'expiresAt'">
                {{ record.expiresAt ? dayjs(record.expiresAt).format('YYYY-MM-DD') : '-' }}
              </template>
              <template v-else-if="column.dataIndex === 'createdAt'">
                {{ record.createdAt ? dayjs(record.createdAt).format('YYYY-MM-DD HH:mm') : '-' }}
              </template>
              <template v-else-if="column.dataIndex === 'action'">
                <a-space>
                  <a-button size="small" type="primary" ghost @click="openBatchDetail(record.batchNo)">明细与二维码</a-button>
                  <a-button size="small" @click="exportBatchCsv(record.batchNo)">导出 CSV</a-button>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>
    </a-tabs>

    <!-- ===== 发放弹窗（指定用户） ===== -->
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

    <!-- ===== 批量发券弹窗（兑换码） ===== -->
    <a-modal v-model:open="showBatchModal" title="批量发券（兑换码）" width="560px" :confirm-loading="batchGranting" @ok="confirmBatchGrant">
      <a-alert
        type="warning"
        show-icon
        style="margin: 8px 0 16px;"
        message="每张券生成唯一兑换密码，发放后不归属任何用户；顾客兑换后才进入其资产。请通过二维码物料或线下渠道分发兑换码。"
      />
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="发放数量（张）" required>
              <a-input-number v-model:value="batchForm.quantity" style="width: 100%" :min="1" :max="500" :precision="0" placeholder="1-500" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="有效期至" required>
              <a-date-picker v-model:value="batchForm.expiresAt" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="优惠方式" required>
          <a-radio-group v-model:value="batchForm.mode">
            <a-radio value="REDUCE_BY">减额（减多少元）</a-radio>
            <a-radio value="REDUCE_TO">减至（减到多少元）</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="batchForm.mode === 'REDUCE_BY'" label="抵扣面额（元）" required>
          <a-input-number v-model:value="batchForm.amount" prefix="¥" style="width: 100%" :min="1" placeholder="如：299。课程价低于面额时减到 0 元，不会出现负数" />
        </a-form-item>
        <a-form-item v-else label="减至目标价（元）" required>
          <a-input-number v-model:value="batchForm.targetPrice" prefix="¥" style="width: 100%" :min="0" placeholder="如：9.9，将实付降至此价；填 0 即免费券" />
        </a-form-item>
        <a-form-item label="来源说明">
          <a-input v-model:value="batchForm.source" placeholder="如：门店开业活动、渠道合作" />
        </a-form-item>
        <a-form-item label="适用范围">
          <a-radio-group v-model:value="batchForm.applicableAll">
            <a-radio :value="true">全部课程</a-radio>
            <a-radio :value="false">指定课程</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="!batchForm.applicableAll" label="适用课程">
          <a-select v-model:value="batchForm.applicableCourseIds" mode="multiple" placeholder="选择适用课程" :options="courseOptions" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- ===== 批次明细抽屉 ===== -->
    <a-drawer v-model:open="showBatchDrawer" :title="`批次明细 · ${currentBatchNo}`" width="760" :body-style="{ paddingBottom: '80px' }">
      <template v-if="batchDetail">
        <a-row :gutter="16" style="margin-bottom: 16px;">
          <a-col :span="6"><a-statistic title="总张数" :value="batchDetail.summary.total" /></a-col>
          <a-col :span="6"><a-statistic title="已兑换" :value="batchDetail.summary.redeemed" :value-style="{ color: '#27AE60' }" /></a-col>
          <a-col :span="6"><a-statistic title="已使用" :value="batchDetail.summary.used" /></a-col>
          <a-col :span="6"><a-statistic title="已作废" :value="batchDetail.summary.revoked" :value-style="{ color: '#CF1322' }" /></a-col>
        </a-row>
        <a-table :columns="detailColumns" :data-source="batchDetail.rows" row-key="id" size="small" :pagination="{ pageSize: 15 }">
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'redeemCode'">
              <span class="code-text">{{ formatCode(record.redeemCode) }}</span>
            </template>
            <template v-else-if="column.dataIndex === 'status'">
              <a-tag :color="displayStatus(record).color">{{ displayStatus(record).label }}</a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'user'">
              <template v-if="record.userId">
                <div>{{ record.user?.nickname || '-' }}</div>
                <div style="font-size: 12px; color: #999;">{{ record.user?.phone || '' }}</div>
              </template>
              <span v-else style="color: #ccc;">-</span>
            </template>
            <template v-else-if="column.dataIndex === 'redeemedAt'">
              {{ record.redeemedAt ? dayjs(record.redeemedAt).format('MM-DD HH:mm') : '-' }}
            </template>
            <template v-else-if="column.dataIndex === 'action'">
              <a-space>
                <a-button size="small" @click="openQr(record)">二维码</a-button>
                <a-popconfirm v-perm="'voucher:update'" v-if="record.status === 'UNUSED'" title="确定作废该兑换码？" @confirm="handleRevoke(record, true)">
                  <a-button size="small" danger>作废</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>
      </template>
      <a-spin v-else style="display: block; margin: 60px auto;" />
      <template #footer>
        <a-space>
          <a-button @click="loadBatchDetail(currentBatchNo)">刷新</a-button>
          <a-button type="primary" @click="exportBatchCsv(currentBatchNo)">导出 CSV（含兑换码）</a-button>
        </a-space>
      </template>
    </a-drawer>

    <!-- ===== 单券二维码弹窗 ===== -->
    <a-modal v-model:open="showQrModal" title="兑换二维码" width="400px" :footer="null">
      <template v-if="qrVoucher">
        <div class="qr-card">
          <div class="qr-face">
            <span v-if="qrVoucher.mode === 'REDUCE_TO'">减至 ¥{{ Number(qrVoucher.targetPrice || 0) }}</span>
            <span v-else>立减 ¥{{ Number(qrVoucher.amount || 0) }}</span>
          </div>
          <div class="qr-code-text">{{ formatCode(qrVoucher.redeemCode) }}</div>
          <div class="qr-img-wrap">
            <img v-if="!qrError" :src="qrSrc" alt="兑换二维码" class="qr-img" @error="qrError = true" />
            <div v-else class="qr-fallback">
              <p>二维码加载失败</p>
              <a-button size="small" @click="qrError = false">重试</a-button>
            </div>
          </div>
          <div class="qr-tip">微信扫码直达兑换页；也可在小程序「我的 → 兑换代金券」手动输入兑换码。有效期至 {{ dayjs(qrVoucher.expiresAt).format('YYYY-MM-DD') }}。</div>
          <a-space style="margin-top: 12px;">
            <a-button type="primary" :loading="qrDownloading" @click="downloadQr">下载二维码</a-button>
            <a-button @click="copyText(formatCode(qrVoucher.redeemCode))">复制兑换码</a-button>
          </a-space>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import dayjs, { Dayjs } from 'dayjs'
import {
  listVouchers, grantVoucher, grantVoucherBatch, revokeVoucher,
  listVoucherBatches, getVoucherBatchDetail,
} from '@/api/voucher'
import { useAuthStore } from '@/stores/auth'
import { adminListUsers } from '@/api/user'
import { adminListCourses } from '@/api/course'

const loading = ref(false)
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
/** 发券动作需要 voucher:create；查看（voucher:view）不受影响 */
const canGrant = computed(() => auth.hasPerm('voucher:create'))
const granting = ref(false)
const batchGranting = ref(false)
const batchLoading = ref(false)
const filterStatus = ref('')
const filterBatch = ref<string | undefined>(undefined)
const activeTab = ref('list')
const showGrantModal = ref(false)
const showBatchModal = ref(false)
const vouchers = ref<any[]>([])
const batches = ref<any[]>([])
const userOptions = ref<{ label: string; value: string }[]>([])
const courseOptions = ref<{ label: string; value: string }[]>([])

const statusLabelMap: Record<string, string> = { UNUSED: '未使用', USED: '已使用', EXPIRED: '已过期', REVOKED: '已作废' }
const statusColorMap: Record<string, string> = { UNUSED: 'blue', USED: 'green', EXPIRED: 'default', REVOKED: 'red' }

/** 码券未兑换时单独展示「未兑换」，与已归属用户的未使用券区分 */
function displayStatus(record: any) {
  if (record.redeemCode && !record.userId && record.status === 'UNUSED') {
    return { label: '未兑换', color: 'gold' }
  }
  return { label: statusLabelMap[record.status] || record.status, color: statusColorMap[record.status] || 'default' }
}

function formatCode(code: string) {
  const c = String(code || '').toUpperCase()
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

const columns = [
  { title: '用户', dataIndex: 'user', width: 140 },
  { title: '面额', dataIndex: 'amount', width: 110 },
  { title: '兑换码', dataIndex: 'redeemCode', width: 170 },
  { title: '适用范围', dataIndex: 'scope', width: 130 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '来源', dataIndex: 'source', width: 130 },
  { title: '批次', dataIndex: 'batchNo', width: 170 },
  { title: '有效期至', dataIndex: 'expiresAt', width: 110 },
  { title: '操作', dataIndex: 'action', width: 150, fixed: 'right' },
]

const batchColumns = [
  { title: '批次号', dataIndex: 'batchNo', width: 180 },
  { title: '面额', dataIndex: 'amount', width: 110 },
  { title: '适用范围', dataIndex: 'scope', width: 100 },
  { title: '兑换进度', dataIndex: 'progress', width: 210 },
  { title: '已使用', dataIndex: 'used', width: 80 },
  { title: '已作废', dataIndex: 'revoked', width: 80 },
  { title: '来源', dataIndex: 'source', width: 130 },
  { title: '有效期至', dataIndex: 'expiresAt', width: 110 },
  { title: '创建时间', dataIndex: 'createdAt', width: 150 },
  { title: '操作', dataIndex: 'action', width: 200, fixed: 'right' },
]

const detailColumns = [
  { title: '兑换码', dataIndex: 'redeemCode', width: 140 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '持券人', dataIndex: 'user', width: 150 },
  { title: '兑换时间', dataIndex: 'redeemedAt', width: 120 },
  { title: '操作', dataIndex: 'action', width: 150 },
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

const batchForm = ref({
  quantity: 10 as number | null,
  mode: 'REDUCE_BY' as 'REDUCE_BY' | 'REDUCE_TO',
  amount: null as number | null,
  targetPrice: null as number | null,
  expiresAt: dayjs().add(30, 'day') as Dayjs | null,
  source: '',
  applicableAll: true,
  applicableCourseIds: [] as string[],
})

function countByStatus(status: string) {
  return vouchers.value.filter(v => v.status === status).length
}

function countUnclaimed() {
  return vouchers.value.filter(v => v.redeemCode && !v.userId && v.status === 'UNUSED').length
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
    const params: any = {}
    if (filterStatus.value) params.status = filterStatus.value
    if (filterBatch.value) params.batchNo = filterBatch.value
    const res = await listVouchers(Object.keys(params).length ? params : undefined)
    vouchers.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false
  }
}

async function loadBatches() {
  batchLoading.value = true
  try {
    const res = await listVoucherBatches()
    batches.value = Array.isArray(res) ? res : []
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    batchLoading.value = false
  }
}

function onTabChange(key: string) {
  if (key === 'batches') loadBatches()
  // Tab 写进地址栏：/sales/vouchers?tab=batches 可直达批量发券，便于文档与消息里给链接
  router.replace({ path: route.path, query: { ...route.query, tab: key === 'batches' ? 'batches' : undefined } })
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

function validateFace(form: { mode: string; amount: number | null; targetPrice: number | null; expiresAt: Dayjs | null }) {
  if (form.mode === 'REDUCE_BY' && !form.amount) {
    message.warning('请填写抵扣面额')
    return false
  }
  if (form.mode === 'REDUCE_TO' && (form.targetPrice === null || form.targetPrice < 0)) {
    message.warning('请填写减至目标价')
    return false
  }
  if (!form.expiresAt) {
    message.warning('请选择有效期')
    return false
  }
  return true
}

async function confirmGrant() {
  if (!grantForm.value.userIds.length) {
    message.warning('请选择发放用户')
    return
  }
  if (!validateFace(grantForm.value)) return
  granting.value = true
  try {
    const res = await grantVoucher({
      userIds: grantForm.value.userIds,
      mode: grantForm.value.mode,
      amount: grantForm.value.mode === 'REDUCE_BY' ? grantForm.value.amount : undefined,
      targetPrice: grantForm.value.mode === 'REDUCE_TO' ? grantForm.value.targetPrice : undefined,
      expiresAt: grantForm.value.expiresAt!.toISOString(),
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

function openBatchGrant() {
  batchForm.value = { quantity: 10, mode: 'REDUCE_BY', amount: null, targetPrice: null, expiresAt: dayjs().add(30, 'day'), source: '', applicableAll: true, applicableCourseIds: [] }
  showBatchModal.value = true
}

async function confirmBatchGrant() {
  const q = Number(batchForm.value.quantity)
  if (!Number.isInteger(q) || q < 1 || q > 500) {
    message.warning('发放数量须为 1-500 的整数')
    return
  }
  if (!validateFace(batchForm.value)) return
  batchGranting.value = true
  try {
    const res = await grantVoucherBatch({
      quantity: q,
      mode: batchForm.value.mode,
      amount: batchForm.value.mode === 'REDUCE_BY' ? batchForm.value.amount! : undefined,
      targetPrice: batchForm.value.mode === 'REDUCE_TO' ? batchForm.value.targetPrice! : undefined,
      expiresAt: batchForm.value.expiresAt!.toISOString(),
      source: batchForm.value.source || '兑换码发券',
      applicableAll: batchForm.value.applicableAll,
      applicableCourseIds: batchForm.value.applicableAll ? [] : batchForm.value.applicableCourseIds,
    })
    showBatchModal.value = false
    if (res?.pendingApproval) {
      message.success('批量发券申请已提交，审批通过后生成兑换码，可在批次列表查看')
    } else {
      message.success(`已生成 ${res?.granted ?? q} 张兑换码券`)
      if (res?.batchNo) openBatchDetail(res.batchNo)
    }
    loadVouchers()
    loadBatches()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    batchGranting.value = false
  }
}

async function handleRevoke(record: any, inDrawer = false) {
  try {
    await revokeVoucher(record.id)
    message.success('代金券已作废')
    if (inDrawer) loadBatchDetail(currentBatchNo.value)
    loadVouchers()
    loadBatches()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

// ===== 批次明细 =====
const showBatchDrawer = ref(false)
const currentBatchNo = ref('')
const batchDetail = ref<any>(null)

async function openBatchDetail(batchNo: string) {
  currentBatchNo.value = batchNo
  batchDetail.value = null
  showBatchDrawer.value = true
  activeTab.value = 'batches'
  await loadBatchDetail(batchNo)
}

async function loadBatchDetail(batchNo: string) {
  if (!batchNo) return
  try {
    batchDetail.value = await getVoucherBatchDetail(batchNo)
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

// ===== 二维码 =====
const showQrModal = ref(false)
const qrVoucher = ref<any>(null)
const qrError = ref(false)
const qrDownloading = ref(false)

const qrSrc = computed(() =>
  qrVoucher.value ? `/api/v1/share/qrcode?scene=v${encodeURIComponent(qrVoucher.value.redeemCode)}` : ''
)

function openQr(record: any) {
  qrVoucher.value = record
  qrError.value = false
  showQrModal.value = true
}

async function downloadQr() {
  if (!qrVoucher.value) return
  qrDownloading.value = true
  try {
    const resp = await fetch(qrSrc.value)
    if (!resp.ok) throw new Error('二维码获取失败')
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Full愈代金券-${formatCode(qrVoucher.value.redeemCode)}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    message.success('二维码已下载')
  } catch (e) {
    message.error('二维码下载失败，请重试')
  } finally {
    qrDownloading.value = false
  }
}

// ===== 导出与复制 =====
async function exportBatchCsv(batchNo: string) {
  if (!batchNo) return
  try {
    const detail: any = await getVoucherBatchDetail(batchNo)
    const rows = detail?.rows || []
    const header = ['兑换码', '状态', '持券人', '手机号', '兑换时间', '有效期至']
    const lines = rows.map((r: any) => [
      formatCode(r.redeemCode),
      displayStatus(r).label,
      r.user?.nickname || '',
      r.user?.phone || '',
      r.redeemedAt ? dayjs(r.redeemedAt).format('YYYY-MM-DD HH:mm') : '',
      r.expiresAt ? dayjs(r.expiresAt).format('YYYY-MM-DD') : '',
    ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    const csv = '\uFEFF' + [header.join(','), ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `代金券批次-${batchNo}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    message.success(`已导出 ${rows.length} 条兑换码`)
  } catch (e) {
    message.error('导出失败，请重试')
  }
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    message.success('已复制')
  } catch (e) {
    message.error('复制失败，请手动选择复制')
  }
}

onMounted(() => {
  if (route.query.tab === 'batches') activeTab.value = 'batches'
  loadVouchers()
  loadBatches()
  loadOptions()
})
</script>

<style scoped>
.code-text {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #3d2c1e;
}
.qr-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0 4px;
}
.qr-face {
  font-size: 22px;
  font-weight: 700;
  color: #6b463c;
  letter-spacing: 0.06em;
}
.qr-code-text {
  margin-top: 4px;
  font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: #3d2c1e;
}
.qr-img-wrap {
  margin-top: 12px;
  width: 240px;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #efe7dc;
  border-radius: 12px;
  background: #fff;
}
.qr-img {
  width: 224px;
  height: 224px;
  object-fit: contain;
}
.qr-fallback {
  text-align: center;
  color: #999;
}
.qr-tip {
  margin-top: 12px;
  font-size: 12px;
  color: #8a7a68;
  text-align: center;
  line-height: 1.7;
  letter-spacing: 0.05em;
}
</style>
