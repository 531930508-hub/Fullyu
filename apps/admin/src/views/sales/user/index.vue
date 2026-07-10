<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">用户管理</h2>
      <a-space>
        <a-input-search v-model:value="searchText" placeholder="搜索昵称/手机号" style="width: 220px" @search="loadUsers" />
        <a-select v-model:value="filterCard" style="width: 130px">
          <a-select-option value="">全部会员卡</a-select-option>
          <a-select-option value="MONTHLY">月卡</a-select-option>
          <a-select-option value="QUARTERLY">季卡</a-select-option>
          <a-select-option value="YEARLY">年卡</a-select-option>
          <a-select-option value="NONE">无卡</a-select-option>
        </a-select>
      </a-space>
    </div>

    <!-- 用户统计 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="8"><a-card><a-statistic title="总用户" :value="users.length" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="持卡会员" :value="cardHolderCount" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="本月新增" :value="newThisMonth" :value-style="{ color: '#27AE60' }" /></a-card></a-col>
    </a-row>

    <a-card>
      <a-table :columns="columns" :data-source="filteredUsers" row-key="id" :loading="loading">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'name'">
            <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" @click="showUserDetail(record)">
              <a-avatar :src="record.avatar" :style="{ backgroundColor: '#6B463C' }">{{ record.name.charAt(0) }}</a-avatar>
              <div>
                <div style="font-weight: 500;">{{ record.name }}</div>
                <div style="color: #999; font-size: 12px;">{{ record.phone }}</div>
              </div>
            </div>
          </template>
          <template v-if="column.dataIndex === 'card'">
            <a-tag v-if="record.cardLabel" :color="record.cardType === 'YEARLY' ? 'gold' : record.cardType === 'QUARTERLY' ? 'blue' : 'green'">{{ record.cardLabel }}</a-tag>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-space>
              <a-button type="link" size="small" @click.stop="showUserDetail(record)">详情</a-button>
              <a-button type="link" size="small" @click.stop="openSendVoucher(record)">发券</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 用户详情抽屉 -->
    <a-drawer v-model:open="detailVisible" :title="currentUser?.name" width="560" placement="right">
      <template v-if="currentUser">
        <a-descriptions bordered :column="1" size="small">
          <a-descriptions-item label="昵称">{{ currentUser.name }}</a-descriptions-item>
          <a-descriptions-item label="手机号">{{ currentUser.phone }}</a-descriptions-item>
          <a-descriptions-item label="会员卡">{{ currentUser.cardLabel || '未开通' }}</a-descriptions-item>
          <a-descriptions-item label="卡到期">{{ currentUser.cardExpire || '-' }}</a-descriptions-item>
          <a-descriptions-item label="注册时间">{{ currentUser.registerDate }}</a-descriptions-item>
        </a-descriptions>
      </template>
    </a-drawer>

    <!-- 发券弹窗 -->
    <a-modal v-model:open="showVoucherModal" title="发放代金券" @ok="confirmVoucher" :confirm-loading="granting">
      <a-form layout="vertical">
        <a-form-item label="发放对象">{{ voucherTarget?.name }}（{{ voucherTarget?.phone }}）</a-form-item>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="面额（元）"><a-input-number v-model:value="voucherForm.amount" :min="1" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="有效期至"><a-date-picker v-model:value="voucherForm.expiresAt" style="width: 100%" /></a-form-item></a-col>
        </a-row>
        <a-form-item label="发放说明"><a-input v-model:value="voucherForm.source" placeholder="如：新人体验券、活动补偿" /></a-form-item>
        <a-form-item><a-checkbox v-model:checked="voucherForm.applicableAll">全场课程可用</a-checkbox></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { adminListUsers } from '@/api/user'
import { grantVoucher } from '@/api/voucher'

const loading = ref(false)
const searchText = ref('')
const filterCard = ref('')
const users = ref<any[]>([])

const cardLabelMap: Record<string, string> = { MONTHLY: '月卡', QUARTERLY: '季卡', YEARLY: '年卡' }

const columns = [
  { title: '用户', dataIndex: 'name', width: 220 },
  { title: '会员卡', dataIndex: 'card', width: 120 },
  { title: '注册时间', dataIndex: 'registerDate', width: 140 },
  { title: '操作', dataIndex: 'action', width: 160 },
]

function mapUser(u: any) {
  const card = u.memberCards && u.memberCards[0]
  return {
    id: u.id,
    name: u.nickname || '用户',
    phone: u.phone,
    avatar: u.avatar,
    cardType: card?.type || '',
    cardLabel: card ? cardLabelMap[card.type] : '',
    cardExpire: card?.endDate ? String(card.endDate).slice(0, 10) : '',
    registerDate: u.createdAt ? String(u.createdAt).slice(0, 10) : '',
  }
}

async function loadUsers() {
  loading.value = true
  try {
    const data: any = await adminListUsers({ keyword: searchText.value || undefined })
    users.value = (Array.isArray(data) ? data : []).map(mapUser)
  } catch (e: any) {
    message.error(e?.message || '加载用户失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)

const cardHolderCount = computed(() => users.value.filter(u => u.cardLabel).length)
const newThisMonth = computed(() => {
  const start = dayjs().startOf('month')
  return users.value.filter(u => u.registerDate && dayjs(u.registerDate).isAfter(start)).length
})

const filteredUsers = computed(() => {
  return users.value.filter(u => {
    if (filterCard.value === 'NONE' && u.cardType) return false
    if (['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(filterCard.value) && u.cardType !== filterCard.value) return false
    return true
  })
})

const detailVisible = ref(false)
const currentUser = ref<any>(null)
function showUserDetail(record: any) { currentUser.value = record; detailVisible.value = true }

// ===== 发券 =====
const showVoucherModal = ref(false)
const granting = ref(false)
const voucherTarget = ref<any>(null)
const voucherForm = ref<any>({ amount: 50, expiresAt: null, source: '', applicableAll: true })

function openSendVoucher(record: any) {
  voucherTarget.value = record
  voucherForm.value = { amount: 50, expiresAt: dayjs().add(30, 'day'), source: '', applicableAll: true }
  showVoucherModal.value = true
}

async function confirmVoucher() {
  if (!voucherForm.value.amount || !voucherForm.value.expiresAt) { message.warning('请填写面额与有效期'); return }
  granting.value = true
  try {
    await grantVoucher({
      userIds: [voucherTarget.value.id],
      amount: voucherForm.value.amount,
      expiresAt: dayjs(voucherForm.value.expiresAt).toISOString(),
      source: voucherForm.value.source || '后台发放',
      applicableAll: voucherForm.value.applicableAll,
    })
    message.success(`代金券已发放给 ${voucherTarget.value?.name}`)
    showVoucherModal.value = false
  } catch (e: any) {
    message.error(e?.message || '发放失败')
  } finally {
    granting.value = false
  }
}
</script>
