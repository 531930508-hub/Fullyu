<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">会员卡商品</h2>
      <a-space>
        <a-select v-model:value="filterStatus" style="width: 120px">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option value="ON_SHELF">已上架</a-select-option>
          <a-select-option value="OFF_SHELF">已下架</a-select-option>
        </a-select>
        <a-button v-perm="'membercard:create'" type="primary" @click="openAdd">+ 发布商品</a-button>
      </a-space>
    </div>

    <!-- 统计 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="8"><a-card><a-statistic title="商品总数" :value="products.length" :value-style="{ color: '#6B463C' }" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="已上架" :value="products.filter(p => p.status === 'ON_SHELF').length" :value-style="{ color: '#27AE60' }" /></a-card></a-col>
      <a-col :span="8"><a-card><a-statistic title="已下架" :value="products.filter(p => p.status === 'OFF_SHELF').length" :value-style="{ color: '#999' }" /></a-card></a-col>
    </a-row>

    <!-- 列表 -->
    <a-card>
      <a-table :columns="columns" :data-source="filteredProducts" :loading="loading" size="small" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'name'">
            <div style="font-weight: 500; color: #4B3621;">{{ record.name }}</div>
            <div style="font-size: 12px; color: #999;">{{ record.description }}</div>
          </template>
          <template v-if="column.dataIndex === 'type'">
            <a-tag :color="memberCardTypeColor(record.type)">{{ memberCardTypeLabel(record.type) }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'price'">
            <span style="color: #C0392B; font-weight: 600;">¥{{ Number(record.price) }}</span>
          </template>
          <template v-if="column.dataIndex === 'durationDays'">
            {{ record.durationDays }} 天
          </template>
          <template v-if="column.dataIndex === 'benefits'">
            <a-tag v-for="b in record.benefits" :key="b" style="margin-bottom: 4px;">{{ b }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'status'">
            <a-tag :color="memberCardProductStatusColor(record.status)">{{ memberCardProductStatusLabel(record.status) }}</a-tag>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-space>
              <a v-perm="'membercard:update'" @click="openEdit(record)">编辑</a>
              <a v-perm="'membercard:update'" v-if="record.status === 'OFF_SHELF'" style="color: #27AE60;" @click="toggleShelf(record)">上架</a>
              <a-popconfirm v-perm="'membercard:update'" v-else title="确定下架该商品？下架后用户将无法购买" @confirm="toggleShelf(record)">
                <a style="color: #F39C12;">下架</a>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 发布/编辑抽屉 -->
    <a-drawer v-model:open="drawerVisible" :title="isEdit ? '编辑会员卡商品' : '发布会员卡商品'" width="600" placement="right">
      <a-form layout="vertical">
        <a-divider orientation="left">基本信息</a-divider>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="卡类型" required>
              <a-select v-model:value="form.type" placeholder="请选择">
                <a-select-option v-for="t in cardTypeOptions" :key="t.value" :value="t.value">{{ t.label }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="商品名称" required>
              <a-input v-model:value="form.name" placeholder="如：年卡会员" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="售价（元）" required>
              <a-input-number v-model:value="form.price" :min="0" :precision="2" style="width: 100%" placeholder="如 1980" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="有效期（天）" required>
              <a-input-number v-model:value="form.durationDays" :min="1" style="width: 100%" placeholder="如 365" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="商品描述">
          <a-textarea v-model:value="form.description" :rows="2" placeholder="一句话卖点说明" />
        </a-form-item>

        <a-divider orientation="left">权益配置</a-divider>
        <a-form-item label="会员权益（每行一条）">
          <a-textarea v-model:value="benefitsText" :rows="4" placeholder="全课程 8 折优惠&#10;优先候补席位&#10;专属会员活动" />
        </a-form-item>

        <a-divider orientation="left">上架设置</a-divider>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="排序（越小越靠前）">
              <a-input-number v-model:value="form.sort" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="上架状态">
              <a-select v-model:value="form.status">
                <a-select-option value="ON_SHELF">上架</a-select-option>
                <a-select-option value="OFF_SHELF">下架</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-button type="primary" block :loading="saving" @click="saveProduct">{{ isEdit ? '保存修改' : '确认发布' }}</a-button>
      </a-form>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { useDictStore } from '@/stores/dict'
import { memberCardProductStatusColor, memberCardProductStatusLabel, memberCardTypeColor, memberCardTypeLabel } from '@fullyu/shared'
import { adminListProducts, createProduct, updateProduct, setProductStatus } from '@/api/member'

const dictStore = useDictStore()
const cardTypeOptions = computed(() => dictStore.getItems('member_card_type'))

const loading = ref(false)
const saving = ref(false)
const filterStatus = ref('')

const columns = [
  { title: '商品', dataIndex: 'name', width: 220 },
  { title: '卡类型', dataIndex: 'type', width: 90 },
  { title: '售价', dataIndex: 'price', width: 100 },
  { title: '有效期', dataIndex: 'durationDays', width: 90 },
  { title: '权益', dataIndex: 'benefits' },
  { title: '排序', dataIndex: 'sort', width: 70 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '操作', dataIndex: 'action', width: 140 },
]

const products = ref<any[]>([])

const filteredProducts = computed(() => {
  return products.value
    .filter(p => !filterStatus.value || p.status === filterStatus.value)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
})

async function loadProducts() {
  loading.value = true
  try {
    const res = await adminListProducts()
    products.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loading.value = false
  }
}

// 发布/编辑
const drawerVisible = ref(false)
const isEdit = ref(false)
const editingId = ref('')
const form = ref(emptyForm())
const benefitsText = ref('')

function emptyForm() {
  return { type: 'MONTHLY', name: '', price: null as any, durationDays: null as any, description: '', sort: 0, status: 'ON_SHELF' }
}

function openAdd() {
  isEdit.value = false
  form.value = emptyForm()
  benefitsText.value = ''
  drawerVisible.value = true
}

function openEdit(record: any) {
  isEdit.value = true
  editingId.value = record.id
  form.value = {
    type: record.type,
    name: record.name,
    price: Number(record.price),
    durationDays: record.durationDays,
    description: record.description || '',
    sort: record.sort ?? 0,
    status: record.status,
  }
  benefitsText.value = (record.benefits || []).join('\n')
  drawerVisible.value = true
}

async function saveProduct() {
  if (!form.value.type || !form.value.name || form.value.price == null || form.value.durationDays == null) {
    message.warning('卡类型、名称、售价、有效期为必填')
    return
  }
  const benefits = benefitsText.value.split('\n').map(s => s.trim()).filter(Boolean)
  const payload = { ...form.value, benefits }
  saving.value = true
  try {
    if (isEdit.value) {
      await updateProduct(editingId.value, payload)
      message.success('商品已更新')
    } else {
      await createProduct(payload)
      message.success('商品发布成功')
    }
    drawerVisible.value = false
    loadProducts()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    saving.value = false
  }
}

async function toggleShelf(record: any) {
  const next = record.status === 'ON_SHELF' ? 'OFF_SHELF' : 'ON_SHELF'
  try {
    await setProductStatus(record.id, next)
    message.success(next === 'ON_SHELF' ? `${record.name} 已上架` : `${record.name} 已下架`)
    loadProducts()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

onMounted(() => {
  dictStore.load()
  loadProducts()
})
</script>
