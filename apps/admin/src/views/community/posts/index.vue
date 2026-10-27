<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2 class="page-title">内容治理</h2>
        <p class="page-sub">动态与评论发布后立即对成员可见；隐藏、恢复、删除必须填写原因并记录日志。</p>
      </div>
      <a-space wrap>
        <a-select v-model:value="filterCommunity" style="width: 200px" allow-clear placeholder="全部社群" @change="loadList">
          <a-select-option v-for="c in communities" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
        </a-select>
        <a-select v-model:value="filterStatus" style="width: 140px" @change="loadList">
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="APPROVED">已发布</a-select-option>
          <a-select-option value="PENDING">历史待审</a-select-option>
          <a-select-option value="REJECTED">已驳回</a-select-option>
        </a-select>
        <a-button :disabled="!filterCommunity" @click="loadLogs">治理日志</a-button>
      </a-space>
    </div>

    <a-card :loading="loading">
      <a-empty v-if="!list.length" description="暂无动态" />
      <div v-for="p in list" :key="p.id" class="post-item">
        <div class="post-head">
          <a-avatar :src="p.authorAvatar" size="small">{{ (p.authorName || '成')[0] }}</a-avatar>
          <span class="post-author">{{ p.authorName || '成员' }}</span>
          <a-tag size="small">{{ p.authorRole }}</a-tag>
          <a-tag color="blue">{{ p.community?.name || '未知社群' }}</a-tag>
          <span class="post-time">{{ fmtTime(p.createdAt) }}</span>
          <a-tag v-if="p.isDeleted" color="red" style="margin-left: auto">已删除</a-tag>
          <a-tag v-else-if="p.isHidden" color="orange" style="margin-left: auto">已隐藏</a-tag>
          <a-tag v-else :color="statusColor(p.status)" style="margin-left: auto">{{ statusText(p.status) }}</a-tag>
        </div>
        <div class="post-content">{{ p.content }}</div>
        <div v-if="parseImages(p.images).length" class="post-images">
          <img v-for="(img, i) in parseImages(p.images)" :key="i" :src="img" alt="" />
        </div>
        <div v-if="p.hiddenReason" class="post-reason">处理原因：{{ p.hiddenReason }}</div>
        <div class="post-actions">
          <a-space>
            <a-button v-if="!p.isHidden && !p.isDeleted" size="small" @click="openModeration(p, 'HIDE')">隐藏</a-button>
            <a-button v-if="p.isHidden || p.isDeleted" size="small" @click="openModeration(p, 'RESTORE')">恢复</a-button>
            <a-button v-if="!p.isDeleted" size="small" danger @click="openModeration(p, 'DELETE')">删除</a-button>
          </a-space>
        </div>
      </div>
    </a-card>

    <a-modal v-model:open="moderationVisible" :title="moderationTitle" :confirm-loading="saving" @ok="submitModeration">
      <a-textarea v-model:value="reason" :rows="3" placeholder="请填写处理原因（必填）" :maxlength="300" />
    </a-modal>

    <a-drawer v-model:open="logVisible" title="内容治理日志" width="560" placement="right">
      <a-empty v-if="!logs.length" description="暂无治理记录" />
      <div v-for="log in logs" :key="log.id" class="log-item">
        <div class="log-head">
          <a-tag :color="log.action === 'DELETE' ? 'red' : log.action === 'HIDE' ? 'orange' : 'green'">{{ actionText(log.action) }}</a-tag>
          <span>{{ log.targetType === 'COMMENT' ? '评论' : '动态' }}</span>
          <span class="post-time">{{ fmtTime(log.createdAt) }}</span>
        </div>
        <div class="log-body">{{ log.reason }}</div>
        <div class="post-time">操作人：{{ log.actorName || log.actorId }}（{{ log.actorType === 'HOST' ? '主理人' : '平台' }}）</div>
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  adminListPosts, adminListCommunities, moderateContent, adminListModerationLogs,
} from '@/api/community'

const loading = ref(false)
const list = ref<any[]>([])
const communities = ref<any[]>([])
const filterCommunity = ref<string | undefined>(undefined)
const filterStatus = ref('')
const moderationVisible = ref(false)
const saving = ref(false)
const target = ref<any>(null)
const action = ref<'HIDE' | 'RESTORE' | 'DELETE'>('HIDE')
const reason = ref('')
const logVisible = ref(false)
const logs = ref<any[]>([])

const moderationTitle = computed(() => (action.value === 'HIDE' ? '隐藏动态' : action.value === 'RESTORE' ? '恢复动态' : '删除动态'))

function statusText(s: string) {
  return s === 'PENDING' ? '历史待审' : s === 'APPROVED' ? '已发布' : '已驳回'
}
function statusColor(s: string) {
  return s === 'PENDING' ? 'orange' : s === 'APPROVED' ? 'green' : 'red'
}
function actionText(a: string) {
  return a === 'HIDE' ? '隐藏' : a === 'RESTORE' ? '恢复' : '删除'
}
function parseImages(raw: any): string[] {
  if (Array.isArray(raw)) return raw
  try {
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
function fmtTime(t: string) {
  if (!t) return ''
  return String(t).replace('T', ' ').slice(0, 16)
}

async function loadCommunities() {
  try {
    const res: any = await adminListCommunities()
    communities.value = Array.isArray(res) ? res : []
  } catch {
    communities.value = []
  }
}

async function loadList() {
  loading.value = true
  try {
    const res: any = await adminListPosts(filterStatus.value || undefined, filterCommunity.value)
    list.value = Array.isArray(res) ? res : []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function openModeration(post: any, act: 'HIDE' | 'RESTORE' | 'DELETE') {
  target.value = post
  action.value = act
  reason.value = ''
  moderationVisible.value = true
}

async function submitModeration() {
  if (!target.value) return
  if (!reason.value.trim()) {
    message.warning('请填写处理原因')
    return
  }
  saving.value = true
  try {
    await moderateContent({
      communityId: target.value.communityId,
      targetType: 'POST',
      targetId: target.value.id,
      action: action.value,
      reason: reason.value.trim(),
    })
    message.success('已处理，操作已记录')
    moderationVisible.value = false
    loadList()
    if (logVisible.value) loadLogs()
  } catch { /* 统一提示 */ } finally {
    saving.value = false
  }
}

async function loadLogs() {
  if (!filterCommunity.value) {
    message.warning('请先选择社群再查看治理日志')
    return
  }
  logVisible.value = true
  try {
    const res: any = await adminListModerationLogs(filterCommunity.value)
    logs.value = Array.isArray(res) ? res : []
  } catch {
    logs.value = []
  }
}

onMounted(() => {
  loadCommunities()
  loadList()
})
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
.post-item {
  padding: 14px 0;
  border-bottom: 1px solid #f0f0f0;
}
.post-item:last-child {
  border-bottom: none;
}
.post-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.post-author {
  font-weight: 600;
}
.post-time {
  color: #999;
  font-size: 12px;
}
.post-content {
  margin: 8px 0 4px;
  color: #333;
  line-height: 1.7;
  white-space: pre-wrap;
}
.post-images {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.post-images img {
  width: 120px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
}
.post-reason {
  margin-top: 6px;
  color: #c0392b;
  font-size: 12px;
}
.post-actions {
  margin-top: 10px;
}
.log-item {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}
.log-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.log-body {
  margin: 6px 0;
  color: #333;
}
</style>
