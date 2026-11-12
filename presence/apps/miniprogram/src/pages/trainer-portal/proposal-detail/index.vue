<template>
  <view class="page">
    <PortalNav :title="tr('提案详情', 'Proposal detail')" :sub="detail?.statusText || ''" fallback="/pages/trainer-portal/proposals/index" />

    <PageState v-if="loading" state="loading" :title="tr('正在载入提案', 'Loading proposal')" />
    <PageState v-else-if="loadError || !detail" state="error" :title="tr('提案加载失败', 'Could not load the proposal')" :action="tr('重新加载', 'Reload')" @action="load" />

    <view v-else class="container body">
      <view class="head-card">
        <image v-if="detail.coverImage" :src="detail.coverImage" mode="aspectFill" class="head-cover" />
        <view v-else class="head-cover head-cover-empty serif">{{ tr('未设封面', 'No cover') }}</view>
        <view class="head-info">
          <text class="head-title serif">{{ detail.title || tr('未命名提案', 'Untitled proposal') }}</text>
          <text class="status" :class="proposalStatusClass(detail.status)">{{ detail.statusText }}</text>
          <text class="head-hint">{{ statusHint }}</text>
        </view>
      </view>

      <view v-if="detail.status === 'REJECTED'" class="reject-card">
        <text class="reject-title">{{ tr('教务说明', 'Note from the team') }}</text>
        <text class="reject-body">{{ detail.rejectReason || tr('请按教务反馈调整内容后重新提交。', 'Please adjust and resubmit.') }}</text>
        <view v-if="detail.rejectFieldLabels.length" class="reject-fields">
          <text class="reject-label">{{ tr('需调整：', 'Fields to update: ') }}</text>
          <text v-for="f in detail.rejectFieldLabels" :key="f" class="reject-chip">{{ f }}</text>
        </view>
      </view>

      <view v-if="scheduleRows.length" class="card">
        <text class="block-title serif">{{ tr('教务排期', 'Scheduled by the team') }}</text>
        <view v-for="row in scheduleRows" :key="row.label" class="info-row">
          <text class="row-label">{{ row.label }}</text>
          <text class="row-value">{{ row.value }}</text>
        </view>
      </view>

      <view class="card">
        <text class="block-title serif">{{ tr('课程信息', 'Class info') }}</text>
        <view class="info-row">
          <text class="row-label">{{ tr('分类', 'Category') }}</text>
          <view class="row-value tags">
            <text v-for="c in detail.categories" :key="c" class="tag">{{ c }}</text>
            <text v-if="!detail.categories.length">—</text>
          </view>
        </view>
        <view class="info-row">
          <text class="row-label">{{ tr('主题', 'Theme') }}</text>
          <text class="row-value">{{ detail.theme || '—' }}</text>
        </view>
        <view class="info-row">
          <text class="row-label">{{ tr('时长节数', 'Length') }}</text>
          <text class="row-value">{{ tr(`${detail.durationMinutes} 分钟 / 节 · 共 ${detail.totalSessions} 节`, `${detail.durationMinutes} min / session · ${detail.totalSessions} sessions`) }}</text>
        </view>
        <view class="info-row">
          <text class="row-label">{{ tr('适合人群', 'Audience') }}</text>
          <view class="row-value tags">
            <text v-for="a in detail.targetAudience" :key="a" class="tag">{{ a }}</text>
            <text v-if="!detail.targetAudience.length">—</text>
          </view>
        </view>
        <view class="info-row">
          <text class="row-label">{{ tr('建议人数', 'Capacity') }}</text>
          <text class="row-value">{{ detail.requestedMaxCapacity ? tr(`最多 ${detail.requestedMaxCapacity} 人`, `Up to ${detail.requestedMaxCapacity}`) : '—' }}</text>
        </view>
        <view class="info-row">
          <text class="row-label">{{ tr('建议单价', 'Price hint') }}</text>
          <text class="row-value">{{ detail.requestedPrice != null ? `¥${detail.requestedPrice}` : '—' }}</text>
        </view>
      </view>

      <view class="card">
        <text class="block-title serif">{{ tr('课程介绍', 'Description') }}</text>
        <text class="paragraph">{{ detail.description || tr('未填写', 'Not filled') }}</text>
        <text class="block-title spaced serif">{{ tr('学员收获', 'Outcome') }}</text>
        <text class="paragraph">{{ detail.goals || tr('未填写', 'Not filled') }}</text>
        <text class="block-title spaced serif">{{ tr('学员要求', 'Requirements') }}</text>
        <text class="paragraph">{{ detail.requirements || tr('未填写', 'Not filled') }}</text>
        <text class="block-title spaced serif">{{ tr('物料', 'Materials') }}</text>
        <view class="tags">
          <text v-for="m in detail.materials" :key="m" class="tag">{{ m }}</text>
          <text v-if="!detail.materials.length">—</text>
        </view>
        <text class="block-title spaced serif">{{ tr('希望平台支持', 'Support needed') }}</text>
        <view class="tags">
          <text v-for="s in detail.supportNeeds" :key="s" class="tag tag-soft">{{ s }}</text>
          <text v-if="!detail.supportNeeds.length">—</text>
        </view>
      </view>

      <view class="card">
        <text class="block-title serif">{{ tr('进度', 'Timeline') }}</text>
        <view v-for="(t, i) in timeline" :key="t.label" class="timeline-row">
          <view class="timeline-dot" :class="{ active: i === timeline.length - 1 }"></view>
          <text class="timeline-label">{{ t.label }}</text>
          <text class="timeline-time latin">{{ t.time }}</text>
        </view>
      </view>

      <view class="note">{{ tr('提案以提交时内容为准，教务审核期间不可修改；已上架课程的排期以课程页为准。', 'Review uses the submitted version. Published schedules follow the class page.') }}</view>
      <view class="safe-area-bottom"></view>
    </view>

    <view v-if="detail" class="action-bar">
      <button v-if="detail.publishedCourseId" class="bar-btn ghost" @tap="openCourse">{{ tr('查看已上架课程', 'View class') }}</button>
      <button v-if="canEdit" class="bar-btn ghost" @tap="edit">{{ tr('修改', 'Edit') }}</button>
      <button v-if="canEdit" class="bar-btn primary" :disabled="submitting" @tap="submit">{{ submitting ? tr('提交中…', 'Submitting…') : tr('提交审核', 'Submit') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { COURSE_PROPOSAL_STATUS_META, type CourseProposalStatus } from '@fullyu/shared'
import { tr } from '@/locale'
import { getProposal, submitProposal, type ProposalDetail } from '@/api/trainer-portal'
import { ensureTrainerAuth } from '@/utils/trainer-request'
import { canEditProposal, formatDate, formatDateTime, proposalStatusClass } from '@/utils/trainer-portal-labels'
import PortalNav from '@/components/PortalNav.vue'
import PageState from '@/components/PageState.vue'

const proposalId = ref('')
const detail = ref<ProposalDetail | null>(null)
const loading = ref(true)
const loadError = ref(false)
const submitting = ref(false)

const canEdit = computed(() => (detail.value ? canEditProposal(detail.value.status) : false))
const statusHint = computed(() =>
  detail.value ? COURSE_PROPOSAL_STATUS_META[detail.value.status as CourseProposalStatus]?.hint || '' : '',
)

const timeline = computed(() => {
  if (!detail.value) return []
  const rows = [{ label: tr('创建', 'Created'), time: formatDateTime(detail.value.createdAt) }]
  if (detail.value.status !== 'DRAFT') rows.push({ label: tr('最近提交', 'Last saved'), time: formatDateTime(detail.value.updatedAt) })
  if (detail.value.reviewedAt) rows.push({ label: tr('教务处理', 'Reviewed'), time: formatDateTime(detail.value.reviewedAt) })
  if (detail.value.publishedAt) rows.push({ label: tr('上架时间', 'Published'), time: formatDateTime(detail.value.publishedAt) })
  return rows
})

/** 教务排期只有通过后才可能存在，空值不占版面 */
const scheduleRows = computed(() => {
  if (!detail.value) return []
  const rows: Array<{ label: string; value: string }> = []
  const d = detail.value
  if (d.scheduledDate) rows.push({ label: tr('上课日期', 'Date'), value: formatDate(d.scheduledDate) })
  if (d.scheduledStartTime) rows.push({ label: tr('上课时段', 'Time'), value: `${d.scheduledStartTime}${d.scheduledEndTime ? ' – ' + d.scheduledEndTime : ''}` })
  if (d.finalPrice != null) rows.push({ label: tr('最终单价', 'Final price'), value: `¥${d.finalPrice}` })
  if (d.finalMaxCapacity) rows.push({ label: tr('最终人数', 'Final capacity'), value: tr(`${d.finalMaxCapacity} 人`, `${d.finalMaxCapacity} people`) })
  return rows
})

onLoad((query) => {
  proposalId.value = String(query?.id || '')
  if (!ensureTrainerAuth()) return
  if (!proposalId.value) {
    loadError.value = true
    loading.value = false
    return
  }
})

// 从编辑页返回时刷新，避免看到旧状态
onShow(() => {
  if (proposalId.value) load()
})

async function load() {
  loading.value = true
  loadError.value = false
  try {
    detail.value = await getProposal(proposalId.value)
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function edit() {
  uni.navigateTo({ url: `/pages/trainer-portal/proposal-edit/index?id=${proposalId.value}` })
}

async function submit() {
  if (submitting.value) return
  uni.showModal({
    title: tr('提交审核', 'Submit for review'),
    content: tr('提交后教务受理期间不能再修改，确认提交？', 'Once submitted you cannot edit it during review. Continue?'),
    success: async (res) => {
      if (!res.confirm) return
      submitting.value = true
      try {
        await submitProposal(proposalId.value)
        uni.showToast({ title: tr('已提交', 'Submitted'), icon: 'none' })
        await load()
      } catch {
        // 请求层已提示
      } finally {
        submitting.value = false
      }
    },
  })
}

function openCourse() {
  if (!detail.value?.publishedCourseId) return
  uni.navigateTo({ url: `/pages/course-detail/index?id=${detail.value.publishedCourseId}` })
}
</script>

<style scoped>
.body {
  padding-top: 24rpx;
  padding-bottom: 200rpx;
}
.head-card {
  display: flex;
  gap: 22rpx;
  background: var(--c-card);
  border-radius: var(--radius-card);
  padding: 24rpx;
  box-shadow: var(--shadow-card);
}
.head-cover {
  width: 160rpx;
  height: 200rpx;
  border-radius: 18rpx;
  flex-shrink: 0;
  background: var(--c-cream);
}
.head-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: var(--c-muted);
}
.head-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.head-title {
  font-size: 34rpx;
  color: var(--c-ink);
  line-height: 1.4;
}
.status {
  align-self: flex-start;
  font-size: 21rpx;
  padding: 3rpx 14rpx;
  border-radius: 14rpx;
}
.s-draft {
  background: var(--c-cream);
  color: var(--c-muted);
}
.s-review {
  background: #e6edf6;
  color: #2f4f7a;
}
.s-reject {
  background: #fbeceb;
  color: #b3261e;
}
.s-done {
  background: #e8efdc;
  color: #4b5f27;
}
.head-hint {
  font-size: 22rpx;
  color: var(--c-muted);
  line-height: 1.6;
}
.reject-card {
  margin-top: 20rpx;
  background: #fbeceb;
  border-radius: var(--radius-card);
  padding: 26rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.reject-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #b3261e;
}
.reject-body {
  font-size: 24rpx;
  color: #8c2b25;
  line-height: 1.7;
}
.reject-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8rpx;
}
.reject-label {
  font-size: 21rpx;
  color: #8c2b25;
}
.reject-chip {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 12rpx;
  background: #fff;
  color: #b3261e;
}
.card {
  margin-top: 20rpx;
}
.block-title {
  display: block;
  font-size: 28rpx;
  color: var(--c-ink);
  margin-bottom: 12rpx;
}
.block-title.spaced {
  margin-top: 26rpx;
}
.info-row {
  display: flex;
  gap: 18rpx;
  padding: 10rpx 0;
}
.row-label {
  width: 132rpx;
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
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}
.tag {
  font-size: 21rpx;
  padding: 3rpx 14rpx;
  border-radius: 14rpx;
  background: var(--c-cream);
  color: var(--c-brown);
}
.tag-soft {
  background: var(--c-card-2);
  color: var(--c-primary);
}
.paragraph {
  display: block;
  font-size: 25rpx;
  color: var(--c-ink);
  line-height: 1.8;
  white-space: pre-wrap;
}
.timeline-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 12rpx 0;
}
.timeline-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--c-card-2);
  flex-shrink: 0;
}
.timeline-dot.active {
  background: var(--c-primary);
}
.timeline-label {
  flex: 1;
  font-size: 23rpx;
  color: var(--c-ink);
}
.timeline-time {
  font-size: 21rpx;
  color: var(--c-muted);
}
.note {
  margin-top: 20rpx;
  font-size: 21rpx;
  color: var(--c-muted);
  line-height: 1.6;
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
  font-size: 27rpx;
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