<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack :disabled="submitting" fallback="/pages/community-mine/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <text class="nav-title serif">{{ tr('创建社群', 'Create community') }}</text><view class="nav-space"></view>
    </view>
    <view class="content">
      <PageState v-if="guest" state="guest" :title="tr('登录后创建社群', 'Log in to create a community')" :message="tr('申请将提交给平台审核。', 'Your application will be sent to the platform for review.')" :action="tr('去登录', 'Log in')" @action="goLogin" />
      <view v-else-if="submitted" class="success-card card">
        <view class="success-icon"><PresenceIcon name="check" :size="64" /></view>
        <text class="success-title serif">{{ tr('申请已提交', 'Application submitted') }}</text>
        <text class="muted success-message">{{ tr(`「${form.name.trim()}」的申请已送达平台。审核与上架以平台结果为准。`, `Your application for “${form.name.trim()}” has reached the platform. Review and publishing depend on the platform's decision.`) }}</text>
        <button class="primary-button" @tap="goMine">{{ tr('查看我的社群', 'View my communities') }}</button>
        <button class="outline-button" @tap="goHome">{{ tr('返回首页', 'Back to home') }}</button>
      </view>
      <template v-else>
        <view class="steps">
          <view v-for="(label, i) in stepLabels" :key="label" class="step" :class="{ current: step === i + 1, done: step > i + 1 }">
            <view class="step-number"><PresenceIcon v-if="step > i + 1" name="check" :size="22" color="#f5f6ed" /><text v-else>{{ i + 1 }}</text></view><text>{{ label }}</text>
          </view>
        </view>
        <view v-if="step === 1" class="step-content">
          <view class="cover-preview"><BrandCover :label="form.name || tr('留一处空间，一起在场', 'A space to be present together')" height="240rpx" icon="leaf" /></view>
          <text class="muted cover-note">{{ tr('使用品牌封面预览，当前暂不支持自定义上传。', 'A brand cover is used for preview. Custom uploads are not supported yet.') }}</text>
          <view class="card input-card">
            <view class="input-row"><text class="label">{{ tr('名称', 'Name') }}</text><input v-model="form.name" class="input" :placeholder="tr('例如：夜读疗愈会', 'e.g. Evening reading circle')" :maxlength="20" /></view>
            <view class="input-row"><text class="label">{{ tr('定位', 'Tagline') }}</text><input v-model="form.slogan" class="input" :placeholder="tr('一句话介绍你的社群', 'Describe your community in one line')" :maxlength="40" /></view>
          </view>
          <text class="field-title">{{ tr('分类', 'Category') }}</text>
          <view class="options">
            <button v-for="cat in categories" :key="cat" class="option" :class="{ selected: form.category === cat }" @tap="form.category = cat">{{ categoryLabel(cat) }}<view v-if="form.category === cat" class="selected-mark"><PresenceIcon name="check" :size="18" color="#f5f6ed" /></view></button>
          </view>
          <view class="field-heading"><text class="field-title">{{ tr('标签', 'Tags') }}</text><text class="muted">{{ tr(`最多 3 个 · 已选 ${form.tags.length}`, `Up to 3 · ${form.tags.length} selected`) }}</text></view>
          <view class="options">
            <button v-for="tag in TAG_OPTIONS" :key="tag" class="option" :class="{ selected: form.tags.includes(tag) }" @tap="onTag(tag)">{{ communityTagLabel(tag) }}<view v-if="form.tags.includes(tag)" class="selected-mark"><PresenceIcon name="check" :size="18" color="#f5f6ed" /></view></button>
          </view>
        </view>
        <view v-else-if="step === 2" class="step-content">
          <text class="field-title first-title">{{ tr('收费方式', 'Pricing') }}</text>
          <view class="fee-options">
            <button class="option fee-option" :class="{ selected: form.feeMode === 'free' }" @tap="form.feeMode = 'free'"><text class="fee-title">{{ tr('免费加入', 'Free to join') }}</text><text class="muted">{{ tr('不收取社群年费', 'No yearly community fee') }}</text><view v-if="form.feeMode === 'free'" class="selected-mark"><PresenceIcon name="check" :size="18" color="#f5f6ed" /></view></button>
            <button class="option fee-option" :class="{ selected: form.feeMode === 'paid' }" @tap="form.feeMode = 'paid'"><text class="fee-title">{{ tr('订阅制', 'Subscription') }}</text><text class="muted">{{ tr('填写期望年费', 'Enter your expected yearly fee') }}</text><view v-if="form.feeMode === 'paid'" class="selected-mark"><PresenceIcon name="check" :size="18" color="#f5f6ed" /></view></button>
          </view>
          <view v-if="form.feeMode === 'paid'" class="card fee-card">
            <view class="input-row"><text class="label">{{ tr('年费', 'Yearly') }}</text><text>¥</text><input v-model="form.feeYuan" class="input fee-input" type="digit" placeholder="0.00" :maxlength="12" /><text class="muted">{{ tr('元 / 年', 'CNY / year') }}</text></view>
            <text class="muted">{{ tr('最多两位小数。此处只提交定价申请，不代表收款已开通；支付与结算须以平台实际支持为准。', 'Up to two decimal places. This only submits a pricing request; collection is not yet enabled. Payment and settlement depend on platform support.') }}</text>
          </view>
          <text class="field-title">{{ tr('社群介绍', 'Community description') }} <text class="muted">{{ tr('选填', 'Optional') }}</text></text>
          <textarea v-model="form.description" class="description-input" :placeholder="tr('适合谁、一起做什么、多久活动一次？也可以在这里说明成员可获得的内容。', 'Who is it for, what will you do together, and how often? You can also describe what members receive.')" :maxlength="300" />
          <text class="counter muted">{{ form.description.length }} / 300</text>
          <view class="notice"><PresenceIcon name="info" :size="32" /><text>{{ tr('请如实描述内容与收费。社群和动态均需平台审核后展示。', 'Describe your content and pricing accurately. Communities and posts are reviewed by the platform before appearing.') }}</text></view>
        </view>
        <view v-else class="step-content">
          <text class="field-title first-title">{{ tr('预览', 'Preview') }}</text>
          <view class="preview-card">
            <BrandCover :label="form.name" height="224rpx" icon="leaf" />
            <view class="preview-body"><text class="preview-name serif">{{ form.name.trim() }}</text><text class="muted block">{{ form.slogan.trim() }}</text><view class="preview-footer"><view class="tags"><text class="tag">{{ categoryLabel(form.category) }}</text><text v-for="tag in form.tags" :key="tag" class="tag">{{ communityTagLabel(tag) }}</text></view><text class="preview-fee">{{ previewFee }}</text></view><text v-if="form.description.trim()" class="long-text">{{ form.description.trim() }}</text></view>
          </view>
          <text class="field-title">{{ tr('审核流程', 'Review process') }}</text>
          <view class="card timeline">
            <view class="timeline-row"><view class="timeline-dot active"></view><view><text>{{ tr('提交申请', 'Submit application') }}</text><text class="muted block">{{ tr('确认信息后提交给平台', 'Send to the platform after confirming details') }}</text></view></view>
            <view class="timeline-row"><view class="timeline-dot"></view><view><text>{{ tr('平台审核', 'Platform review') }}</text><text class="muted block">{{ tr('审核结果以平台实际处理为准', 'The result follows the platform review') }}</text></view></view>
            <view class="timeline-row"><view class="timeline-dot"></view><view><text>{{ tr('社群展示', 'Publish community') }}</text><text class="muted block">{{ tr('审核通过并上架后，在社群广场展示', 'Once approved and published, it appears in the community hub') }}</text></view></view>
          </view>
          <text class="muted review-note">{{ tr('提交后请勿重复申请。定价申请不代表支付、收款或结算功能已开通。', 'Do not submit twice. A pricing request does not mean payment, collection or settlement is enabled.') }}</text>
        </view>
        <text v-if="validationError" class="error-text">{{ validationError }}</text>
        <text v-if="submitError" class="error-text">{{ submitError }}</text>
      </template>
    </view>
    <view v-if="!guest && !submitted" class="bottom-action">
      <button v-if="step > 1" class="outline-button" :disabled="submitting" @tap="previousStep">{{ tr('上一步', 'Back') }}</button>
      <button v-if="step < 3" class="primary-button" @tap="nextStep">{{ tr('下一步', 'Next') }}</button>
      <button v-else class="primary-button" :disabled="submitting" @tap="onSubmit">{{ submitting ? tr('提交中…', 'Submitting…') : tr('提交审核', 'Submit for review') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { COMMUNITY_CATEGORIES, submitCommunity } from '@/api/skool'
import { tr, isEnglish } from '@/locale'
import { communityTagLabel } from '@/utils/community-labels'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'
import BrandCover from '@/components/BrandCover.vue'
import PageState from '@/components/PageState.vue'
import FloatingBack from '@/components/FloatingBack.vue'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const guest = ref(!uni.getStorageSync('token'))
onShow(() => { guest.value = !uni.getStorageSync('token') })
const categories = COMMUNITY_CATEGORIES.filter(category => category !== '全部')
const TAG_OPTIONS = ['SDG 3 良好健康', 'SDG 4 优质教育', 'SDG 12 责任消费', '身心疗愈', '身体疗愈', '复愈特色', '职业成长', '轻户外']
const CATEGORY_EN: Record<string, string> = {
  全部: 'All', 疗愈: 'Healing', 瑜伽: 'Yoga', 身心成长: 'Mind-body growth', 手作: 'Craft', 健身: 'Fitness',
}
function categoryLabel(value: string) { return isEnglish() ? (CATEGORY_EN[value] || value) : value }
const stepLabels = computed(() => [tr('基本信息', 'Basics'), tr('收费与介绍', 'Pricing & intro'), tr('预览提交', 'Review & submit')])
const step = ref(1)
const form = ref({ name: '', slogan: '', category: '疗愈', tags: [] as string[], feeMode: 'free' as 'free' | 'paid', feeYuan: '', description: '' })
const validationError = ref('')
const submitError = ref('')
const submitting = ref(false)
const submitted = ref(false)
const yearlyFee = computed(() => {
  if (form.value.feeMode === 'free') return 0
  const raw = form.value.feeYuan.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null
  const cents = Math.round(Number(raw) * 100)
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
})
const previewFee = computed(() => form.value.feeMode === 'free' ? tr('免费', 'Free') : `¥${Number(((yearlyFee.value || 0) / 100).toFixed(2))}${isEnglish() ? '/year' : '/年'}`)
function onTag(tag: string) {
  const index = form.value.tags.indexOf(tag)
  if (index >= 0) form.value.tags.splice(index, 1)
  else if (form.value.tags.length < 3) form.value.tags.push(tag)
  else uni.showToast({ title: tr('最多选择 3 个标签', 'You can choose up to 3 tags'), icon: 'none' })
}
function validateBasic() {
  if (!form.value.name.trim() || !form.value.slogan.trim()) return tr('请填写社群名称与一句话定位。', 'Please enter a community name and a one-line description.')
  if (!categories.includes(form.value.category)) return tr('请选择社群分类。', 'Please choose a community category.')
  return ''
}
function validateFee() { return yearlyFee.value === null ? tr('请填写大于 0 的年费，最多两位小数。', 'Enter an annual fee greater than 0 with up to 2 decimal places.') : '' }
function nextStep() {
  validationError.value = step.value === 1 ? validateBasic() : validateFee()
  if (validationError.value || step.value >= 3) return
  step.value++
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}
function previousStep() {
  if (submitting.value || step.value <= 1) return
  step.value--
  validationError.value = ''
  submitError.value = ''
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}
async function onSubmit() {
  if (submitting.value || submitted.value || step.value !== 3) return
  if (!uni.getStorageSync('token')) { guest.value = true; return }
  validationError.value = validateBasic() || validateFee()
  if (validationError.value || yearlyFee.value === null) return
  submitting.value = true
  submitError.value = ''
  try {
    const result = await submitCommunity({
      name: form.value.name.trim(), slogan: form.value.slogan.trim(), category: form.value.category,
      tags: [...form.value.tags], yearlyFee: yearlyFee.value, description: form.value.description.trim() || undefined,
    })
    if (!result?.id || typeof result.status !== 'string') throw new Error(tr('未收到有效提交回执，请核对后重试。', 'No valid submission receipt was received. Please check and try again.'))
    submitted.value = true
    uni.pageScrollTo({ scrollTop: 0, duration: 0 })
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : tr('提交失败，已保留填写内容，请稍后重试。', 'Submission failed. Your entries are kept; please try again later.')
    guest.value = !uni.getStorageSync('token')
  } finally { submitting.value = false }
}
function goBack() {
  if (submitting.value) return
  if (!submitted.value && step.value > 1) { previousStep(); return }
  uni.navigateBack({ fail: goMine })
}
function goLogin() { uni.switchTab({ url: '/pages/profile/index' }) }
function goMine() { uni.redirectTo({ url: '/pages/community-mine/index?segment=managed' }) }
function goHome() { uni.switchTab({ url: '/pages/index/index' }) }
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(180rpx + env(safe-area-inset-bottom)); }
button { margin: 0; font-size: 28rpx; line-height: 1.5; border: 0; }
button::after { border: 0; }
button[disabled] { opacity: .5; }
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 16rpx 32rpx 24rpx; }
.back-spacer { width: 72rpx; height: 72rpx; flex-shrink: 0; }
.icon-button, .nav-space { width: 72rpx; height: 72rpx; }
.icon-button { display: flex; align-items: center; justify-content: center; padding: 0; background: transparent; }
.content { padding: 0 32rpx; }
.steps { display: flex; gap: 12rpx; margin: 4rpx 0 28rpx; }
.step { display: flex; align-items: center; gap: 10rpx; flex: 1; color: var(--c-muted); font-size: 24rpx; }
.step-number { width: 42rpx; height: 42rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 50%; background: var(--c-card-2); }
.step.current { color: var(--c-primary); font-weight: 600; }
.step.current .step-number, .step.done .step-number { background: var(--c-primary); color: var(--c-rice); }
.cover-preview { overflow: hidden; border-radius: var(--radius-card); }
.muted { color: var(--c-muted); font-size: 24rpx; line-height: 1.7; }
.cover-note { display: block; margin: 12rpx 0 24rpx; }
.card { padding: 32rpx; background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.input-card { padding-top: 8rpx; padding-bottom: 8rpx; }
.input-row { display: flex; align-items: center; gap: 16rpx; padding: 24rpx 0; }
.input-row + .input-row { border-top: 1rpx solid var(--line-soft); }
.label { flex-shrink: 0; width: 76rpx; }
.input { flex: 1; min-width: 0; height: 56rpx; color: var(--c-ink); font-size: 28rpx; text-align: right; }
.field-title { display: block; margin: 36rpx 0 20rpx; font-weight: 600; }
.first-title { margin-top: 8rpx; }
.field-heading { display: flex; align-items: baseline; gap: 12rpx; }
.options { display: flex; flex-wrap: wrap; gap: 16rpx; }
.option { position: relative; overflow: hidden; padding: 14rpx 32rpx; border: 1rpx solid var(--line-soft); background: var(--c-card); color: var(--c-ink); border-radius: 20rpx; font-size: 24rpx; }
.option.selected { border-color: var(--c-primary); background: var(--c-card-2); color: var(--c-primary); }
.selected-mark { position: absolute; top: 0; right: 0; display: flex; align-items: center; justify-content: center; width: 26rpx; height: 26rpx; border-bottom-left-radius: 14rpx; background: var(--c-primary); }
.fee-options { display: flex; gap: 20rpx; }
.fee-option { flex: 1; text-align: left; padding: 24rpx; }
.fee-title { display: block; font-size: 28rpx; font-weight: 600; margin-bottom: 8rpx; }
.fee-card { margin-top: 24rpx; }
.fee-card .input-row { padding-top: 0; }
.fee-input { text-align: left; }
.description-input { width: 100%; height: 300rpx; padding: 28rpx; box-sizing: border-box; background: var(--c-card); border: 1rpx solid var(--line-soft); border-radius: 20rpx; font-size: 28rpx; line-height: 1.7; color: var(--c-ink); }
.counter { display: block; margin-top: 10rpx; text-align: right; }
.notice { display: flex; gap: 16rpx; margin-top: 28rpx; padding: 24rpx; background: var(--c-card-2); border-radius: 20rpx; font-size: 24rpx; color: var(--c-muted); line-height: 1.7; }
.notice text { flex: 1; min-width: 0; }
.preview-card { overflow: hidden; background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.preview-body { padding: 32rpx; }
.preview-name { display: block; font-size: 36rpx; margin-bottom: 8rpx; overflow-wrap: anywhere; }
.block { display: block; overflow-wrap: anywhere; }
.preview-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 20rpx; margin-top: 24rpx; }
.tags { display: flex; flex-wrap: wrap; gap: 10rpx; }
.tag { background: var(--c-rice); border-radius: 8rpx; padding: 4rpx 12rpx; color: var(--c-muted); font-size: 24rpx; }
.preview-fee { flex-shrink: 0; color: var(--c-primary); font-weight: 600; }
.long-text { display: block; margin-top: 24rpx; padding-top: 24rpx; border-top: 1rpx solid var(--line-soft); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; }
.timeline-row { display: flex; align-items: flex-start; gap: 20rpx; padding: 14rpx 0; }
.timeline-dot { width: 16rpx; height: 16rpx; border-radius: 50%; background: var(--line-soft); margin-top: 12rpx; flex-shrink: 0; }
.timeline-dot.active { background: var(--c-primary); }
.review-note { display: block; margin-top: 24rpx; }
.error-text { display: block; margin-top: 24rpx; padding: 20rpx; background: var(--c-card-2); border-radius: 20rpx; color: var(--c-primary); font-size: 24rpx; line-height: 1.7; }
.bottom-action { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 20rpx; padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom)); background: var(--c-card); border-top: 1rpx solid var(--line-soft); z-index: 20; }
.primary-button, .outline-button { flex: 1; padding: 22rpx 24rpx; border-radius: var(--radius-button); font-weight: 600; }
.primary-button { background: var(--c-primary); color: var(--c-rice); }
.outline-button { border: 2rpx solid var(--c-primary); background: var(--c-card); color: var(--c-primary); }
.success-card { margin-top: 32rpx; text-align: center; }
.success-icon { display: flex; align-items: center; justify-content: center; width: 120rpx; height: 120rpx; background: var(--c-card-2); border-radius: 50%; margin: 16rpx auto 28rpx; }
.success-title { display: block; font-size: 42rpx; }
.success-message { display: block; margin: 16rpx 0 40rpx; overflow-wrap: anywhere; }
.success-card button { width: 100%; margin-top: 20rpx; }
</style>
