<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h2 class="page-title">值集管理</h2>
      <a-space>
        <a-button type="primary" @click="openAddSet">+ 新增值集</a-button>
      </a-space>
    </div>

    <a-alert
      message="全系统涉及到的可选值列表（如导师标签、课程分类、性别、会员卡类型等）统一在此配置，无需修改代码。修改后即时生效。"
      type="info" show-icon style="margin-bottom: 16px" />

    <a-row :gutter="16">
      <!-- 左侧：值集列表 -->
      <a-col :span="7">
        <a-card size="small" title="值集列表" :bodyStyle="{ padding: '8px' }">
          <div
            v-for="d in dictStore.dicts"
            :key="d.code"
            class="dict-set-item"
            :class="{ active: currentCode === d.code }"
            @click="currentCode = d.code"
          >
            <div>
              <div class="set-name">{{ d.name }}</div>
              <div class="set-code">{{ d.code }}</div>
            </div>
            <a-tag v-if="d.system" color="blue" size="small">内置</a-tag>
            <a-tag v-else color="green" size="small">自定义</a-tag>
          </div>
        </a-card>
      </a-col>

      <!-- 右侧：值集明细 -->
      <a-col :span="17">
        <a-card v-if="currentSet" size="small">
          <template #title>
            <span>{{ currentSet.name }}</span>
            <span style="color: #999; font-size: 12px; margin-left: 8px;">{{ currentSet.desc }}</span>
          </template>
          <template #extra>
            <a-space>
              <a-button size="small" type="primary" @click="openAddItem">+ 添加选项</a-button>
              <a-popconfirm
                v-if="!currentSet.system"
                title="确定删除整个值集？" @confirm="deleteSet"
              >
                <a-button size="small" danger>删除值集</a-button>
              </a-popconfirm>
            </a-space>
          </template>

          <a-table :columns="itemColumns" :data-source="sortedItems" :pagination="false" size="small" row-key="value">
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'label'">
                <a-tag v-if="record.color" :color="record.color">{{ record.label }}</a-tag>
                <span v-else>{{ record.label }}</span>
              </template>
              <template v-if="column.dataIndex === 'enabled'">
                <a-switch :checked="record.enabled" size="small" @change="(v: boolean) => toggleItem(record, v)" />
              </template>
              <template v-if="column.dataIndex === 'action'">
                <a-space>
                  <a @click="openEditItem(record)">编辑</a>
                  <a-popconfirm title="确定删除该选项？" @confirm="deleteItem(record)">
                    <a style="color: #cf1322;">删除</a>
                  </a-popconfirm>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>

    <!-- 新增/编辑选项弹窗 -->
    <a-modal v-model:open="itemModalVisible" :title="editingItem ? '编辑选项' : '添加选项'" @ok="saveItem">
      <a-form layout="vertical">
        <a-form-item label="选项值（value，英文/编码，保存后不建议修改）" required>
          <a-input v-model:value="itemForm.value" :disabled="!!editingItem" placeholder="如 MALE" />
        </a-form-item>
        <a-form-item label="显示名称（label）" required>
          <a-input v-model:value="itemForm.label" placeholder="如 男" />
        </a-form-item>
        <a-form-item label="颜色标记（可选）">
          <a-select v-model:value="itemForm.color" allow-clear placeholder="用于标签颜色">
            <a-select-option v-for="c in colorOptions" :key="c" :value="c">
              <a-tag :color="c">{{ c }}</a-tag>
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model:value="itemForm.sort" :min="0" style="width: 120px" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新增值集弹窗 -->
    <a-modal v-model:open="setModalVisible" title="新增值集" @ok="saveSet">
      <a-form layout="vertical">
        <a-form-item label="值集编码（code，全局唯一）" required>
          <a-input v-model:value="setForm.code" placeholder="如 refund_reason" />
        </a-form-item>
        <a-form-item label="值集名称" required>
          <a-input v-model:value="setForm.name" placeholder="如 退款原因" />
        </a-form-item>
        <a-form-item label="说明">
          <a-input v-model:value="setForm.desc" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { useDictStore, type DictItem } from '@/stores/dict'
import { createDictSet, removeDictSet, saveDictItems } from '@/api/dict'

const dictStore = useDictStore()
const currentCode = ref('')

async function reload() {
  await dictStore.load(true)
  if (!currentCode.value || !dictStore.getSet(currentCode.value)) {
    currentCode.value = dictStore.dicts[0]?.code || ''
  }
}
onMounted(reload)

const currentSet = computed(() => dictStore.getSet(currentCode.value))
const sortedItems = computed(() => currentSet.value ? [...currentSet.value.items].sort((a, b) => a.sort - b.sort) : [])

const colorOptions = ['default', 'blue', 'green', 'purple', 'gold', 'red', 'orange', 'cyan', 'magenta', 'volcano']

const itemColumns = [
  { title: '显示名称', dataIndex: 'label', width: 160 },
  { title: '选项值', dataIndex: 'value', width: 160 },
  { title: '排序', dataIndex: 'sort', width: 80 },
  { title: '启用', dataIndex: 'enabled', width: 80 },
  { title: '操作', dataIndex: 'action', width: 120 },
]

/** 将当前值集的全量选项保存到后端（覆盖式） */
async function persistItems(items: DictItem[]) {
  if (!currentSet.value?.id) return
  await saveDictItems(currentSet.value.id, items)
  await reload()
}

// ===== 选项增删改 =====
const itemModalVisible = ref(false)
const editingItem = ref<DictItem | null>(null)
const itemForm = ref<DictItem>({ value: '', label: '', color: undefined, enabled: true, sort: 1 })

function openAddItem() {
  editingItem.value = null
  const maxSort = Math.max(0, ...(currentSet.value?.items.map((i: DictItem) => i.sort) || [0]))
  itemForm.value = { value: '', label: '', color: undefined, enabled: true, sort: maxSort + 1 }
  itemModalVisible.value = true
}

function openEditItem(record: DictItem) {
  editingItem.value = record
  itemForm.value = { ...record }
  itemModalVisible.value = true
}

async function saveItem() {
  if (!currentSet.value) return
  if (!itemForm.value.value || !itemForm.value.label) {
    message.warning('请填写选项值和显示名称')
    return
  }
  const items = currentSet.value.items.map((i) => ({ ...i }))
  if (editingItem.value) {
    const idx = items.findIndex((i) => i.value === editingItem.value!.value)
    if (idx >= 0) items[idx] = { ...itemForm.value }
  } else {
    if (items.some((i) => i.value === itemForm.value.value)) {
      message.warning('该选项值已存在')
      return
    }
    items.push({ ...itemForm.value })
  }
  await persistItems(items)
  message.success('已保存')
  itemModalVisible.value = false
}

async function toggleItem(record: DictItem, v: boolean) {
  if (!currentSet.value) return
  const items = currentSet.value.items.map((i) => (i.value === record.value ? { ...i, enabled: v } : { ...i }))
  await persistItems(items)
}

async function deleteItem(record: DictItem) {
  if (!currentSet.value) return
  const items = currentSet.value.items.filter((i) => i.value !== record.value).map((i) => ({ ...i }))
  await persistItems(items)
  message.success('已删除')
}

// ===== 值集增删 =====
const setModalVisible = ref(false)
const setForm = ref({ code: '', name: '', desc: '' })

function openAddSet() {
  setForm.value = { code: '', name: '', desc: '' }
  setModalVisible.value = true
}

async function saveSet() {
  if (!setForm.value.code || !setForm.value.name) {
    message.warning('请填写编码和名称')
    return
  }
  if (dictStore.getSet(setForm.value.code)) {
    message.warning('该值集编码已存在')
    return
  }
  await createDictSet({ code: setForm.value.code, name: setForm.value.name, desc: setForm.value.desc })
  await dictStore.load(true)
  currentCode.value = setForm.value.code
  message.success('值集已创建')
  setModalVisible.value = false
}

async function deleteSet() {
  if (!currentSet.value || currentSet.value.system || !currentSet.value.id) return
  await removeDictSet(currentSet.value.id)
  await dictStore.load(true)
  currentCode.value = dictStore.dicts[0]?.code || ''
  message.success('值集已删除')
}
</script>

<style scoped>
.dict-set-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-radius: 6px; cursor: pointer; margin-bottom: 4px;
  border: 1px solid transparent;
}
.dict-set-item:hover { background: #f7f2ec; }
.dict-set-item.active { background: #f0e6dc; border-color: #6B463C; }
.set-name { font-size: 14px; color: #4B3621; font-weight: 500; }
.set-code { font-size: 12px; color: #999; }
</style>
