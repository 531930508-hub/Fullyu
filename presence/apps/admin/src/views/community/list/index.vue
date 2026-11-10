<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">社群管理</h2>
      <a-space>
        <a-select v-model:value="filterStatus" style="width: 140px" @change="loadList">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option value="PENDING">待审核</a-select-option>
          <a-select-option value="APPROVED">已通过</a-select-option>
          <a-select-option value="REJECTED">已驳回</a-select-option>
        </a-select>
        <a-input-search v-model:value="keyword" placeholder="搜索社群名称" style="width: 220px" @search="loadList" />
        <a-button type="primary" @click="openAdd">+ 新增社群</a-button>
      </a-space>
    </div>

    <a-card>
      <a-table :columns="columns" :data-source="list" :loading="loading" size="small" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'cover'">
            <div class="cover-cell" :style="{ background: record.coverFallback || '#F4EEE6' }">
              <img v-if="record.coverUrl" :src="record.coverUrl" alt="" />
            </div>
          </template>
          <template v-if="column.dataIndex === 'name'">
            <div style="font-weight: 600;">
              {{ record.name }}
              <a-tag v-if="record.isOfficial" color="gold">官方</a-tag>
            </div>
            <div style="color: #999; font-size: 12px;">{{ record.slogan }}</div>
          </template>
          <template v-if="column.dataIndex === 'yearlyFee'">
            <span>{{ record.yearlyFee === 0 ? '免费' : `¥${(record.yearlyFee / 100).toFixed(0)}/年` }}</span>
          </template>
          <template v-if="column.dataIndex === 'status'">
            <a-tag :color="statusColor(record.status)">{{ statusText(record.status) }}</a-tag>
            <a-tag v-if="!record.isActive" color="default">已下架</a-tag>
            <a-tag v-if="record.visibility === 'INVITE_ONLY'" color="purple">邀请制</a-tag>
            <a-tag v-else-if="record.visibility === 'HIDDEN'" color="default">隐藏</a-tag>
            <a-tag v-if="record.joinMode === 'APPROVAL'" color="orange">需审核</a-tag>
            <a-tag v-else-if="record.joinMode === 'INVITE'" color="purple">仅邀请</a-tag>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-space wrap>
              <template v-if="record.status === 'PENDING'">
                <a style="color: #27AE60;" @click="onAudit(record, true)">通过</a>
                <a style="color: #C0392B;" @click="onAudit(record, false)">驳回</a>
              </template>
              <a @click="openEdit(record)">编辑</a>
              <a v-if="record.status === 'APPROVED'" :style="{ color: record.isActive ? '#F39C12' : '#27AE60' }" @click="onToggle(record)">
                {{ record.isActive ? '下架' : '上架' }}
              </a>
              <a-popconfirm title="确定删除该社群？其活动与动态将一并删除" @confirm="onRemove(record)">
                <a style="color: #C0392B;">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新增/编辑抽屉 -->
    <a-drawer v-model:open="drawerVisible" :title="isEdit ? '编辑社群' : '新增社群'" width="620" placement="right">
      <a-form layout="vertical">
        <a-form-item label="社群名称" required>
          <a-input v-model:value="form.name" placeholder="如：正念疗愈空间" />
        </a-form-item>
        <a-form-item label="一句话定位" required>
          <a-input v-model:value="form.slogan" placeholder="如：每天 10 分钟，把注意力还给自己" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="分类">
              <a-select v-model:value="form.category">
                <a-select-option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="年费（元，0 = 免费）">
              <a-input-number v-model:value="form.feeYuan" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="封面图（支持本地上传）">
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div class="cover-preview" :style="{ background: form.coverFallback || '#F4EEE6' }">
              <img v-if="form.coverUrl" :src="form.coverUrl" alt="" />
              <span v-else style="color: #999; font-size: 12px;">16:9</span>
            </div>
            <div style="flex: 1;">
              <a-upload :show-upload-list="false" :before-upload="onCoverUpload" accept="image/*">
                <a-button :loading="uploading">{{ form.coverUrl ? '重新上传' : '本地上传' }}</a-button>
              </a-upload>
              <a-input v-model:value="form.coverUrl" placeholder="或直接粘贴图片 URL" style="margin-top: 8px;" />
              <a-input v-model:value="form.coverFallback" placeholder="兜底渐变色，如 linear-gradient(135deg, #6D5934, #A78E70)" style="margin-top: 8px;" />
            </div>
          </div>
        </a-form-item>

        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="主理人名称">
              <a-input v-model:value="form.ownerName" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="主理人头衔">
              <a-input v-model:value="form.ownerTitle" placeholder="如：认证导师" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="主理人头像">
              <a-upload :show-upload-list="false" :before-upload="onAvatarUpload" accept="image/*">
                <a-button size="small">上传</a-button>
              </a-upload>
              <a-input v-model:value="form.ownerAvatar" placeholder="或粘贴 URL" size="small" style="margin-top: 6px;" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="标签（最多 4 个）">
          <a-select
            v-model:value="form.tags"
            mode="tags"
            :options="TAG_OPTIONS.map((t) => ({ label: t, value: t }))"
            placeholder="选择或输入后回车"
          />
        </a-form-item>

        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="可见性">
              <a-select v-model:value="form.visibility">
                <a-select-option value="PUBLIC">公开</a-select-option>
                <a-select-option value="HIDDEN">隐藏（不出现在广场）</a-select-option>
                <a-select-option value="INVITE_ONLY">邀请制（不公开详情）</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="入群方式">
              <a-select v-model:value="form.joinMode">
                <a-select-option value="OPEN">公开加入</a-select-option>
                <a-select-option value="APPROVAL">需审核</a-select-option>
                <a-select-option value="INVITE">仅邀请</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="主理人用户 ID（可选；用于主理人工作台与分享）">
          <a-input v-model:value="form.ownerUserId" placeholder="小程序用户 ID（CUID）" />
          <div class="field-hint">基础主理人仅可拥有 1 个社群；第 2 个需先在「主理人角色」升级为扩展主理人。</div>
        </a-form-item>

        <a-form-item label="兴趣标签池（最多 12 个；成员加入时最多选 3 个）">
          <a-select
            v-model:value="form.interestPool"
            mode="tags"
            :options="INTEREST_OPTIONS.map((t) => ({ label: t, value: t }))"
            placeholder="选择或输入后回车"
          />
        </a-form-item>

        <a-form-item label="社群介绍">
          <a-textarea v-model:value="form.description" :rows="3" placeholder="成员能得到什么：内容形式、更新频率、专属权益…" />
        </a-form-item>

        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="官方社群"><a-switch v-model:checked="form.isOfficial" /></a-form-item></a-col>
          <a-col :span="9"><a-form-item label="新社群（排序加权）"><a-switch v-model:checked="form.isNew" /></a-form-item></a-col>
          <a-col :span="9">
            <a-form-item label="审核状态">
              <a-select v-model:value="form.status">
                <a-select-option value="PENDING">待审核</a-select-option>
                <a-select-option value="APPROVED">已通过</a-select-option>
                <a-select-option value="REJECTED">已驳回</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-button type="primary" block :loading="saving" @click="onSave">{{ isEdit ? '保存修改' : '确认新增' }}</a-button>
      </a-form>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  adminListCommunities, createCommunity, updateCommunity,
  auditCommunity, setCommunityStatus, deleteCommunity,
} from '@/api/community'
import { uploadFile } from '@/api/upload'

const CATEGORIES = ['疗愈', '瑜伽', '身心成长', '手作', '健身']
const TAG_OPTIONS = ['良好健康', '优质教育', '责任消费', '身心疗愈', '身体疗愈', '复愈特色', '职业成长', '轻户外', '正念', '共修', '打卡']
const INTEREST_OPTIONS = ['正念', '瑜伽', '冥想', '呼吸练习', '颂钵', '手作', '阅读', '轻户外', '睡眠', '饮食', '情绪', '体态']

const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const list = ref<any[]>([])
const filterStatus = ref('')
const keyword = ref('')

const columns = [
  { title: '封面', dataIndex: 'cover', width: 110 },
  { title: '社群', dataIndex: 'name' },
  { title: '分类', dataIndex: 'category', width: 90 },
  { title: '主理人', dataIndex: 'ownerName', width: 110 },
  { title: '年费', dataIndex: 'yearlyFee', width: 100 },
  { title: '成员', dataIndex: 'memberCount', width: 80 },
  { title: '状态', dataIndex: 'status', width: 130 },
  { title: '操作', dataIndex: 'action', width: 200 },
]

function statusText(s: string) {
  return s === 'PENDING' ? '待审核' : s === 'APPROVED' ? '已通过' : '已驳回'
}
function statusColor(s: string) {
  return s === 'PENDING' ? 'orange' : s === 'APPROVED' ? 'green' : 'red'
}

async function loadList() {
  loading.value = true
  try {
    const res = await adminListCommunities({ status: filterStatus.value || undefined, keyword: keyword.value || undefined })
    list.value = Array.isArray(res) ? res : []
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false
  }
}

const drawerVisible = ref(false)
const isEdit = ref(false)
const editingId = ref('')

function emptyForm() {
  return {
    name: '',
    slogan: '',
    category: '疗愈',
    feeYuan: 0,
    coverUrl: '',
    coverFallback: 'linear-gradient(135deg, #6D5934 0%, #A78E70 100%)',
    ownerUserId: '',
    ownerName: '',
    ownerTitle: '',
    ownerAvatar: '',
    visibility: 'PUBLIC',
    joinMode: 'OPEN',
    interestPool: [] as string[],
    tags: [] as string[],
    description: '',
    isOfficial: false,
    isNew: false,
    status: 'APPROVED',
  }
}
const form = ref(emptyForm())

function openAdd() {
  isEdit.value = false
  form.value = emptyForm()
  drawerVisible.value = true
}

function openEdit(record: any) {
  isEdit.value = true
  editingId.value = record.id
  form.value = {
    name: record.name,
    slogan: record.slogan || '',
    category: record.category || '疗愈',
    feeYuan: (record.yearlyFee ?? 0) / 100,
    coverUrl: record.coverUrl || '',
    coverFallback: record.coverFallback || '',
    ownerUserId: record.ownerUserId || '',
    ownerName: record.ownerName || '',
    ownerTitle: record.ownerTitle || '',
    ownerAvatar: record.ownerAvatar || '',
    visibility: record.visibility || 'PUBLIC',
    joinMode: record.joinMode || 'OPEN',
    interestPool: safeTags(record.interestPool),
    tags: safeTags(record.tags),
    description: record.description || '',
    isOfficial: Boolean(record.isOfficial),
    isNew: Boolean(record.isNew),
    status: record.status || 'APPROVED',
  }
  drawerVisible.value = true
}

function safeTags(raw: any): string[] {
  if (Array.isArray(raw)) return raw
  try {
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function onCoverUpload(file: File) {
  uploading.value = true
  try {
    const res = await uploadFile(file, 'community')
    form.value.coverUrl = res.url
    message.success('封面上传成功')
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    uploading.value = false
  }
  return false
}

async function onAvatarUpload(file: File) {
  try {
    const res = await uploadFile(file, 'community')
    form.value.ownerAvatar = res.url
    message.success('头像上传成功')
  } catch (e) {
    // 错误已由拦截器统一提示
  }
  return false
}

function buildBody() {
  const f = form.value
  return {
    name: f.name,
    slogan: f.slogan,
    category: f.category,
    coverUrl: f.coverUrl || null,
    coverFallback: f.coverFallback || null,
    ownerUserId: f.ownerUserId?.trim() || null,
    ownerName: f.ownerName,
    ownerTitle: f.ownerTitle || null,
    ownerAvatar: f.ownerAvatar || null,
    yearlyFee: Math.round((f.feeYuan || 0) * 100),
    visibility: f.visibility,
    joinMode: f.joinMode,
    interestPool: f.interestPool.slice(0, 12),
    tags: f.tags.slice(0, 4),
    description: f.description || null,
    isOfficial: f.isOfficial,
    isNew: f.isNew,
    status: f.status,
  }
}

async function onSave() {
  if (!form.value.name?.trim() || !form.value.slogan?.trim()) {
    message.warning('名称与一句话定位为必填')
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      await updateCommunity(editingId.value, buildBody())
      message.success('社群已更新')
    } else {
      await createCommunity(buildBody())
      message.success('社群已创建')
    }
    drawerVisible.value = false
    loadList()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    saving.value = false
  }
}

async function onAudit(record: any, approved: boolean) {
  try {
    await auditCommunity(record.id, approved)
    message.success(approved ? `「${record.name}」已通过，上架广场` : `「${record.name}」已驳回`)
    loadList()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

async function onToggle(record: any) {
  try {
    await setCommunityStatus(record.id, !record.isActive)
    message.success(!record.isActive ? '已上架' : '已下架')
    loadList()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

async function onRemove(record: any) {
  try {
    await deleteCommunity(record.id)
    message.success('已删除')
    loadList()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

onMounted(loadList)
</script>

<style scoped>
.cover-cell {
  width: 88px;
  height: 50px;
  border-radius: 6px;
  overflow: hidden;
}
.cover-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cover-preview {
  width: 160px;
  height: 90px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.field-hint {
  margin-top: 6px;
  color: #999;
  font-size: 12px;
  line-height: 1.6;
}
</style>
