<template>
  <view class="page">
    <PortalNav :title="isEdit ? tr('编辑提案', 'Edit proposal') : tr('新建提案', 'New proposal')" :sub="stepSub" fallback="/pages/trainer-portal/proposals/index" />

    <view class="steps">
      <view v-for="(s, i) in PROPOSAL_STEPS" :key="s.key" class="step" :class="{ done: i < step, current: i === step }">
        <text class="step-dot latin">{{ i + 1 }}</text>
        <view class="step-line" :class="{ filled: i < step }"></view>
      </view>
    </view>

    <view v-if="loading" class="container">
      <PageState state="loading" :title="tr('正在载入提案', 'Loading proposal')" />
    </view>

    <view v-else class="container body">
      <!-- 1 基础信息 -->
      <view v-show="step === 0">
        <view class="card">
          <text class="block-title serif">{{ tr('课程名称', 'Class title') }}</text>
          <input v-model="form.title" class="field-input" maxlength="30" :placeholder="tr('例如：晨间舒展流 · 90 分钟入门', 'e.g. Morning flow · 90 min intro')" placeholder-class="ph" />
          <text class="counter latin">{{ form.title.length }} / 30</text>

          <text class="block-title spaced serif">{{ tr('封面图', 'Cover image') }}</text>
          <view class="cover-wrap" @tap="chooseCover">
            <image v-if="form.coverImage" :src="form.coverImage" mode="aspectFill" class="cover" />
            <view v-else class="cover cover-empty">
              <text class="cover-plus">＋</text>
              <text class="cover-hint">{{ tr('竖版或方形图，建议 3:4', 'Portrait or square, 3:4 works best') }}</text>
            </view>
            <text v-if="form.coverImage" class="cover-replace">{{ tr('更换封面', 'Change cover') }}</text>
          </view>

          <text class="block-title spaced serif">{{ tr('课程分类', 'Category') }}</text>
          <view class="chip-wrap">
            <view
              v-for="c in COURSE_CATEGORY_OPTIONS"
              :key="c"
              class="chip"
              :class="form.categories.includes(c) ? 'chip-on' : 'chip-off'"
              @tap="toggleIn(form.categories, c)"
            >{{ c }}</view>
          </view>

          <text class="block-title spaced serif">{{ tr('课程主题', 'Theme') }}</text>
          <view class="chip-wrap">
            <view
              v-for="t in COURSE_THEME_OPTIONS"
              :key="t"
              class="chip"
              :class="form.theme === t ? 'chip-on' : 'chip-off'"
              @tap="form.theme = form.theme === t ? '' : t"
            >{{ t }}</view>
          </view>
        </view>
      </view>

      <!-- 2 内容与形式 -->
      <view v-show="step === 1">
        <view class="card">
          <view class="two-col">
            <view class="col">
              <text class="block-title serif">{{ tr('单节时长', 'Session length') }}</text>
              <view class="unit-input">
                <input v-model="durationInput" class="field-input latin" type="number" maxlength="3" />
                <text class="unit">{{ tr('分钟', 'min') }}</text>
              </view>
            </view>
            <view class="col">
              <text class="block-title serif">{{ tr('课程节数', 'Sessions') }}</text>
              <view class="unit-input">
                <input v-model="sessionsInput" class="field-input latin" type="number" maxlength="2" />
                <text class="unit">{{ tr('节', 'x') }}</text>
              </view>
            </view>
          </view>
          <text class="hint">{{ tr('例如每周 1 节、共 4 节，可先按计划填写，教务排期时可调。', 'Plans can change when the team schedules.') }}</text>

          <text class="block-title spaced serif">{{ tr('适合人群', 'Who it is for') }}</text>
          <view class="chip-wrap">
            <view
              v-for="a in TARGET_AUDIENCE_OPTIONS"
              :key="a"
              class="chip"
              :class="form.targetAudience.includes(a) ? 'chip-on' : 'chip-off'"
              @tap="toggleIn(form.targetAudience, a)"
            >{{ a }}</view>
          </view>

          <text class="block-title spaced serif">{{ tr('课程介绍', 'Description') }}</text>
          <textarea v-model="form.description" class="field-textarea" maxlength="1000" :placeholder="tr('课程理念、每节安排、练习强度…至少 20 字', 'Philosophy, session flow, intensity… at least 20 characters')" placeholder-class="ph" />
          <text class="counter latin">{{ form.description.length }} / 1000</text>
        </view>
      </view>

      <!-- 3 收获与物料 -->
      <view v-show="step === 2">
        <view class="card">
          <text class="block-title serif">{{ tr('学员收获', 'What students take away') }}</text>
          <textarea v-model="form.goals" class="field-textarea small" maxlength="400" :placeholder="tr('结课后学员能带走什么？至少 10 个字', 'What will they leave with? At least 10 characters')" placeholder-class="ph" />

          <text class="block-title spaced serif">{{ tr('对学员的要求', 'Requirements') }}</text>
          <textarea v-model="form.requirements" class="field-textarea small" maxlength="300" :placeholder="tr('健康禁忌、着装、提前到场时间…', 'Contraindications, clothing, arrival time…')" placeholder-class="ph" />

          <text class="block-title spaced serif">{{ tr('需要的物料', 'Materials') }}</text>
          <view class="chip-wrap">
            <view v-for="(m, i) in form.materials" :key="m + i" class="chip chip-on" @tap="form.materials.splice(i, 1)">
              {{ m }}<text class="chip-x">×</text>
            </view>
          </view>
          <view class="inline-input">
            <input v-model="materialInput" class="field-input grow" maxlength="20" :placeholder="tr('如：瑜伽砖、毛毯', 'e.g. blocks, blankets')" placeholder-class="ph" @confirm="addMaterial" />
            <button class="add-btn" @tap="addMaterial">{{ tr('添加', 'Add') }}</button>
          </view>

          <text class="block-title spaced serif">{{ tr('希望平台支持', 'Support needed') }}</text>
          <view class="chip-wrap">
            <view
              v-for="s in SUPPORT_NEED_OPTIONS"
              :key="s"
              class="chip"
              :class="form.supportNeeds.includes(s) ? 'chip-on' : 'chip-off'"
              @tap="toggleIn(form.supportNeeds, s)"
            >{{ s }}</view>
          </view>
        </view>
      </view>

      <!-- 4 人数与价格 -->
      <view v-show="step === 3">
        <view class="card">
          <text class="block-title serif">{{ tr('建议人数上限', 'Suggested capacity') }}</text>
          <view class="unit-input">
            <input v-model="capacityInput" class="field-input latin" type="number" maxlength="3" />
            <text class="unit">{{ tr('人', 'people') }}</text>
          </view>
          <text class="hint">{{ tr('1–200 人，教务会结合场地与安全要求最终确定。', '1–200. The team confirms the final number based on venue and safety.') }}</text>

          <text class="block-title spaced serif">{{ tr('建议单价', 'Suggested price') }}</text>
          <view class="unit-input">
            <text class="unit prefix">¥</text>
            <input v-model="priceInput" class="field-input latin" type="digit" maxlength="8" />
            <text class="unit">{{ tr('/ 人 / 节', '/ person / session') }}</text>
          </view>
          <text class="hint">{{ tr('仅为建议，最终定价由教务核定并在提案详情里展示。', 'For reference only; the final price is set by the team.') }}</text>
        </view>
        <view class="card note-card">
          <PresenceIcon name="info" :size="30" />
          <text class="note-text">{{ tr('场地由教务根据课程类型与城市协调，无需你自行预定；如需特定设备请在「希望平台支持」里说明。', 'The team coordinates the venue. Mention any equipment needs under support needed.') }}</text>
        </view>
      </view>

      <!-- 5 确认 -->
      <view v-show="step === 4">
        <view class="card summary">
          <view class="summary-head">
            <image v-if="form.coverImage" :src="form.coverImage" mode="aspectFill" class="summary-cover" />
            <view class="summary-info">
              <text class="summary-title serif">{{ form.title || tr('未命名提案', 'Untitled proposal') }}</text>
              <text class="summary-meta">{{ summaryMeta }}</text>
              <view class="tag-row">
                <text v-for="c in form.categories" :key="c" class="mini-tag">{{ c }}</text>
                <text v-if="form.theme" class="mini-tag mini-tag-theme">{{ form.theme }}</text>
              </view>
            </view>
          </view>
          <view class="divider"></view>
          <view class="summary-row"><text class="row-label">{{ tr('适合人群', 'Audience') }}</text><text class="row-value">{{ form.targetAudience.join('、') || '—' }}</text></view>
          <view class="summary-row"><text class="row-label">{{ tr('学员收获', 'Outcome') }}</text><text class="row-value">{{ form.goals || '—' }}</text></view>
          <view class="summary-row"><text class="row-label">{{ tr('学员要求', 'Requirements') }}</text><text class="row-value">{{ form.requirements || '—' }}</text></view>
          <view class="summary-row"><text class="row-label">{{ tr('物料', 'Materials') }}</text><text class="row-value">{{ form.materials.join('、') || '—' }}</text></view>
          <view class="summary-row"><text class="row-label">{{ tr('平台支持', 'Support') }}</text><text class="row-value">{{ form.supportNeeds.join('、') || '—' }}</text></view>
          <view class="summary-row"><text class="row-label">{{ tr('建议价格', 'Price hint') }}</text><text class="row-value">{{ priceInput ? `¥${priceInput} / 人 / 节` : '—' }}</text></view>
        </view>
        <text class="submit-note">{{ tr('提交后进入教务受理，受理期间不能修改；如需修改会由教务驳回并说明原因。', 'Once submitted, it goes to review. If something needs changing, the team will send it back with notes.') }}</text>
      </view>

      <view v-if="error" class="error-box">{{ error }}</view>
      <view class="spacer"></view>
    </view>

    <!-- 底部动作：草稿与提交分开，避免误提交 -->
    <view class="action-bar">
      <button v-if="step > 0" class="bar-btn ghost" @tap="prev">{{ tr('上一步', 'Back') }}</button>
      <button v-if="step < PROPOSAL_STEPS.length - 1" class="bar-btn primary" @tap="next">{{ tr('下一步', 'Next') }}</button>
      <template v-else>
        <button class="bar-btn ghost" :disabled="saving" @tap="save(false)">{{ saving ? tr('保存中…', 'Saving…') : tr('保存草稿', 'Save draft') }}</button>
        <button class="bar-btn primary" :disabled="saving" @tap="save(true)">{{ saving ? tr('提交中…', 'Submitting…') : tr('提交审核', 'Submit') }}</button>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  COURSE_CATEGORY_OPTIONS,
  COURSE_THEME_OPTIONS,
  PROPOSAL_STEPS,
  SUPPORT_NEED_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
} from '@fullyu/shared'
import { tr } from '@/locale'
import { getProposal, saveProposal } from '@/api/trainer-portal'
import { ensureTrainerAuth, pickAndUploadImage } from '@/utils/trainer-request'
import PortalNav from '@/components/PortalNav.vue'
import PageState from '@/components/PageState.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'

const proposalId = ref('')
const isEdit = computed(() => !!proposalId.value)
const step = ref(0)
const loading = ref(false)
const saving = ref(false)
const error = ref('')

const form = reactive({
  title: '',
  coverImage: '',
  theme: '',
  categories: [] as string[],
  targetAudience: [] as string[],
  durationMinutes: 60,
  totalSessions: 1,
  description: '',
  goals: '',
  requirements: '',
  materials: [] as string[],
  supportNeeds: [] as string[],
  requestedMaxCapacity: 12,
  requestedPrice: 0,
})

const durationInput = ref('60')
const sessionsInput = ref('1')
const capacityInput = ref('12')
const priceInput = ref('')
const materialInput = ref('')

const stepSub = computed(() => {
  const s = PROPOSAL_STEPS[step.value]
  return tr(`第 ${step.value + 1} / ${PROPOSAL_STEPS.length} 步 · ${s.title}`, `Step ${step.value + 1} of ${PROPOSAL_STEPS.length}`)
})

const summaryMeta = computed(() => {
  const d = Number(durationInput.value) || 0
  const n = Number(sessionsInput.value) || 0
  const c = Number(capacityInput.value) || 0
  return tr(`${d} 分钟 × ${n} 节 · 最多 ${c} 人`, `${d} min × ${n} sessions · up to ${c}`)
})

onLoad(async (query) => {
  if (!ensureTrainerAuth()) return
  const id = String(query?.id || '')
  if (!id) return
  proposalId.value = id
  loading.value = true
  try {
    const detail = await getProposal(id)
    form.title = detail.title || ''
    form.coverImage = detail.coverImage || ''
    form.theme = detail.theme || ''
    form.categories = detail.categories || []
    form.targetAudience = detail.targetAudience || []
    form.durationMinutes = detail.durationMinutes || 60
    form.totalSessions = detail.totalSessions || 1
    form.description = detail.description || ''
    form.goals = detail.goals || ''
    form.requirements = detail.requirements || ''
    form.materials = detail.materials || []
    form.supportNeeds = detail.supportNeeds || []
    form.requestedMaxCapacity = detail.requestedMaxCapacity || 12
    form.requestedPrice = detail.requestedPrice || 0
    durationInput.value = String(form.durationMinutes)
    sessionsInput.value = String(form.totalSessions)
    capacityInput.value = String(form.requestedMaxCapacity)
    priceInput.value = form.requestedPrice ? String(form.requestedPrice) : ''
    // 被驳回的提案从「学员收获」开始检查，教务标了字段也方便对照
    if (detail.status === 'REJECTED') step.value = 0
  } catch {
    error.value = tr('提案加载失败', 'Could not load the proposal')
  } finally {
    loading.value = false
  }
})

function toggleIn(list: string[], value: string) {
  const i = list.indexOf(value)
  if (i >= 0) list.splice(i, 1)
  else list.push(value)
}

function addMaterial() {
  const v = materialInput.value.trim()
  if (!v || form.materials.includes(v)) return
  form.materials.push(v)
  materialInput.value = ''
}

async function chooseCover() {
  const uploaded = await pickAndUploadImage('cover')
  if (uploaded) form.coverImage = uploaded.url
}

/** 分步校验只拦「这一屏就能判断」的缺项，提交时后端再做一次完整校验 */
function validateStep(index: number): string {
  if (index === 0) {
    if (form.title.trim().length < 2) return tr('请先填写课程名称', 'Please add a class title')
    if (!form.coverImage) return tr('请上传封面图', 'Please upload a cover image')
    if (!form.categories.length) return tr('请至少选择一个课程分类', 'Pick at least one category')
    return ''
  }
  if (index === 1) {
    if (!(Number(durationInput.value) >= 15)) return tr('单节时长至少 15 分钟', 'Sessions must be at least 15 minutes')
    if (!(Number(sessionsInput.value) >= 1)) return tr('课程节数至少 1 节', 'At least one session')
    if (!form.targetAudience.length) return tr('请选择适合人群', 'Select who it is for')
    if (form.description.trim().length < 20) return tr('课程介绍至少 20 字', 'Description needs at least 20 characters')
    return ''
  }
  if (index === 2) {
    if (form.goals.trim().length < 10) return tr('学员收获至少 10 个字', 'Outcome needs at least 10 characters')
    return ''
  }
  if (index === 3) {
    const c = Number(capacityInput.value)
    if (!Number.isInteger(c) || c < 1 || c > 200) return tr('建议人数需在 1–200 之间', 'Capacity must be between 1 and 200')
    // 价格可以留空：教务会按城市与场地给出建议价
    if (priceInput.value !== '' && !(Number(priceInput.value) >= 0)) return tr('建议单价不合法', 'Invalid price')
    return ''
  }
  return ''
}

function next() {
  const msg = validateStep(step.value)
  if (msg) {
    error.value = msg
    return
  }
  error.value = ''
  form.durationMinutes = Number(durationInput.value)
  form.totalSessions = Number(sessionsInput.value)
  form.requestedMaxCapacity = Number(capacityInput.value)
  form.requestedPrice = Number(priceInput.value)
  step.value = Math.min(step.value + 1, PROPOSAL_STEPS.length - 1)
}

function prev() {
  error.value = ''
  step.value = Math.max(step.value - 1, 0)
}

async function save(submit: boolean) {
  if (saving.value) return
  error.value = ''
  // 提交必须五步齐；存草稿只要求有个名字，方便自己在列表里认出来
  if (submit) {
    for (let i = 0; i < PROPOSAL_STEPS.length - 1; i += 1) {
      const msg = validateStep(i)
      if (msg) {
        step.value = i
        error.value = msg
        return
      }
    }
  } else if (!form.title.trim()) {
    step.value = 0
    error.value = tr('先填个课程名称再存草稿', 'Add a title before saving a draft')
    return
  }

  saving.value = true
  try {
    await saveProposal({
      id: proposalId.value || undefined,
      title: form.title.trim(),
      coverImage: form.coverImage,
      theme: form.theme,
      categories: form.categories,
      targetAudience: form.targetAudience,
      durationMinutes: Number(durationInput.value) || 60,
      totalSessions: Number(sessionsInput.value) || 1,
      description: form.description,
      goals: form.goals,
      requirements: form.requirements,
      materials: form.materials,
      supportNeeds: form.supportNeeds,
      requestedPrice: priceInput.value === '' ? undefined : Number(priceInput.value),
      requestedMaxCapacity: Number(capacityInput.value) || undefined,
      submit,
    })
    uni.showToast({ title: submit ? tr('已提交审核', 'Submitted') : tr('草稿已保存', 'Draft saved'), icon: 'none' })
    setTimeout(() => uni.navigateBack(), 700)
  } catch (e: any) {
    error.value = e?.message || tr('保存失败，请重试', 'Save failed, please retry')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.steps {
  display: flex;
  gap: 8rpx;
  padding: 20rpx 32rpx 0;
}
.step {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}
.step-dot {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: var(--c-card);
  border: 1rpx solid var(--line-soft);
  color: var(--c-muted);
  font-size: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.step.done .step-dot {
  background: var(--c-card-2);
  border-color: var(--c-card-2);
  color: var(--c-primary);
}
.step.current .step-dot {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: var(--c-rice);
}
.step-name {
  font-size: 20rpx;
  color: var(--c-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.step-line {
  flex: 1;
  height: 3rpx;
  border-radius: 2rpx;
  background: var(--line-soft);
}
.step-line.filled {
  background: var(--c-card-2);
}
.body {
  padding-top: 20rpx;
}
.block-title {
  display: block;
  font-size: 28rpx;
  color: var(--c-ink);
  margin-bottom: 12rpx;
}
.block-title.spaced {
  margin-top: 32rpx;
}
.field-input {
  height: 88rpx;
  border-radius: 18rpx;
  background: var(--c-cream);
  padding: 0 24rpx;
  font-size: 28rpx;
  color: var(--c-ink);
}
.field-textarea {
  width: 100%;
  min-height: 240rpx;
  background: var(--c-cream);
  border-radius: 18rpx;
  padding: 24rpx;
  font-size: 27rpx;
  line-height: 1.7;
  color: var(--c-ink);
}
.field-textarea.small {
  min-height: 150rpx;
}
.ph {
  color: #b4ab97;
}
.counter {
  display: block;
  text-align: right;
  font-size: 20rpx;
  color: var(--c-muted);
  margin-top: 6rpx;
}
.hint {
  display: block;
  font-size: 21rpx;
  color: var(--c-muted);
  line-height: 1.6;
  margin-top: 10rpx;
}
.cover-wrap {
  position: relative;
  width: 100%;
  height: 340rpx;
  border-radius: 20rpx;
  overflow: hidden;
  background: var(--c-cream);
}
.cover {
  width: 100%;
  height: 100%;
}
.cover-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border: 2rpx dashed #cfc6ad;
  border-radius: 20rpx;
}
.cover-plus {
  font-size: 52rpx;
  color: var(--c-muted);
  line-height: 1;
}
.cover-hint {
  font-size: 22rpx;
  color: var(--c-muted);
}
.cover-replace {
  position: absolute;
  right: 16rpx;
  bottom: 16rpx;
  font-size: 21rpx;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  padding: 6rpx 18rpx;
  border-radius: 18rpx;
}
.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.chip {
  padding: 10rpx 22rpx;
  border-radius: 22rpx;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.chip-on {
  background: var(--c-primary);
  color: var(--c-rice);
}
.chip-off {
  background: var(--c-cream);
  color: var(--c-brown);
}
.chip-x {
  font-size: 24rpx;
  opacity: 0.7;
}
.two-col {
  display: flex;
  gap: 20rpx;
}
.col {
  flex: 1;
}
.unit-input {
  display: flex;
  align-items: center;
  background: var(--c-cream);
  border-radius: 18rpx;
  padding-right: 20rpx;
}
.unit-input .field-input {
  background: transparent;
}
.unit {
  font-size: 22rpx;
  color: var(--c-muted);
  flex-shrink: 0;
}
.unit.prefix {
  padding-left: 24rpx;
  font-size: 28rpx;
  color: var(--c-ink);
}
.grow {
  flex: 1;
}
.inline-input {
  display: flex;
  gap: 12rpx;
  margin-top: 12rpx;
}
.add-btn {
  padding: 0 28rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 18rpx;
  background: var(--c-primary);
  color: var(--c-rice);
  font-size: 24rpx;
}
.note-card {
  display: flex;
  gap: 14rpx;
  align-items: flex-start;
  color: var(--c-brown);
}
.note-text {
  flex: 1;
  font-size: 22rpx;
  line-height: 1.7;
}
.summary-head {
  display: flex;
  gap: 20rpx;
}
.summary-cover {
  width: 140rpx;
  height: 170rpx;
  border-radius: 16rpx;
  flex-shrink: 0;
  background: var(--c-cream);
}
.summary-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.summary-title {
  font-size: 32rpx;
  color: var(--c-ink);
  line-height: 1.4;
}
.summary-meta {
  font-size: 22rpx;
  color: var(--c-brown);
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}
.mini-tag {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 12rpx;
  background: var(--c-cream);
  color: var(--c-brown);
}
.mini-tag-theme {
  background: var(--c-card-2);
  color: var(--c-primary);
}
.summary-row {
  display: flex;
  gap: 18rpx;
  padding: 12rpx 0;
}
.row-label {
  width: 130rpx;
  font-size: 22rpx;
  color: var(--c-muted);
  flex-shrink: 0;
}
.row-value {
  flex: 1;
  font-size: 24rpx;
  color: var(--c-ink);
  line-height: 1.6;
}
.submit-note {
  display: block;
  font-size: 21rpx;
  color: var(--c-muted);
  line-height: 1.6;
  margin-top: 12rpx;
}
.error-box {
  font-size: 24rpx;
  color: #b3261e;
  background: #fbeceb;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
  margin-top: 16rpx;
}
.spacer {
  height: 180rpx;
}
.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 16rpx;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  background: rgba(245, 246, 237, 0.96);
  border-top: 1rpx solid var(--line-soft);
  z-index: 30;
}
/* #ifdef H5 */
.action-bar {
  max-width: 480px;
  margin: 0 auto;
}
/* #endif */
.bar-btn {
  flex: 1;
  height: 92rpx;
  border-radius: var(--radius-button);
  font-size: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bar-btn.primary {
  background: var(--c-primary);
  color: var(--c-rice);
}
.bar-btn.ghost {
  background: var(--c-card);
  color: var(--c-primary);
  border: 2rpx solid var(--c-primary);
}
</style>