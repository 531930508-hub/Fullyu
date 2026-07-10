<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-title">我的课程</text>
    </view>

    <!-- Tab 切换 -->
    <view class="tab-bar">
      <view v-for="tab in tabs" :key="tab.value" class="tab-item" :class="{ active: currentTab === tab.value }" @tap="currentTab = tab.value">
        <text>{{ tab.label }}</text>
        <view v-if="tab.count" class="tab-badge">{{ tab.count }}</view>
      </view>
    </view>

    <!-- 课程列表 -->
    <view class="course-list">
      <view v-for="item in currentList" :key="item.id" class="course-item" @tap="goDetail(item.courseId)">
        <view class="item-left" :style="{ background: getTypeBg(item.type) }">
          <text class="item-type">{{ item.type }}</text>
        </view>
        <view class="item-content">
          <view class="item-header">
            <text class="item-title">{{ item.name }}</text>
            <text class="item-status" :class="item.statusClass">{{ item.statusLabel }}</text>
          </view>
          <text class="item-time">{{ item.date }} {{ item.time }}</text>
          <text class="item-venue">📍 {{ item.venue }}</text>
          <view class="item-bottom">
            <text class="item-trainer">{{ item.trainer }}</text>
            <view v-if="currentTab === 'upcoming'" class="checkin-status pending">
              <text>待签到</text>
            </view>
            <view v-if="currentTab === 'completed' && item.checkedIn" class="checkin-status done">
              <text>✓ 已签到</text>
            </view>
            <view v-if="currentTab === 'completed' && !item.checkedIn" class="checkin-status missed">
              <text>缺勤</text>
            </view>
            <view v-if="currentTab === 'completed' && !item.reviewed" class="action-btn review" @tap.stop="handleReview(item)">
              <text>去评价</text>
            </view>
            <view v-if="currentTab === 'completed' && item.reviewed" class="reviewed-tag">
              <text>已评价</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="currentList.length === 0" class="empty">
        <text class="empty-icon">📋</text>
        <text class="empty-text">{{ emptyText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listMyOrders, type OrderItem } from '@/api/order'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const currentTab = ref('upcoming')
const loading = ref(false)

const upcomingCourses = ref<any[]>([])
const completedCourses = ref<any[]>([])
const cancelledCourses = ref<any[]>([])

const tabs = computed(() => [
  { value: 'upcoming', label: '即将开始', count: upcomingCourses.value.length },
  { value: 'completed', label: '已完成', count: completedCourses.value.length },
  { value: 'cancelled', label: '已取消', count: cancelledCourses.value.length },
])

const currentList = computed(() => {
  if (currentTab.value === 'upcoming') return upcomingCourses.value
  if (currentTab.value === 'completed') return completedCourses.value
  return cancelledCourses.value
})

const emptyText = computed(() => {
  if (currentTab.value === 'upcoming') return '暂无即将开始的课程'
  if (currentTab.value === 'completed') return '暂无已完成课程'
  return '暂无取消记录'
})

const ORDER_TYPE_LABEL: Record<string, string> = {
  COURSE: '课程报名',
  WAITLIST: '候补',
  MEMBER_CARD: '会员卡',
}

function formatDate(d?: string) {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function mapOrder(o: OrderItem) {
  const course = o.course || {}
  const start = course.startTime || ''
  const end = course.endTime || ''
  return {
    id: o.id,
    courseId: o.courseId,
    name: course.title || ORDER_TYPE_LABEL[o.orderType] || '订单',
    type: ORDER_TYPE_LABEL[o.orderType] || '课程',
    date: formatDate(course.startDate),
    time: start && end ? `${start}-${end}` : start,
    venue: course.venue?.name || '',
    trainer: course.trainer?.displayName || '',
    status: o.status,
    checkedIn: false,
    reviewed: false,
  }
}

async function loadOrders() {
  if (!userStore.isLoggedIn) {
    upcomingCourses.value = []
    completedCourses.value = []
    cancelledCourses.value = []
    return
  }
  loading.value = true
  try {
    const orders = await listMyOrders()
    const courseOrders = (orders || []).filter((o) => o.orderType !== 'MEMBER_CARD')
    upcomingCourses.value = courseOrders
      .filter((o) => o.status === 'PAID')
      .map((o) => ({ ...mapOrder(o), statusLabel: '即将开始', statusClass: 'upcoming' }))
    completedCourses.value = courseOrders
      .filter((o) => o.status === 'COMPLETED')
      .map((o) => ({ ...mapOrder(o), statusLabel: '已完成', statusClass: 'done' }))
    cancelledCourses.value = courseOrders
      .filter((o) => ['CANCELLED', 'REFUNDING', 'REFUNDED'].includes(o.status))
      .map((o) => ({
        ...mapOrder(o),
        statusLabel: o.status === 'REFUNDED' ? '已退款' : o.status === 'REFUNDING' ? '退款中' : '已取消',
        statusClass: 'cancelled',
      }))
  } catch (e) {
    // 错误已由 request 统一提示
  } finally {
    loading.value = false
  }
}

onShow(() => {
  loadOrders()
})

function getTypeBg(type: string) {
  const map: Record<string, string> = { '课程报名': '#6B463C', '候补': '#4A6741', '会员卡': '#B8860B' }
  return map[type] || '#6B463C'
}

function goDetail(id?: string) {
  if (!id) return
  uni.navigateTo({ url: `/pages/course-detail/index?id=${id}` })
}

function handleReview(item: any) {
  uni.showModal({
    title: '课程评价',
    editable: true,
    placeholderText: '分享你的体验感受...',
    confirmText: '提交',
    confirmColor: '#6B463C',
    success: (res) => {
      if (res.confirm) {
        item.reviewed = true
        uni.showToast({ title: '评价已提交', icon: 'success' })
      }
    }
  })
}
</script>

<style scoped>
.page { min-height: 100vh; background: #F5E8D8; padding-bottom: 120rpx; }
.nav-bar { padding: 24rpx 32rpx; }
.nav-title { font-size: 36rpx; font-weight: 700; color: #4B3621; }

.tab-bar { display: flex; padding: 0 32rpx 24rpx; gap: 24rpx; }
.tab-item { position: relative; padding: 12rpx 0; font-size: 28rpx; color: #A08A72; }
.tab-item.active { color: #4B3621; font-weight: 600; border-bottom: 4rpx solid #6B463C; }
.tab-badge { position: absolute; top: 0; right: -20rpx; font-size: 18rpx; background: #6B463C; color: #FFF; width: 32rpx; height: 32rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

.course-list { padding: 0 32rpx; }
.course-item { background: #FFF; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx; display: flex; gap: 20rpx; }
.item-left { width: 80rpx; height: 80rpx; border-radius: 16rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.item-type { font-size: 20rpx; color: #FFF; text-align: center; line-height: 1.2; }
.item-content { flex: 1; }
.item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8rpx; }
.item-title { font-size: 28rpx; font-weight: 600; color: #4B3621; flex: 1; }
.item-status { font-size: 22rpx; padding: 4rpx 12rpx; border-radius: 8rpx; flex-shrink: 0; }
.item-status.upcoming { background: #E8F5E9; color: #27AE60; }
.item-status.done { background: #F5E8D8; color: #A08A72; }
.item-status.cancelled { background: #FFEBEE; color: #C0392B; }
.item-time { font-size: 24rpx; color: #7D665C; display: block; margin-bottom: 4rpx; }
.item-venue { font-size: 24rpx; color: #7D665C; display: block; margin-bottom: 12rpx; }
.item-bottom { display: flex; justify-content: space-between; align-items: center; }
.item-trainer { font-size: 24rpx; color: #A08A72; }
.action-btn { background: #6B463C; padding: 8rpx 24rpx; border-radius: 20rpx; }
.action-btn text { color: #FFF; font-size: 22rpx; }
.action-btn.review { background: #F5E8D8; }
.action-btn.review text { color: #6B463C; }
.reviewed-tag { background: #F0F0F0; padding: 8rpx 24rpx; border-radius: 20rpx; }
.reviewed-tag text { color: #999; font-size: 22rpx; }
.checkin-status { padding: 6rpx 16rpx; border-radius: 16rpx; font-size: 20rpx; }
.checkin-status.pending { background: #FFF3E0; color: #A08A72; }
.checkin-status.done { background: #E8F5E9; color: #27AE60; }
.checkin-status.missed { background: #FFEBEE; color: #C0392B; }

.empty { text-align: center; padding: 80rpx 0; }
.empty-icon { font-size: 60rpx; display: block; margin-bottom: 16rpx; }
.empty-text { font-size: 28rpx; color: #A08A72; }
</style>
