<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack fallback="/pages/community-mine/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <text class="nav-title serif">{{ tr('社群工作台', 'Community workspace') }}</text>
      <button v-if="community && !forbidden && !guest" class="text-button" @tap="goDetail('feed')">{{ tr('查看', 'View') }}</button><view v-else class="nav-space"></view>
    </view>
    <view class="content">
      <PageState v-if="guest" state="guest" :title="tr('登录后进入工作台', 'Sign in to open the workspace')" :message="tr('只有社群主理人可以使用管理操作。', 'Only the community host can use management tools.')" :action="tr('去登录', 'Sign in')" @action="goLogin" />
      <PageState v-else-if="loading" state="loading" :title="tr('正在加载工作台', 'Loading the workspace')" />
      <PageState v-else-if="loadError" state="error" :title="tr('工作台加载失败', 'Could not load the workspace')" :message="loadError" :action="tr('重新加载', 'Retry')" @action="load" />
      <PageState v-else-if="forbidden" state="empty" :title="tr('暂无管理权限', 'No management access')" :message="tr('你不是该社群的主理人，可以返回我的社群。', 'You are not the host of this community. You can return to My communities.')" :action="tr('我的社群', 'My communities')" @action="goMine" />
      <template v-else-if="community">
        <view v-if="community.status && community.status !== 'APPROVED'" class="card identity-card review-banner"><PresenceIcon name="info" :size="32" /><text>{{ community.status === 'REJECTED' ? tr('申请未通过，请按驳回意见调整后重新提交。', 'Your application was declined. Revise it and submit again.') : tr('社群在平台审核中，审核通过后将在社群广场展示。', 'Under platform review. It appears in the hub once approved.') }}</text></view>
        <view class="card identity-card">
          <view class="cover"><image v-if="community.cover && !failedImages[community.cover]" class="cover-image" :src="community.cover" mode="aspectFill" @error="failedImages[community.cover] = true" /><BrandCover v-else label="" height="112rpx" icon="leaf" /></view>
          <view class="grow"><text class="community-name">{{ community.name }}</text><text class="muted block">{{ isEnglish() ? 'Host ' + (community.owner.name || 'Not provided') : '主理人 ' + (community.owner.name || '未填写') }} · {{ community.yearlyFee ? (isEnglish() ? `Annual fee ¥${(community.yearlyFee / 100).toFixed(2)}` : '年费 ¥' + (community.yearlyFee / 100).toFixed(2)) : tr('免费社群', 'Free community') }}</text></view>
        </view>
        <view class="section-heading"><text class="section-title serif">{{ tr('近期安排', 'Upcoming') }}</text><button class="text-button" @tap="goDetail('events')">{{ tr('全部活动', 'All events') }}</button></view>
        <PageState v-if="dataErrors.events" state="error" :title="tr('活动加载失败', 'Could not load events')" :message="dataErrors.events" :action="tr('重试', 'Retry')" @action="load" />
        <view v-else-if="nextEvent" class="card next-event">
          <view class="action-icon"><PresenceIcon name="calendar" :size="36" /></view>
          <view class="grow"><text class="event-name">{{ nextEvent.title }}</text><text class="muted block">{{ formatDate(nextEvent.date) }} {{ nextEvent.time }}</text><text class="muted block">{{ nextEvent.venue || tr('地点待公布', 'Venue to be announced') }} · {{ isEnglish() ? 'Registered ' + nextEvent.joined : '已报名 ' + nextEvent.joined }}{{ nextEvent.capacity ? ' / ' + nextEvent.capacity : '' }}</text></view>
          <button class="small-button" @tap="goDetail('events')">{{ tr('查看', 'View') }}</button>
        </view>
        <view v-else class="card quiet-card"><PresenceIcon name="calendar" :size="40" /><view><text>{{ tr('近期暂无活动', 'No upcoming events') }}</text><text class="muted block">{{ tr('可以先发一条动态，与成员保持联系。', 'Post an update to stay in touch with members.') }}</text></view></view>
        <view class="section-heading"><text class="section-title serif">{{ tr('经营数据', 'Performance') }}</text><text class="muted">{{ monthLabel }}</text></view>
        <view class="stats-grid">
          <view class="card stat-card"><text class="stat-value">{{ stats.memberCount }}</text><text class="muted">{{ tr('成员总数', 'Total members') }}</text><text class="stat-note">{{ tr('当前社群成员', 'Current community members') }}</text></view>
          <view class="card stat-card"><text class="stat-value">{{ stats.activeToday }}</text><text class="muted">{{ tr('今日活跃', 'Active today') }}</text><text class="stat-note">{{ tr('服务端统计', 'Server-side count') }}</text></view>
          <view class="card stat-card"><text class="stat-value">{{ dataErrors.events ? '—' : stats.monthEvents }}</text><text class="muted">{{ tr('本月活动', 'Events this month') }}</text><text class="stat-note">{{ dataErrors.events ? tr('数据暂不可用', 'Data unavailable') : (isEnglish() ? `${upcomingEvents.length} upcoming` : `${upcomingEvents.length} 场待开始`) }}</text></view>
          <view class="card stat-card"><text class="stat-value">{{ dataErrors.posts ? '—' : stats.monthPosts }}</text><text class="muted">{{ tr('本月公开动态', 'Public posts this month') }}</text><text class="stat-note">{{ dataErrors.posts ? tr('数据暂不可用', 'Data unavailable') : tr('仅统计已发布内容', 'Published content only') }}</text></view>
        </view>
        <PageState v-if="dataErrors.posts" state="error" :title="tr('动态统计暂不可用', 'Post stats unavailable')" :message="dataErrors.posts" :action="tr('重试', 'Retry')" @action="load" />
        <view class="section-heading"><text class="section-title serif">{{ tr('快捷操作', 'Quick actions') }}</text><text class="muted">{{ tr('社群日常', 'Daily tasks') }}</text></view>
        <view class="card quick-grid">
          <button class="quick-button" @tap="openCompose"><view class="action-icon"><PresenceIcon name="edit" :size="40" /></view><text>{{ tr('发布动态', 'New post') }}</text></button>
          <button class="quick-button" @tap="goDetail('events')"><view class="action-icon"><PresenceIcon name="calendar" :size="40" /></view><text>{{ tr('查看活动', 'View events') }}</text></button>
          <button class="quick-button" @tap="goDetail('members')"><view class="action-icon"><PresenceIcon name="users" :size="40" /></view><text>{{ tr('查看成员', 'View members') }}</text></button>
          <button class="quick-button" @tap="load"><view class="action-icon"><PresenceIcon name="chart" :size="40" /></view><text>{{ tr('刷新数据', 'Refresh data') }}</text></button>
        </view>
        <view class="section-heading"><text class="section-title serif">{{ tr('新加入成员', 'New members') }}</text><button class="text-button" @tap="goDetail('members')">{{ tr('查看全部', 'View all') }}</button></view>
        <PageState v-if="dataErrors.members" state="error" :title="tr('成员加载失败', 'Could not load members')" :message="dataErrors.members" :action="tr('重试', 'Retry')" @action="load" />
        <PageState v-else-if="!recentMembers.length" state="empty" :title="tr('还没有成员加入', 'No members yet')" :message="tr('加入后的成员会展示在这里。', 'New members will appear here after joining.')" />
        <view v-else class="card members-card">
          <view v-for="member in recentMembers" :key="member.id" class="member-row"><image v-if="member.avatar && !failedImages[member.avatar]" class="avatar" :src="member.avatar" mode="aspectFill" @error="failedImages[member.avatar] = true" /><view v-else class="avatar avatar-fallback"><PresenceIcon name="user" :size="32" /></view><view class="grow"><text class="member-name">{{ member.name }}</text><text class="muted block">{{ member.joinedAt ? joinedLabel(member.joinedAt) : tr('社群成员', 'Community member') }}</text></view></view>
        </view>
        <view class="notice"><PresenceIcon name="info" :size="32" /><text>{{ tr('入群审核、邀请与活动管理请前往 PC 后台「社群工作台」。', 'Manage join requests, invites and events in the PC Community workspace.') }}</text></view>
      </template>
    </view>
    <BottomSheet :show="composeVisible" :title="tr('发布社群动态', 'Post a community update')" :busy="postBusy" @close="closeCompose">
      <text class="muted block">{{ tr('发布后立即对社群成员可见，主理人可在动态上隐藏或删除。', 'Your post is visible to members right away; you can hide or delete it later.') }}</text>
      <textarea v-model="composeText" class="compose-textarea" :placeholder="tr('分享一条练习提醒，或最近的感受…', 'Share a practice reminder or a recent reflection…')" :maxlength="500" :disabled="postBusy" />
      <text class="counter muted">{{ composeText.length }} / 500</text>
      <text v-if="postError" class="error-text">{{ postError }}</text>
      <template #actions><button class="primary-button" :disabled="postBusy || !composeText.trim()" @tap="onSubmitPost">{{ postBusy ? tr('发布中…', 'Publishing…') : tr('立即发布', 'Publish now') }}</button></template>
    </BottomSheet>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { fetchManagedCommunity, fetchMembership, fetchEvents, fetchPosts, fetchMembers, submitPost, type Community, type CommunityEvent, type CommunityPost, type CommunityMember } from '@/api/skool'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'
import BrandCover from '@/components/BrandCover.vue'
import PageState from '@/components/PageState.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import FloatingBack from '@/components/FloatingBack.vue'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const communityId = ref('')
const community = ref<Community | null>(null)
const guest = ref(!uni.getStorageSync('token'))
const loading = ref(false)
const loadError = ref('')
const forbidden = ref(false)
const canManage = ref(false)
const events = ref<CommunityEvent[]>([])
const posts = ref<CommunityPost[]>([])
const members = ref<CommunityMember[]>([])
const dataErrors = ref({ events: '', posts: '', members: '' })
const failedImages = ref<Record<string, boolean>>({})
const currentMoment = ref(momentKey(new Date()))
const month = computed(() => currentMoment.value.slice(0, 7))
const monthLabel = computed(() => {
  const [year, monthValue] = month.value.split('-').map(Number)
  if (isEnglish()) return new Date(year, monthValue - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return `${year} 年 ${monthValue} 月`
})
const stats = computed(() => ({
  memberCount: community.value?.memberCount ?? 0,
  activeToday: community.value?.activeToday ?? 0,
  monthEvents: events.value.filter(event => event.date.startsWith(month.value)).length,
  monthPosts: posts.value.filter(post => post.time.startsWith(month.value)).length,
}))
const upcomingEvents = computed(() => events.value.filter(event => `${event.date} ${event.time}` > currentMoment.value).slice().sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)))
const nextEvent = computed(() => upcomingEvents.value[0])
const recentMembers = computed(() => members.value.slice().sort((a, b) => (b.joinedAt || '').localeCompare(a.joinedAt || '')).slice(0, 5))
onLoad(options => { communityId.value = options?.id || '' })
onShow(load)
async function load() {
  if (loading.value || postBusy.value) return
  guest.value = !uni.getStorageSync('token')
  canManage.value = false
  forbidden.value = false
  loadError.value = ''
  if (guest.value) { community.value = null; return }
  if (!communityId.value) { loadError.value = tr('缺少社群信息，请返回我的社群重新选择。', 'Community information is missing. Return to My communities and choose again.'); return }
  loading.value = true
  currentMoment.value = momentKey(new Date())
  try {
    const membership = await fetchMembership(communityId.value)
    if (typeof membership?.managed !== 'boolean') throw new Error(tr('暂时无法确认管理权限，请重试。', 'Management access could not be confirmed. Please try again.'))
    if (!membership.managed) { forbidden.value = true; community.value = null; return }
    canManage.value = true
    // 主理人视角详情：待审核（PENDING）社群的工作台也能正常打开
    const result = await fetchManagedCommunity(communityId.value)
    if (!result?.id) throw new Error(tr('社群不存在或暂不可见。', 'This community does not exist or is not visible.'))
    community.value = result
    const results = await Promise.allSettled([fetchEvents(communityId.value), fetchPosts(communityId.value), fetchMembers(communityId.value)])
    const [eventResult, postResult, memberResult] = results
    dataErrors.value = { events: '', posts: '', members: '' }
    if (eventResult.status === 'fulfilled' && Array.isArray(eventResult.value)) events.value = eventResult.value
    else { events.value = []; dataErrors.value.events = tr('无法获取活动数据，请稍后重试。', 'Event data is unavailable. Please try again later.') }
    if (postResult.status === 'fulfilled' && Array.isArray(postResult.value)) posts.value = postResult.value
    else { posts.value = []; dataErrors.value.posts = tr('无法获取公开动态，请稍后重试。', 'Public posts are unavailable. Please try again later.') }
    if (memberResult.status === 'fulfilled' && Array.isArray(memberResult.value)) members.value = memberResult.value
    else { members.value = []; dataErrors.value.members = tr('无法获取成员数据，请稍后重试。', 'Member data is unavailable. Please try again later.') }
  } catch (error) {
    canManage.value = false
    guest.value = !uni.getStorageSync('token')
    loadError.value = error instanceof Error ? error.message : tr('网络暂不可用，请重试。', 'The network is unavailable. Please try again.')
  } finally { loading.value = false }
}
function momentKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function formatDate(value: string) {
  if (!value) return ''
  if (!isEnglish()) return value.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
function joinedLabel(value: string) {
  const date = formatDate(value)
  if (!date) return ''
  return isEnglish() ? `Joined ${date}` : `${date} 加入`
}
const composeVisible = ref(false)
const composeText = ref('')
const postBusy = ref(false)
const postError = ref('')
function openCompose() {
  if (!canManage.value || loading.value) return
  postError.value = ''
  composeVisible.value = true
}
function closeCompose() { if (!postBusy.value) composeVisible.value = false }
async function onSubmitPost() {
  if (postBusy.value || !canManage.value || !composeText.value.trim() || !communityId.value) return
  if (!uni.getStorageSync('token')) { guest.value = true; closeCompose(); return }
  postBusy.value = true
  postError.value = ''
  try {
    const result = await submitPost(communityId.value, composeText.value.trim())
    if (result?.success !== true) throw new Error(tr('动态未提交成功，请重试。', 'The post was not submitted. Please try again.'))
    composeVisible.value = false
    composeText.value = ''
    uni.showToast({ title: tr('已发布，成员现在可以看到', 'Published. Members can see it now.'), icon: 'none' })
  } catch (error) { postError.value = error instanceof Error ? error.message : tr('提交失败，正文已保留，请重试。', 'Submission failed. Your text is kept; please try again.') }
  finally { postBusy.value = false }
}
function goDetail(tab: 'feed' | 'events' | 'members') {
  if (!communityId.value) return
  uni.navigateTo({ url: `/pages/community-detail/index?id=${encodeURIComponent(communityId.value)}&tab=${tab}` })
}
function goLogin() { uni.switchTab({ url: '/pages/profile/index' }) }
function goMine() { uni.redirectTo({ url: '/pages/community-mine/index?segment=managed' }) }
function goBack() { uni.navigateBack({ fail: goMine }) }
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; }
button { margin: 0; border: 0; font-size: 28rpx; line-height: 1.5; }
button::after { border: 0; }
button[disabled] { opacity: .5; }
.nav-bar { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; padding: 16rpx 32rpx 24rpx; }
.back-spacer { width: 72rpx; height: 72rpx; flex-shrink: 0; }
.icon-button, .nav-space { width: 72rpx; height: 72rpx; }
.icon-button { display: flex; align-items: center; justify-content: center; padding: 0; background: transparent; }
.text-button { padding: 16rpx 0; font-size: 24rpx; color: var(--c-brown); background: transparent; }
.content { padding: 0 32rpx; }
.card { padding: 32rpx; background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.review-banner { display: flex; align-items: flex-start; gap: 16rpx; font-size: 24rpx; color: var(--c-muted); line-height: 1.6; }
.identity-card { display: flex; align-items: center; gap: 24rpx; }
.cover { width: 112rpx; height: 112rpx; overflow: hidden; border-radius: 24rpx; flex-shrink: 0; }
.cover-image { display: block; width: 100%; height: 100%; }
.grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.community-name, .event-name, .member-name { font-weight: 600; line-height: 1.6; }
.muted { font-size: 24rpx; color: var(--c-muted); line-height: 1.7; }
.block { display: block; margin-top: 6rpx; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin: 36rpx 0 20rpx; }
.section-title { font-size: 36rpx; }
.next-event { display: flex; align-items: flex-start; gap: 20rpx; }
.action-icon { width: 76rpx; height: 76rpx; display: flex; align-items: center; justify-content: center; border-radius: 24rpx; background: var(--c-card-2); flex-shrink: 0; }
.small-button { background: var(--c-primary); color: var(--c-rice); padding: 14rpx 24rpx; border-radius: var(--radius-button); font-size: 24rpx; flex-shrink: 0; align-self: center; }
.quiet-card { display: flex; align-items: center; gap: 24rpx; }
.stats-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24rpx; }
.stat-card { display: flex; flex-direction: column; gap: 8rpx; }
.stat-value { font-size: 46rpx; font-weight: 600; }
.stat-note { font-size: 24rpx; color: var(--c-brown); line-height: 1.6; }
.quick-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16rpx; padding: 32rpx 20rpx; }
.quick-button { display: flex; flex-direction: column; align-items: center; gap: 16rpx; padding: 0; color: var(--c-ink); background: transparent; font-size: 24rpx; }
.members-card { padding-top: 4rpx; padding-bottom: 4rpx; }
.member-row { display: flex; align-items: center; gap: 20rpx; padding: 28rpx 0; }
.member-row + .member-row { border-top: 1rpx solid var(--line-soft); }
.avatar { width: 64rpx; height: 64rpx; border-radius: 50%; flex-shrink: 0; }
.avatar-fallback { display: flex; align-items: center; justify-content: center; background: var(--c-card-2); }
.notice { display: flex; gap: 16rpx; background: var(--c-card-2); padding: 24rpx; border-radius: 20rpx; margin-top: 28rpx; color: var(--c-muted); font-size: 24rpx; line-height: 1.7; }
.notice text { flex: 1; min-width: 0; }
.compose-textarea { width: 100%; box-sizing: border-box; height: 280rpx; padding: 24rpx; margin-top: 24rpx; background: var(--c-rice); color: var(--c-ink); border-radius: 20rpx; font-size: 28rpx; line-height: 1.7; }
.counter { display: block; text-align: right; margin-top: 12rpx; }
.error-text { display: block; margin-top: 20rpx; color: var(--c-primary); font-size: 24rpx; line-height: 1.7; }
.primary-button { width: 100%; padding: 22rpx; background: var(--c-primary); color: var(--c-rice); font-weight: 600; border-radius: var(--radius-button); }
</style>
