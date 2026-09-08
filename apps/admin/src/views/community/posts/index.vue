<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">动态审核</h2>
      <a-select v-model:value="filterStatus" style="width: 140px" @change="loadList">
        <a-select-option value="PENDING">待审核</a-select-option>
        <a-select-option value="APPROVED">已发布</a-select-option>
        <a-select-option value="REJECTED">已驳回</a-select-option>
        <a-select-option value="">全部</a-select-option>
      </a-select>
    </div>

    <a-card :loading="loading">
      <a-empty v-if="!list.length" description="暂无动态" />
      <div v-for="p in list" :key="p.id" class="post-item">
        <div class="post-head">
          <a-avatar :src="p.authorAvatar" size="small">{{ (p.authorName || '成')[0] }}</a-avatar>
          <span class="post-author">{{ p.authorName }}</span>
          <a-tag size="small">{{ p.authorRole }}</a-tag>
          <a-tag color="blue">{{ p.community?.name || '未知社群' }}</a-tag>
          <span class="post-time">{{ fmtTime(p.createdAt) }}</span>
          <a-tag :color="statusColor(p.status)" style="margin-left: auto;">{{ statusText(p.status) }}</a-tag>
        </div>
        <div class="post-content">{{ p.content }}</div>
        <div v-if="parseImages(p.images).length" class="post-images">
          <img v-for="(img, i) in parseImages(p.images)" :key="i" :src="img" alt="" />
        </div>
        <div v-if="p.status === 'PENDING'" class="post-actions">
          <a-button type="primary" size="small" @click="onAudit(p, true)">通过发布</a-button>
          <a-button danger size="small" style="margin-left: 8px;" @click="onAudit(p, false)">驳回</a-button>
        </div>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { adminListPosts, auditPost } from '@/api/community'

const loading = ref(false)
const list = ref<any[]>([])
const filterStatus = ref('PENDING')

function statusText(s: string) {
  return s === 'PENDING' ? '待审核' : s === 'APPROVED' ? '已发布' : '已驳回'
}
function statusColor(s: string) {
  return s === 'PENDING' ? 'orange' : s === 'APPROVED' ? 'green' : 'red'
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
  return t.replace('T', ' ').slice(0, 16)
}

async function loadList() {
  loading.value = true
  try {
    const res = await adminListPosts(filterStatus.value || undefined)
    list.value = Array.isArray(res) ? res : []
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false
  }
}

async function onAudit(p: any, approved: boolean) {
  try {
    await auditPost(p.id, approved)
    message.success(approved ? '已通过，动态将展示在社群内' : '已驳回')
    loadList()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

onMounted(loadList)
</script>

<style scoped>
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
.post-actions {
  margin-top: 10px;
}
</style>
