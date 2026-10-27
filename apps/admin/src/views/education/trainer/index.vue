<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">导师管理</h2>
      <a-space>
        <a-input-search v-model:value="keyword" placeholder="搜索导师姓名/擅长课程" style="width: 220px" allow-clear @search="loadTrainers" />
        <a-select v-model:value="filterLevel" style="width: 140px" placeholder="全部等级" @change="loadTrainers">
          <a-select-option value="">全部等级</a-select-option>
          <a-select-option v-for="lv in levelOptions" :key="lv.value" :value="lv.value">{{ lv.label }}</a-select-option>
        </a-select>
        <a-select v-model:value="filterStatus" style="width: 120px" placeholder="全部状态" @change="loadTrainers">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option value="ACTIVE">在职</a-select-option>
          <a-select-option value="RESIGNED">离职</a-select-option>
        </a-select>
        <a-button v-perm="'trainer:create'" type="primary" @click="openAddTrainer">+ 添加导师</a-button>
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
                    <a-tag v-if="trainer.seedifyCert" color="green" style="margin-left: 8px;">Full愈认证</a-tag>
                    <a-tag :color="levelColors[trainer.level]" style="margin-left: 4px;">LV{{ trainer.level }}</a-tag>
                  </div>
                  <a-tag :color="trainer.status === 'ACTIVE' ? 'green' : 'red'">{{ trainer.status === 'ACTIVE' ? '在职' : '离职' }}</a-tag>
                </div>
                <div style="color: #7D665C; font-size: 13px; margin: 4px 0;">{{ trainer.user?.nickname || '—' }} · {{ trainer.user?.phone || '—' }}</div>
                <div style="display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap;">
                  <a-tag v-for="s in (trainer.specialties || []).slice(0, 3)" :key="s" size="small" color="blue">{{ s }}</a-tag>
                  <span v-if="(trainer.specialties || []).length > 3" style="font-size: 12px; color: #999;">+{{ trainer.specialties.length - 3 }}</span>
                </div>
                <div style="display: flex; gap: 24px; margin-top: 8px; color: #999; font-size: 12px;">
                  <span>积分 {{ trainer.seedsBalance }}</span>
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
                <a-col :span="12">
                  <a-form-item label="状态">
                    <a-select v-model:value="editForm.status">
                      <a-select-option value="ACTIVE">在职</a-select-option>
                      <a-select-option value="RESIGNED">离职</a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="Full愈认证">
                    <a-switch v-model:checked="editForm.seedifyCert" checked-children="已认证" un-checked-children="未认证" />
                  </a-form-item>
                </a-col>
              </a-row>
              <a-form-item label="擅长课程（可多个，回车添加）">
                <a-select v-model:value="editForm.specialties" mode="tags" placeholder="输入擅长课程后回车" style="width: 100%" />
              </a-form-item>
              <a-form-item label="个人简介">
                <a-textarea v-model:value="editForm.bio" placeholder="导师简介，将展示在小程序导师页面" :rows="3" />
              </a-form-item>
              <a-form-item label="头衔标签">
                <a-input v-model:value="editForm.certBadge" placeholder="如：资深导师 / 教培总监（展示在导师名称旁）" />
              </a-form-item>
              <a-form-item label="时薪（由等级配置决定，不可修改）">
                <a-input-number :value="getLevelRate(editForm.level)" disabled style="width: 100%" :formatter="(v: any) => `¥ ${v}`" />
              </a-form-item>
              <a-form-item label="关联用户">
                <a-input :value="currentTrainer.user?.nickname + ' / ' + currentTrainer.user?.phone" disabled />
              </a-form-item>
              <a-button type="primary" :loading="saving" @click="saveTrainerEdit">保存修改</a-button>
            </a-form>
          </a-tab-pane>
          <a-tab-pane key="seeds" tab="积分记录">
            <a-row :gutter="16" style="margin-bottom: 16px;">
              <a-col :span="12"><a-card size="small"><a-statistic title="当前积分余额" :value="currentTrainer.seedsBalance" suffix="分" /></a-card></a-col>
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
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="Full愈认证">
              <a-switch v-model:checked="addForm.seedifyCert" checked-children="已认证" un-checked-children="未认证" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="时薪（自动取等级配置）">
              <a-input-number :value="getLevelRate(addForm.level)" disabled style="width: 100%" :formatter="(v: any) => `¥ ${v}`" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="擅长课程（可多个，回车添加）">
          <a-select v-model:value="addForm.specialties" mode="tags" placeholder="输入擅长课程后回车" style="width: 100%" />
        </a-form-item>
        <a-form-item label="个人简介">
          <a-textarea v-model:value="addForm.bio" placeholder="导师简介" :rows="3" />
        </a-form-item>
        <a-form-item label="头衔标签">
          <a-input v-model:value="addForm.certBadge" placeholder="如：资深导师 / 教培总监" />
        </a-form-item>
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
import { listTrainers, getTrainer, createTrainer, updateTrainer, adjustTrainerSeeds } from '@/api/trainer'
import { listTrainerLevels } from '@/api/trainerLevel'

// 导师等级来自后端 trainer-levels 接口
const rawLevels = ref<any[]>([])
const levelOptions = computed(() =>
  rawLevels.value.map((lv: any) => ({ value: String(lv.level), label: lv.name, hourlyRate: Number(lv.hourlyRate) })),
)

/** 根据等级获取对应时薪 */
function getLevelRate(level: number) {
  const found = rawLevels.value.find((lv: any) => Number(lv.level) === Number(level))
  return found ? Number(found.hourlyRate) : 0
}

const keyword = ref('')
const filterLevel = ref('')
const filterStatus = ref('')
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
const addForm = ref({ userId: '', displayName: '', level: 1, seedifyCert: false, specialties: [] as string[], avatar: '', bio: '', certBadge: '' })
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
    if (filterStatus.value) params.status = filterStatus.value
    const data: any = await listTrainers(params)
    trainers.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    message.error(e?.message || '加载导师列表失败')
  } finally {
    loading.value = false
  }
}

/** 读取上传图片：校验类型/大小 → 压缩到 ≤512px → 写入对应表单头像（base64） */
function beforeAvatarUpload(file: File, target: 'edit' | 'add') {
  if (!file.type.startsWith('image/')) {
    message.error('请上传图片文件')
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    message.error('图片过大，请选择 10MB 以内的图片')
    return false
  }
  const reader = new FileReader()
  reader.onload = e => {
    const src = e.target?.result as string
    const img = new Image()
    img.onload = () => {
      const MAX = 512
      let { width, height } = img
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      let out = src
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height)
        out = canvas.toDataURL('image/jpeg', 0.85)
      }
      if (target === 'edit') editForm.value.avatar = out
      else addForm.value.avatar = out
    }
    img.onerror = () => {
      if (target === 'edit') editForm.value.avatar = src
      else addForm.value.avatar = src
    }
    img.src = src
  }
  reader.readAsDataURL(file)
  return false
}

async function openDetail(trainer: any) {
  detailTab.value = 'info'
  detailVisible.value = true
  editForm.value = {
    displayName: trainer.displayName,
    level: trainer.level,
    status: trainer.status || 'ACTIVE',
    seedifyCert: trainer.seedifyCert || false,
    specialties: trainer.specialties || [],
    avatar: trainer.avatar,
    bio: trainer.bio || '',
    certBadge: trainer.certBadge || '',
  }
  seedsForm.value = { amount: null, reason: '' }
  currentTrainer.value = trainer
  try {
    const detail: any = await getTrainer(trainer.id)
    currentTrainer.value = detail
    editForm.value = {
      displayName: detail.displayName,
      level: detail.level,
      status: detail.status || 'ACTIVE',
      seedifyCert: detail.seedifyCert || false,
      specialties: detail.specialties || [],
      avatar: detail.avatar,
      bio: detail.bio || '',
      certBadge: detail.certBadge || '',
    }
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
      status: editForm.value.status,
      seedifyCert: editForm.value.seedifyCert,
      specialties: editForm.value.specialties,
      avatar: editForm.value.avatar,
      bio: editForm.value.bio,
      certBadge: editForm.value.certBadge,
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
    message.success('积分已调整')
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
  addForm.value = { userId: '', displayName: '', level: 1, seedifyCert: false, specialties: [], avatar: '', bio: '', certBadge: '' }
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
      seedifyCert: addForm.value.seedifyCert,
      specialties: addForm.value.specialties,
      avatar: addForm.value.avatar,
      bio: addForm.value.bio,
      certBadge: addForm.value.certBadge,
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

async function loadLevels() {
  try {
    const data: any = await listTrainerLevels()
    rawLevels.value = Array.isArray(data) ? data : []
  } catch (e) {
    rawLevels.value = []
  }
}

onMounted(() => {
  loadLevels()
  loadTrainers()
})
</script>
