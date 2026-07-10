<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">物料管理</h2>
      <a-space>
        <a-button type="primary" @click="openCreate">添加物料</a-button>
      </a-space>
    </div>

    <!-- 库存预警（库存 ≤ 5 视为偏低） -->
    <a-alert v-if="lowStockItems.length > 0" type="warning" show-icon style="margin-bottom: 24px">
      <template #message>
        库存预警：{{ lowStockItems.map(i => i.name).join('、') }} 库存偏低，请及时补货
      </template>
    </a-alert>

    <a-card>
      <a-table :columns="columns" :data-source="materials" row-key="id" :loading="loading">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'quantity'">
            <span :style="{ color: record.quantity <= 5 ? '#C0392B' : '#4B3621', fontWeight: 500 }">
              {{ record.quantity }}
            </span>
          </template>
          <template v-if="column.dataIndex === 'unitPrice'">
            ¥{{ Number(record.unitPrice).toFixed(2) }}
          </template>
          <template v-if="column.dataIndex === 'seedsCost'">
            <span style="color: #F39C12;">{{ record.seedsCost }} Seeds</span>
          </template>
          <template v-if="column.dataIndex === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
              <a-popconfirm title="确定删除该物料？" @confirm="handleRemove(record)">
                <a-button type="link" size="small" danger>删除</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 添加/编辑物料弹窗 -->
    <a-modal v-model:open="modalVisible" :title="isEditing ? '编辑物料' : '添加物料'" @ok="handleSave" :confirm-loading="saving">
      <a-form layout="vertical">
        <a-form-item label="物料名称"><a-input v-model:value="form.name" placeholder="输入名称" /></a-form-item>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="库存数量"><a-input-number v-model:value="form.quantity" :min="0" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="单价（元）"><a-input-number v-model:value="form.unitPrice" :min="0" :precision="2" style="width: 100%" /></a-form-item></a-col>
        </a-row>
        <a-form-item label="所需 Seeds"><a-input-number v-model:value="form.seedsCost" :min="0" style="width: 100%" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { listMaterials, createMaterial, updateMaterial, removeMaterial } from '@/api/material'

const loading = ref(false)
const saving = ref(false)
const materials = ref<any[]>([])

const columns = [
  { title: '物料名称', dataIndex: 'name' },
  { title: '库存数量', dataIndex: 'quantity', width: 120 },
  { title: '单价', dataIndex: 'unitPrice', width: 120 },
  { title: '所需 Seeds', dataIndex: 'seedsCost', width: 120 },
  { title: '操作', dataIndex: 'action', width: 160 },
]

const lowStockItems = computed(() => materials.value.filter(m => m.quantity <= 5))

async function loadMaterials() {
  loading.value = true
  try {
    const data: any = await listMaterials()
    materials.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    message.error(e?.message || '加载物料失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadMaterials)

// ===== 添加/编辑 =====
const modalVisible = ref(false)
const isEditing = ref(false)
const editingId = ref('')
const form = ref({ name: '', quantity: 0, unitPrice: 0, seedsCost: 0 })

function openCreate() {
  isEditing.value = false
  editingId.value = ''
  form.value = { name: '', quantity: 0, unitPrice: 0, seedsCost: 0 }
  modalVisible.value = true
}

function openEdit(record: any) {
  isEditing.value = true
  editingId.value = record.id
  form.value = {
    name: record.name,
    quantity: record.quantity,
    unitPrice: Number(record.unitPrice),
    seedsCost: record.seedsCost,
  }
  modalVisible.value = true
}

async function handleSave() {
  if (!form.value.name) { message.warning('请输入物料名称'); return }
  saving.value = true
  try {
    const payload = {
      name: form.value.name,
      quantity: form.value.quantity,
      unitPrice: form.value.unitPrice,
      seedsCost: form.value.seedsCost,
    }
    if (isEditing.value) {
      await updateMaterial(editingId.value, payload)
      message.success('物料更新成功')
    } else {
      await createMaterial(payload)
      message.success('物料添加成功')
    }
    modalVisible.value = false
    loadMaterials()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleRemove(record: any) {
  try {
    await removeMaterial(record.id)
    message.success('物料已删除')
    loadMaterials()
  } catch (e: any) {
    message.error(e?.message || '删除失败')
  }
}
</script>
