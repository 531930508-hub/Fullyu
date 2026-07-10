<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">导师管理</h2>
      <a-space>
        <a-input-search v-model:value="keyword" placeholder="搜索导师昵称/手机号" style="width: 220px" allow-clear @search="loadTrainers" />
        <a-select v-model:value="filterLevel" style="width: 140px" placeholder="全部等级" @change="loadTrainers">
          <a-select-option value="">全部等级</a-select-option>
          <a-select-option v-for="lv in levelOptions" :key="lv.value" :value="lv.value">{{ lv.label }}</a-select-option>
        </a-select>
        <a-button type="primary" @click="openAddTrainer">+ 添加导师</a-button>
      </a-space>
    </div>

    <!-- 导师卡片 -->
    <a-spin :spinning="loading">
      <a-empty v-if="!trainers.length && !loading" description="暂无导师数据" />
      <a-row :gutter="[24, 24]">
        <a-col :span="8" v-for="trainer in trainers" :key="trainer.id">
          <a-card hoverable @click="openDetail(trainer)">
            <div style="display: flex; gap: 16px;">
              <a-avatar :size="56" :src="trainer.avatar || trainer.user?.avatar" :style="{ backgroundColor: '#6B463C', fontSize: '20px' }">{{ (trainer.displayName || '?').charAt(0) }}</a-avatar>
              <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="font-size: 16px; font-weight: 600; color: #4B3621;">{{ trainer.displayName }}</span>
                    <a-tag :color="levelColors[trainer.level]" style="margin-left: 8px;">LV{{ trainer.level }}</a-tag>
                  </div>
                  <a-tag :color="trainer.isVerified ? 'green' : 'default'">{{ trainer.isVerified ? '已认证' : '未认证' }}</a-tag>
                </div>
                <div style="color: #7D665C; font-size: 13px; margin: 4px 0;">{{ trainer.user?.nickname || '—' }} · {{ trainer.user?.phone || '—' }}</div>
                <div style="display: flex; gap: 24px; margin-top: 12px; color: #999; font-size: 12px;">
                  <span>Seeds {{ trainer.seedsBalance }}</span>
                  <span>时薪 ¥{{ trainer.hourlyRate }}</span>
                </div>
              </div>
            </div>
          </a-card>
        </a-col>
      </a-row>
    </a-spin>

    <!-- 导师详情/编辑抽屉 -->
    <a-drawer v-model:open="detailVisible" :title="currentTrainer?.displayName" width="640" placement="right">
      <template v-if="currentTrainer">
        <a-tabs v-model:activeKey="detailTab">
          <a-tab-pane key="info" tab="基本信息">
            <a-form layout="vertical">
              <a-form-item label="头像">
                <div style="display: flex; align-items: center; gap: 16px;">
                  <a-avatar :size="72" :src="editForm.avatar" :style="{ backgroundColor: '#6B463C', fontSize: '24px' }">{{ editForm.displayName?.charAt(0) }}</a-avatar>
                  <a-upload :show-upload-list="false" :before-upload="(f: File) => beforeAvatarUpload(f, 'edit')" accept="image/*">
                    <a-button>上传头像</a-button>
                  </a-upload>
                </div>
              </a-form-item>
              <a-row :gutter="16">
                <a-col :span="12"><a-form-item label="展示名称"><a-input v-model:value="editForm.displayName" /></a-form-item></a-col>
                <a-col :span="12">
                  <a-form-item label="等级">
                    <a-select v-model:value="editForm.level">
                      <a-select-option v-for="lv in levelOptions" :key="lv.value" :value="Number(lv.value)">{{ lv.label }}</a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="16">
                <a-col :span="12"><a-form-item label="时薪（元）"><a-input-number v-model:value="editForm.hourlyRate" :min="0" style="width: 100%" /></a-form-item></a-col>
                <a-col :span="12"><a-form-item label="关联用户"><a-input :value="currentTrainer.user?.nickname + ' / ' + currentTrainer.user?.phone" disabled /></a-form-item></a-col>
              </a-row>
              <a-button type="primary" :loading="saving" @click="saveTrainerEdit">保存修改</a-button>
            </a-form>
          </a-tab-pane>
          <a-tab-pane key="seeds" tab="Seeds 记录">
            <a-row :gutter="16" style="margin-bottom: 16px;">
              <a-col :span="12"><a-card size="small"><a-statistic title="当前 Seeds 余额" :value="currentTrainer.seedsBalance" suffix="粒" /></a-card></a-col>
            </a-row>
            <a-form layout="inline" style="margin-bottom: 16px;">
              <a-form-item label="调整数量">
                <a-input-number v-model:value="seedsForm.amount" placeholder="正数增加/负数扣减" style="width: 160px" />
              </a-form-item>
              <a-form-item label="原因">
                <a-input v-model:value="seedsForm.reason" placeholder="调整原因" style="width: 180px" />
              </a-form-item>
              <a-form-item>
                <a-button type="primary" :loading="seedsSaving" @click="submitSeeds">提交</a-button>
              </a-form-item>
            </a-form>
            <a-table :columns="seedsColumns" :data-source="currentTrainer.seedsRecords || []" size="small" :pagination="false" row-key="createdAt">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'amount'">
                  <span :style="{ color: record.amount >= 0 ? '#27AE60' : '#C0392B' }">{{ record.amount >= 0 ? '+' : '' }}{{ record.amount }}</span>
                </template>
                <template v-if="column.dataIndex === 'createdAt'">{{ formatTime(record.createdAt) }}</template>
              </template>
            </a-table>
          </a-tab-pane>
        </a-tabs>
      </template>
    </a-drawer>

    <!-- 添加导师弹窗 -->
    <a-modal v-model:open="showAddModal" title="添加导师" width="560px" :confirm-loading="adding" @ok="addTrainer">
      <a-form layout="vertical">
        <a-form-item label="关联用户 ID" required>
          <a-input v-model:value="addForm.userId" placeholder="输入已注册用户的 userId" />
          <div style="font-size: 12px; color: #999; margin-top: 4px;">导师需绑定一个已注册用户账号</div>
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="展示名称" required><a-input v-model:value="addForm.displayName" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="等级">
              <a-select v-model:value="addForm.level">
                <a-select-option v-for="lv in levelOptions" :key="lv.value" :value="Number(lv.value)">{{ lv.label }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="时薪（元）"><a-input-number v-model:value="addForm.hourlyRate" :min="0" style="width: 100%" /></a-form-item>
        <a-form-item label="头像">
          <div style="display: flex; align-items: center; gap: 16px;">
            <a-avatar :size="64" :src="addForm.avatar" :style="{ backgroundColor: '#6B463C', fontSize: '22px' }">{{ addForm.displayName?.charAt(0) || '?' }}</a-avatar>
            <a-upload :show-upload-list="false" :before-upload="(f: File) => beforeAvatarUpload(f, 'add')" accept="image/*">
              <a-button>上传头像</a-button>
            </a-upload>
          </div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { useDictStore } from '@/stores/dict'
import { listTrainers, getTrainer, createTrainer, updateTrainer, adjustTrainerSeeds } from '@/api/trainer'

const dictStore = useDictStore()
const levelOptions = computed(() => dictStore.getItems('trainer_level'))

const keyword = ref('')
const filterLevel = ref('')
const loading = ref(false)
const trainers = ref<any[]>([])

const detailVisible = ref(false)
const detailTab = ref('info')
const currentTrainer = ref<any>(null)
const showAddModal = ref(false)
const saving = ref(false)
const adding = ref(false)
const seedsSaving = ref(false)

const levelColors: Record<number, string> = { 1: 'default', 2: 'blue', 3: 'purple', 4: 'gold', 5: 'red' }

const editForm = ref<any>({})
const addForm = ref({ userId: '', displayName: '', level: 1, hourlyRate: 0, avatar: '' })
const seedsForm = ref({ amount: null as number | null, reason: '' })

const seedsColumns = [
  { title: '时间', dataIndex: 'createdAt', width: 160 },
  { title: '变动', dataIndex: 'amount', width: 100 },
  { title: '余额', dataIndex: 'balance', width: 100 },
  { title: '类型', dataIndex: 'type', width: 100 },
  { title: '原因', dataIndex: 'reason' },
]

function formatTime(t: string) {
  if (!t) return '—'
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

async function loadTrainers() {
  loading.value = true
  try {
    const params: any = {}
    if (keyword.value) params.keyword = keyword.value
    if (filterLevel.value) params.level = Number(filterLevel.value)
    const data: any = await listTrainers(params)
    trainers.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    message.error(e?.message || '加载导师列表失败')
  } finally {
    loading.value = false
  }
}

/** 读取上传图片为 base64 并写入对应表单头像 */
function beforeAvatarUpload(file: File, target: 'edit' | 'add') {
  const reader = new FileReader()
  reader.onload = e => {
    const url = e.target?.result as string
    if (target === 'edit') editForm.value.avatar = url
    else addForm.value.avatar = url
  }
  reader.readAsDataURL(file)
  return false
}

async function openDetail(trainer: any) {
  detailTab.value = 'info'
  detailVisible.value = true
  editForm.value = { displayName: trainer.displayName, level: trainer.level, hourlyRate: trainer.hourlyRate, avatar: trainer.avatar }
  seedsForm.value = { amount: null, reason: '' }
  currentTrainer.value = trainer
  try {
    const detail: any = await getTrainer(trainer.id)
    currentTrainer.value = detail
    editForm.value = { displayName: detail.displayName, level: detail.level, hourlyRate: detail.hourlyRate, avatar: detail.avatar }
  } catch (e: any) {
    message.error(e?.message || '加载导师详情失败')
  }
}

async function saveTrainerEdit() {
  if (!currentTrainer.value) return
  saving.value = true
  try {
    await updateTrainer(currentTrainer.value.id, {
      displayName: editForm.value.displayName,
      level: editForm.value.level,
      hourlyRate: editForm.value.hourlyRate,
      avatar: editForm.value.avatar,
    })
    message.success('导师信息已更新')
    detailVisible.value = false
    loadTrainers()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function submitSeeds() {
  if (!currentTrainer.value) return
  if (!seedsForm.value.amount) { message.warning('请输入调整数量'); return }
  if (!seedsForm.value.reason) { message.warning('请填写调整原因'); return }
  seedsSaving.value = true
  try {
    await adjustTrainerSeeds(currentTrainer.value.id, seedsForm.value.amount, seedsForm.value.reason)
    message.success('Seeds 已调整')
    const detail: any = await getTrainer(currentTrainer.value.id)
    currentTrainer.value = detail
    seedsForm.value = { amount: null, reason: '' }
  } catch (e: any) {
    message.error(e?.message || '调整失败')
  } finally {
    seedsSaving.value = false
  }
}

function openAddTrainer() {
  addForm.value = { userId: '', displayName: '', level: 1, hourlyRate: 0, avatar: '' }
  showAddModal.value = true
}

async function addTrainer() {
  if (!addForm.value.userId) { message.warning('请填写关联用户 ID'); return }
  if (!addForm.value.displayName) { message.warning('请填写展示名称'); return }
  adding.value = true
  try {
    await createTrainer({
      userId: addForm.value.userId,
      displayName: addForm.value.displayName,
      level: addForm.value.level,
      hourlyRate: addForm.value.hourlyRate,
      avatar: addForm.value.avatar,
    })
    message.success('导师添加成功')
    showAddModal.value = false
    loadTrainers()
  } catch (e: any) {
    message.error(e?.message || '添加失败')
  } finally {
    adding.value = false
  }
}

onMounted(() => {
  dictStore.load()
  loadTrainers()
})
</script>
