<template>
  <view class="page">
    <PortalNav :title="tr('课程提案', 'Course proposals')" :sub="tr('提交后由教务受理与排期', 'Reviewed and scheduled by our team')">
      <button class="new-btn" @tap="createNew">{{ tr('新建', 'New') }}</button>
    </PortalNav>

    <scroll-view scroll-x class="filters" :show-scrollbar="false">
      <view class="filter-row">
        <view v-for="f in filters" :key="f.key" class="filter" :class="{ active: bucket === f.key }" @tap="bucket = f.key">
          {{ f.label }}<text v-if="f.key !== 'all' && countOf(f.key)" class="count latin">{{ countOf(f.key) }}</text>
        </view>
      </view>
    </scroll-view>

    <PageState v-if="loading" state="loading" :title="tr('正在载入提案', 'Loading proposals')" />
    <PageState v-else-if="loadError" state="error" :title="tr('提案加载失败', 'Could not load proposals')" :action="tr('重新加载', 'Reload')" @action="load" />
    <view v-else class="container list">
      <view v-if="!visible.length" class="card empty-card">
        <text class="empty-title">{{ tr('还没有课程提案', 'No proposals yet') }}</text>
        <text class="empty-sub">{{ tr('把想开的课写清楚，教务会核场地、定价与排期。', 'Describe the class you want to teach and the team will arrange venue, pricing and schedule.') }}</text>
        <button class="btn-primary empty-action" @tap="createNew">{{ tr('写第一份提案', 'Write your first proposal') }}</button>
      </view>

      <view v-for="p in visible" :key="p.id" class="proposal" @tap="openDetail(p.id)">
        <image v-if="p.coverImage" :src="p.coverImage" mode="aspectFill" class="cover" />
        <view v-else class="cover cover-fallback serif">{{ tr('未设封面', 'No cover') }}</view>
        <view class="info">
          <view class="title-row">
            <text class="title">{{ p.title || tr('未命名提案', 'Untitled proposal') }}</text>
          </view>
          <view class="status-row">
            <text class="status" :class="proposalStatusClass(p.status)">{{ p.statusText }}</text>
            <text class="status-hint">{{ hintOf(p.status) }}</text>
          </view>
          <view class="meta">
            <text>{{ tr(`${p.durationMinutes} 分钟 / 节`, `${p.durationMinutes} min / session`) }}</text>
            <text class="dot">·</text>
            <text>{{ tr(`${p.totalSessions} 节`, `${p.totalSessions} sessions`) }}</text>
            <text v-if="p.requestedMaxCapacity" class="dot">·</text>
            <text v-if="p.requestedMaxCapacity">{{ tr(`${p.requestedMaxCapacity} 人`, `up to ${p.requestedMaxCapacity}`) }}</text>
          </view>
          <text v-if="p.status === 'REJECTED' && p.rejectReason" class="reject">{{ tr('教务说明：', 'Note: ') }}{{ p.rejectReason }}</text>
          <text class="updated">{{ tr('更新于 ', 'Updated ') }}{{ formatDateTime(p.updatedAt) }}</text>
        </view>
        <PresenceIcon name="arrow" :size="26" />
      </view>
      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { COURSE_PROPOSAL_STATUS_META, type CourseProposalStatus } from '@fullyu/shared'
import { tr } from '@/locale'
import { getProposals, type ProposalListItem } from '@/api/trainer-portal'
import { ensureTrainerAuth } from '@/utils/trainer-request'
import { formatDateTime, proposalStatusClass } from '@/utils/trainer-portal-labels'
import PortalNav from '@/components/PortalNav.vue'
import PageState from '@/components/PageState.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'

type Bucket = 'all' | 'draft' | 'reviewing' | 'rejected' | 'published'

const filters: Array<{ key: Bucket; label: string }> = [
  { key: 'all', label: tr('全部', 'All') },
  { key: 'draft', label: tr('草稿', 'Drafts') },
  { key: 'reviewing', label: tr('审核中', 'In review') },
  { key: 'rejected', label: tr('需修改', 'Needs edits') },
  { key: 'published', label: tr('已上架', 'Published') },
]

const bucket = ref<Bucket>('all')
const proposals = ref<ProposalListItem[]>([])
const loading = ref(true)
const loadError = ref(false)

function bucketOf(status: string): Bucket {
  if (status === 'DRAFT') return 'draft'
  if (status === 'REJECTED') return 'rejected'
  if (status === 'APPROVED' || status === 'PUBLISHED') return 'published'
  return 'reviewing'
}

const visible = computed(() =>
  bucket.value === 'all' ? proposals.value : proposals.value.filter((p) => bucketOf(p.status) === bucket.value),
)

function countOf(key: Bucket) {
  return proposals.value.filter((p) => bucketOf(p.status) === key).length
}

const hintOf = (status: string) =>
  COURSE_PROPOSAL_STATUS_META[status as CourseProposalStatus]?.hint || ''

onShow(() => {
  if (!ensureTrainerAuth()) return
  load()
})

async function load() {
  loading.value = true
  loadError.value = false
  try {
    proposals.value = await getProposals()
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function createNew() {
  uni.navigateTo({ url: '/pages/trainer-portal/proposal-edit/index' })
}

function openDetail(id: string) {
  uni.navigateTo({ url: `/pages/trainer-portal/proposal-detail/index?id=${id}` })
}
</script>

<style scoped>
.new-btn {
  padding: 12rpx 26rpx;
  border-radius: 22rpx;
  background: var(--c-primary);
  color: var(--c-rice);
  font-size: 24rpx;
  line-height: 1.6;
}
.filters {
  white-space: nowrap;
  padding: 20rpx 32rpx 0;
}
.filter-row {
  display: flex;
  gap: 12rpx;
}
.filter {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 12rpx 26rpx;
  border-radius: 26rpx;
  background: var(--c-card);
  border: 1rpx solid var(--line-soft);
  font-size: 24rpx;
  color: var(--c-brown);
}
.filter.active {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: var(--c-rice);
}
.count {
  font-size: 20rpx;
  opacity: 0.75;
}
.list {
  padding-top: 24rpx;
}
.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 52rpx 32rpx;
}
.empty-title {
  font-size: 28rpx;
  color: var(--c-ink);
}
.empty-sub {
  font-size: 22rpx;
  color: var(--c-muted);
  text-align: center;
  line-height: 1.6;
}
.empty-action {
  margin-top: 12rpx;
}
.proposal {
  display: flex;
  gap: 20rpx;
  align-items: center;
  background: var(--c-card);
  border-radius: var(--radius-card);
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--shadow-card);
}
.cover {
  width: 150rpx;
  height: 150rpx;
  border-radius: 20rpx;
  flex-shrink: 0;
  background: var(--c-cream);
}
.cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: var(--c-muted);
  text-align: center;
  padding: 10rpx;
  line-height: 1.4;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.title {
  font-size: 29rpx;
  color: var(--c-ink);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-wrap: wrap;
}
.status {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 12rpx;
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
.status-hint {
  font-size: 20rpx;
  color: var(--c-muted);
}
.meta {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 22rpx;
  color: var(--c-brown);
  flex-wrap: wrap;
}
.dot {
  color: var(--c-muted);
}
.reject {
  font-size: 21rpx;
  color: #b3261e;
  line-height: 1.5;
}
.updated {
  font-size: 20rpx;
  color: var(--c-muted);
}
</style>