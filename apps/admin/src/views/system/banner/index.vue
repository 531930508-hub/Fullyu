<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">首页 Banner</h2>
      <a-button type="primary" @click="openAdd">+ 新增 Banner</a-button>
    </div>

    <!-- 统计 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="8"><a-card><a-statistic title="Banner 总数" :value="banners.length" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="已启用" :value="banners.filter(b => b.isActive).length" :value-style="{ color: '#27AE60' }" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="已停用" :value="banners.filter(b => !b.isActive).length" :value-style="{ color: '#999' }" /></a-card></a-col>
    </a-row>

    <!-- 列表 -->
    <a-card>
      <a-table :columns="columns" :data-source="sortedBanners" :loading="loading" size="small" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'preview'">
            <div class="banner-preview" :style="previewStyle(record)">
              <span class="preview-title">{{ record.title }}</span>
              <span class="preview-desc">{{ record.subtitle }}</span>
            </div>
          </template>
          <template v-if="column.dataIndex === 'link'">
            <a-tag v-if="record.linkType === 'course'" color="blue">课程 · {{ record.linkValue }}</a-tag>
            <span v-else style="color: #999;">无跳转</span>
          </template>
          <template v-if="column.dataIndex === 'isActive'">
            <a-tag :color="record.isActive ? 'green' : 'default'">{{ record.isActive ? '已启用' : '已停用' }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-space>
              <a @click="openEdit(record)">编辑</a>
              <a v-if="!record.isActive" style="color: #27AE60;" @click="toggleStatus(record)">启用</a>
              <a v-else style="color: #F39C12;" @click="toggleStatus(record)">停用</a>
              <a-popconfirm title="确定删除该 Banner？" @confirm="removeBanner(record)">
                <a style="color: #C0392B;">删除</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新增/编辑抽屉 -->
    <a-drawer v-model:open="drawerVisible" :title="isEdit ? '编辑 Banner' : '新增 Banner'" width="560" placement="right">
      <a-form layout="vertical">
        <a-form-item label="标题" required>
          <a-input v-model:value="form.title" placeholder="如：夏日疗愈季" />
        </a-form-item>
        <a-form-item label="副标题 / 描述">
          <a-textarea v-model:value="form.subtitle" :rows="2" placeholder="如：正念 · 声疗 · 舞动 三大主题课程上新" />
        </a-form-item>

        <a-divider orientation="left">展示样式</a-divider>
        <a-form-item label="背景渐变色（CSS）">
          <a-input v-model:value="form.bg" placeholder="linear-gradient(135deg, #6B463C, #A07060)" />
          <div style="margin-top: 8px;">
            <a-space wrap>
              <a-tag v-for="p in presetGradients" :key="p" style="cursor: pointer;" @click="form.bg = p">选用</a-tag>
            </a-space>
          </div>
        </a-form-item>
        <a-form-item label="背景图（支持本地上传，优先于渐变色）">
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <div v-if="form.imageUrl" class="banner-img-preview">
              <img :src="form.imageUrl" alt="" />
              <span class="banner-img-remove" @click="form.imageUrl = ''">✕</span>
            </div>
            <div style="flex: 1;">
              <a-upload :show-upload-list="false" :before-upload="onImageUpload" accept="image/*">
                <a-button :loading="uploading">{{ form.imageUrl ? '重新上传' : '本地上传' }}</a-button>
              </a-upload>
              <a-input v-model:value="form.imageUrl" placeholder="或直接粘贴图片 URL" style="margin-top: 8px;" />
            </div>
          </div>
        </a-form-item>

        <!-- 预览 -->
        <a-form-item label="预览">
          <div class="banner-preview large" :style="previewStyle(form)">
            <span class="preview-title">{{ form.title || '标题' }}</span>
            <span class="preview-desc">{{ form.subtitle || '副标题描述' }}</span>
          </div>
        </a-form-item>

        <a-divider orientation="left">跳转与排序</a-divider>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="跳转类型">
              <a-select v-model:value="form.linkType">
                <a-select-option value="none">无跳转</a-select-option>
                <a-select-option value="course">课程详情</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="课程 ID" v-if="form.linkType === 'course'">
              <a-input v-model:value="form.linkValue" placeholder="课程 id" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="排序（越小越靠前）">
              <a-input-number v-model:value="form.sortOrder" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="状态">
              <a-select v-model:value="form.isActive">
                <a-select-option :value="true">启用</a-select-option>
                <a-select-option :value="false">停用</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-button type="primary" block :loading="saving" @click="saveBanner">{{ isEdit ? '保存修改' : '确认新增' }}</a-button>
      </a-form>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { adminListBanners, createBanner, updateBanner, setBannerStatus, deleteBanner } from '@/api/banner'
import { uploadFile } from '@/api/upload'

const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)

/** 本地上传 Banner 背景图，成功后回填 imageUrl */
async function onImageUpload(file: File) {
  uploading.value = true
  try {
    const res = await uploadFile(file, 'banner')
    form.value.imageUrl = res.url
    message.success('图片上传成功')
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    uploading.value = false
  }
  return false
}

const presetGradients = [
  'linear-gradient(135deg, #6B463C, #A07060)',
  'linear-gradient(135deg, #4A6741, #7BAF72)',
  'linear-gradient(135deg, #5C4B8A, #9B7FCF)',
  'linear-gradient(135deg, #C0392B, #E8836B)',
]

const columns = [
  { title: '预览', dataIndex: 'preview', width: 240 },
  { title: '跳转', dataIndex: 'link', width: 160 },
  { title: '排序', dataIndex: 'sortOrder', width: 70 },
  { title: '状态', dataIndex: 'isActive', width: 90 },
  { title: '操作', dataIndex: 'action', width: 160 },
]

const banners = ref<any[]>([])

const sortedBanners = computed(() =>
  [...banners.value].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
)

function previewStyle(record: any) {
  if (record?.imageUrl) {
    return { backgroundImage: `url(${record.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return { background: record?.bg || 'linear-gradient(135deg, #6B463C, #A07060)' }
}

async function loadBanners() {
  loading.value = true
  try {
    const res = await adminListBanners()
    banners.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false
  }
}

const drawerVisible = ref(false)
const isEdit = ref(false)
const editingId = ref('')
const form = ref(emptyForm())

function emptyForm() {
  return {
    title: '',
    subtitle: '',
    bg: 'linear-gradient(135deg, #6B463C, #A07060)',
    imageUrl: '',
    linkType: 'none',
    linkValue: '',
    sortOrder: 0,
    isActive: true,
  }
}

function openAdd() {
  isEdit.value = false
  form.value = emptyForm()
  drawerVisible.value = true
}

function openEdit(record: any) {
  isEdit.value = true
  editingId.value = record.id
  form.value = {
    title: record.title,
    subtitle: record.subtitle || '',
    bg: record.bg || '',
    imageUrl: record.imageUrl || '',
    linkType: record.linkType || 'none',
    linkValue: record.linkValue || '',
    sortOrder: record.sortOrder ?? 0,
    isActive: record.isActive,
  }
  drawerVisible.value = true
}

async function saveBanner() {
  if (!form.value.title) {
    message.warning('标题为必填')
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      await updateBanner(editingId.value, form.value)
      message.success('Banner 已更新')
    } else {
      await createBanner(form.value)
      message.success('Banner 新增成功')
    }
    drawerVisible.value = false
    loadBanners()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    saving.value = false
  }
}

async function toggleStatus(record: any) {
  try {
    await setBannerStatus(record.id, !record.isActive)
    message.success(!record.isActive ? `${record.title} 已启用` : `${record.title} 已停用`)
    loadBanners()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

async function removeBanner(record: any) {
  try {
    await deleteBanner(record.id)
    message.success('已删除')
    loadBanners()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

onMounted(() => {
  loadBanners()
})
</script>

<style scoped>
.banner-preview {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 220px;
  height: 60px;
  padding: 8px 14px;
  border-radius: 8px;
  color: #fff;
  overflow: hidden;
}
.banner-preview.large {
  width: 100%;
  height: 120px;
  padding: 16px 20px;
}
.preview-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.banner-preview.large .preview-title {
  font-size: 20px;
}
.preview-desc {
  font-size: 12px;
  opacity: 0.9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.banner-preview.large .preview-desc {
  font-size: 14px;
}
.banner-img-preview {
  position: relative;
  width: 160px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}
.banner-img-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.banner-img-remove {
  position: absolute;
  top: 2px;
  right: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
</style>
