<template>
  <view class="page">
    <view class="nav-bar">
      <text class="nav-title serif">{{ t('myCourses.title') }}</text>
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
          <text class="item-venue">{{ item.venue }}</text>
          <view class="item-bottom">
            <text class="item-trainer">{{ item.trainer }}</text>
            <view v-if="currentTab === 'upcoming'" class="checkin-status pending">
              <text>{{ t('myCourses.pending') }}</text>
            </view>
            <view v-if="currentTab === 'completed' && item.checkedIn" class="checkin-status done">
              <text>{{ t('myCourses.checkedIn') }}</text>
            </view>
            <view v-if="currentTab === 'completed' && !item.checkedIn" class="checkin-status missed">
              <text>{{ t('myCourses.missed') }}</text>
            </view>
            <view v-if="currentTab === 'completed' && item.checkedIn && !item.reviewed" class="action-btn review" @tap.stop="handleReview(item)">
              <text>{{ t('myCourses.review') }}</text>
            </view>
            <view v-if="currentTab === 'completed' && item.checkedIn && item.reviewed" class="reviewed-tag">
              <text>{{ t('myCourses.reviewed') }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="currentList.length === 0" class="empty">
        <text class="empty-text">{{ emptyText }}</text>
      </view>
    </view>

    <view class="tabbar-space"></view>
    <floating-tab-bar active="courses" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listMyOrders, type OrderItem } from '@/api/order'
import { listMyReviews, submitReview } from '@/api/review'
import { useUserStore } from '@/stores/user'
import { t } from '@/locale'
import FloatingTabBar from '@/components/FloatingTabBar.vue'

const userStore = useUserStore()
const currentTab = ref('upcoming')
const loading = ref(false)

const upcomingCourses = ref<any[]>([])
const completedCourses = ref<any[]>([])
const cancelledCourses = ref<any[]>([])

const tabs = computed(() => [
  { value: 'upcoming', label: t('myCourses.upcoming'), count: upcomingCourses.value.length },
  { value: 'completed', label: t('myCourses.completed'), count: completedCourses.value.length },
  { value: 'cancelled', label: t('myCourses.cancelled'), count: cancelledCourses.value.length },
])

const currentList = computed(() => {
  if (currentTab.value === 'upcoming') return upcomingCourses.value
  if (currentTab.value === 'completed') return completedCourses.value
  return cancelledCourses.value
})

const emptyText = computed(() => {
  if (currentTab.value === 'upcoming') return t('myCourses.emptyUpcoming')
  if (currentTab.value === 'completed') return t('myCourses.emptyCompleted')
  return t('myCourses.emptyCancelled')
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
    // 标记已评价的课程
    try {
      const myReviews = await listMyReviews()
      const reviewedSet = new Set((myReviews || []).map((r) => r.courseId))
      completedCourses.value.forEach((c) => {
        if (c.courseId && reviewedSet.has(c.courseId)) c.reviewed = true
      })
    } catch (e) {
      // 忽略评价状态加载失败，不影响列表展示
    }
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
  const map: Record<string, string> = { '课程报名': '#584219', '候补': '#6D5934', '会员卡': '#C9A35C' }
  return map[type] || '#584219'
}

function goDetail(id?: string) {
  if (!id) return
  uni.navigateTo({ url: `/pages/course-detail/index?id=${id}` })
}

function handleReview(item: any) {
  if (!item?.courseId) return
  uni.showActionSheet({
    itemList: ['⭐⭐⭐⭐⭐ 非常满意', '⭐⭐⭐⭐ 满意', '⭐⭐⭐ 一般', '⭐⭐ 不满意', '⭐ 很差'],
    success: (sheet) => {
      const rating = 5 - sheet.tapIndex
      uni.showModal({
        title: '课程评价',
        editable: true,
        placeholderText: '分享你的体验感受...',
        confirmText: '提交',
        confirmColor: '#584219',
        success: async (res) => {
          if (!res.confirm) return
          try {
            await submitReview({ courseId: item.courseId, rating, content: (res.content || '').trim() })
            item.reviewed = true
            uni.showToast({ title: '评价已提交', icon: 'success' })
          } catch (e) {
            // 错误已由 request 统一提示
          }
        },
      })
    },
  })
}
</script>

<style scoped>
.page { min-height: 100vh; background: #EAE0D7; }
.nav-bar { padding: 32rpx 32rpx 20rpx; }
.nav-title { font-size: 40rpx; color: #3F2F10; }

.tab-bar { display: flex; padding: 8rpx 32rpx 28rpx; gap: 20rpx; }
.tab-item { position: relative; padding: 10rpx 28rpx; font-size: 26rpx; color: #6D5934; background: #F4EEE6; border-radius: 999rpx; letter-spacing: 1rpx; }
.tab-item.active { color: #F7F2E9; font-weight: 500; background: #584219; }
.tab-badge { position: absolute; top: -8rpx; right: -6rpx; font-size: 18rpx; background: #D3956E; color: #FFF; min-width: 30rpx; height: 30rpx; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; padding: 0 6rpx; }

.course-list { padding: 0 32rpx; }
.course-item { background: #FBF8F3; border-radius: 44rpx; padding: 28rpx; margin-bottom: 24rpx; display: flex; gap: 22rpx; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.course-item:active { transform: scale(0.98); }
.item-left { width: 84rpx; height: 84rpx; border-radius: 26rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.item-type { font-size: 20rpx; color: #F7F2E9; text-align: center; line-height: 1.3; letter-spacing: 1rpx; }
.item-content { flex: 1; }
.item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10rpx; }
.item-title { font-size: 30rpx; font-weight: 600; letter-spacing: 1rpx; color: #3F2F10; flex: 1; }
.item-status { font-size: 22rpx; padding: 4rpx 18rpx; border-radius: 999rpx; flex-shrink: 0; letter-spacing: 1rpx; }
.item-status.upcoming { background: rgba(211, 149, 110, 0.16); color: #B06A3F; }
.item-status.done { background: rgba(88, 66, 25, 0.08); color: #6D5934; }
.item-status.cancelled { background: rgba(167, 142, 112, 0.14); color: #A78E70; }
.item-time { font-size: 24rpx; color: #6D5934; display: block; margin-bottom: 6rpx; }
.item-venue { font-size: 24rpx; color: #6D5934; display: block; margin-bottom: 14rpx; }
.item-bottom { display: flex; justify-content: space-between; align-items: center; }
.item-trainer { font-size: 24rpx; color: #A78E70; }
.action-btn { background: #584219; padding: 8rpx 28rpx; border-radius: 999rpx; }
.action-btn text { color: #F7F2E9; font-size: 22rpx; letter-spacing: 1rpx; }
.action-btn.review { background: rgba(211, 149, 110, 0.16); }
.action-btn.review text { color: #B06A3F; }
.reviewed-tag { background: rgba(88, 66, 25, 0.08); padding: 8rpx 28rpx; border-radius: 999rpx; }
.reviewed-tag text { color: #A78E70; font-size: 22rpx; }
.checkin-status { padding: 6rpx 20rpx; border-radius: 999rpx; font-size: 20rpx; letter-spacing: 1rpx; }
.checkin-status.pending { background: rgba(211, 149, 110, 0.16); color: #B06A3F; }
.checkin-status.done { background: rgba(88, 66, 25, 0.08); color: #584219; }
.checkin-status.missed { background: rgba(167, 142, 112, 0.14); color: #A78E70; }

.empty { text-align: center; padding: 120rpx 0; }
.empty-text { font-size: 28rpx; color: #A78E70; letter-spacing: 1rpx; }
</style>
