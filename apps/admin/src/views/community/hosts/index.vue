<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2 class="page-title">主理人角色</h2>
        <p class="page-sub">基础主理人仅可开设 1 个社群；扩展主理人可开设多个，由平台人工开通，不涉及系统内计费。</p>
      </div>
      <a-space wrap>
        <a-input-search v-model:value="keyword" placeholder="搜索昵称或手机号" style="width: 220px" @search="loadList" />
        <a-button type="primary" @click="openAssign">按用户 ID 开通</a-button>
      </a-space>
    </div>

    <a-card :bordered="false">
      <a-table :columns="columns" :data-source="list" :loading="loading" size="small" row-key="id" :pagination="{ pageSize: 12 }">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'nickname'">
            <a-space>
              <a-avatar :src="record.avatar" size="small">{{ (record.nickname || '主')[0] }}</a-avatar>
              <span>{{ record.nickname || '未命名' }}</span>
            </a-space>
          </template>
          <template v-if="column.dataIndex === 'communityHostRole'">
            <a-tag :color="roleColor(record.communityHostRole)">{{ record.roleLabel }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'communityCount'">
            <span>{{ record.communityCount }}</span>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-space wrap>
              <a v-if="record.communityHostRole !== 'BASIC'" @click="setRole(record, 'BASIC')">设为基础</a>
              <a v-if="record.communityHostRole !== 'EXTENDED'" @click="setRole(record, 'EXTENDED')">升级扩展</a>
              <a-popconfirm v-if="record.communityHostRole" title="取消后该用户不能再创建社群，已开设社群不受影响。确定取消？" @confirm="setRole(record, null)">
                <a style="color: #c0392b">取消身份</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="assignVisible" title="按用户 ID 开通主理人" :confirm-loading="assignSaving" @ok="submitAssign">
      <a-form layout="vertical">
        <a-form-item label="用户 ID" required>
          <a-input v-model:value="assignUserId" placeholder="小程序用户 ID（CUID）" />
        </a-form-item>
        <a-form-item label="角色">
          <a-radio-group v-model:value="assignRole">
            <a-radio value="BASIC">基础主理人（1 个社群）</a-radio>
            <a-radio value="EXTENDED">扩展主理人（多个社群）</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-alert type="info" show-icon message="开通后请到「社群管理」把社群的主理人用户 ID 设为该用户。" />
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { adminListHosts, adminSetHostRole } from '@/api/community'

const loading = ref(false)
const list = ref<any[]>([])
const keyword = ref('')
const columns = [
  { title: '主理人', dataIndex: 'nickname' },
  { title: '手机号', dataIndex: 'phone', width: 140 },
  { title: '角色', dataIndex: 'communityHostRole', width: 120 },
  { title: '社群数', dataIndex: 'communityCount', width: 90 },
  { title: '操作', dataIndex: 'action', width: 220 },
]

async function loadList() {
  loading.value = true
  try {
    const res: any = await adminListHosts(keyword.value.trim() || undefined)
    list.value = Array.isArray(res) ? res : []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function roleColor(role: string | null) {
  return role === 'EXTENDED' ? 'gold' : role === 'BASIC' ? 'green' : 'default'
}

async function setRole(record: any, role: 'BASIC' | 'EXTENDED' | null) {
  try {
    await adminSetHostRole(record.id, role)
    message.success(role === null ? '已取消主理人身份' : role === 'BASIC' ? '已设为基础主理人' : '已升级为扩展主理人')
    loadList()
  } catch { /* 统一提示 */ }
}

const assignVisible = ref(false)
const assignSaving = ref(false)
const assignUserId = ref('')
const assignRole = ref<'BASIC' | 'EXTENDED'>('BASIC')

function openAssign() {
  assignUserId.value = ''
  assignRole.value = 'BASIC'
  assignVisible.value = true
}

async function submitAssign() {
  if (!assignUserId.value.trim()) {
    message.warning('请填写用户 ID')
    return
  }
  assignSaving.value = true
  try {
    await adminSetHostRole(assignUserId.value.trim(), assignRole.value)
    message.success('角色已设置')
    assignVisible.value = false
    loadList()
  } catch { /* 统一提示 */ } finally {
    assignSaving.value = false
  }
}

onMounted(loadList)
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.page-title {
  margin: 0;
}
.page-sub {
  margin: 6px 0 0;
  color: #8c8c8c;
  font-size: 13px;
}
</style>
