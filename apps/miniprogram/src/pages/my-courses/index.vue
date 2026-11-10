<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="page-heading" :style="{ paddingTop: headerTop + 'px' }"><text class="eyebrow latin">MY BOOKINGS</text><text class="page-title serif">{{ t('myCourses.title') }}</text><text class="page-subtitle">{{ tr('每一次预约，都是留给自己的时间', 'Every booking is time set aside for yourself') }}</text></view>
    <PageState v-if="!userStore.isLoggedIn" state="guest" :title="tr('你的在场时刻，都在这里', 'Your Presence moments live here')" :message="tr('登录后查看课程安排和待支付订单。', 'Log in to view your schedule and unpaid orders.')" :action="tr('去登录', 'Log in')" @action="goLogin" />
    <template v-else>
      <PageState v-if="loading && !allOrders.length" state="loading" />
      <view v-if="loadError" class="error-wrap"><PageState state="error" :title="tr('预约记录暂时未能更新', 'Bookings could not be refreshed')" :message="tr('请检查网络后重试，订单状态以服务端为准。', 'Check your connection and retry. Order status is confirmed by the server.')" :action="tr('重新加载', 'Retry')" @action="loadOrders()" /></view>
      <!-- 待支付置顶于全部分段之前，续付以服务端截止时间为准 -->
      <view v-if="pendingOrders.length" class="pending-wrap">
        <view v-for="o in pendingOrders" :key="o.id" class="pending-card">
          <view class="pending-head"><view class="pending-tag"><PresenceIcon name="clock" :size="32" /><text>{{ tr('待支付', 'Payment due') }}{{ pendingOrders.length > 1 ? tr(` · ${pendingOrders.length} 笔`, ` · ${pendingOrders.length} orders`) : '' }}</text></view><text class="pending-countdown latin" :class="{ urgent: remainingSeconds(o) <= 60 }">{{ remainingText(o) }}</text></view>
          <text class="pending-title serif">{{ o.name }}</text><text class="pending-meta">{{ o.date }} {{ o.time }}{{ o.venue ? ' · ' + o.venue : '' }}</text>
          <view class="pending-info"><text class="muted">{{ tr('应付金额', 'Amount due') }}</text><text class="pending-amount latin">¥{{ fenToYuan(o.actualPaid) }}</text></view>
          <text class="pending-no">{{ tr('订单', 'Order') }} {{ o.orderNo }}</text>
          <view class="pending-actions"><button class="btn-secondary" :disabled="!!busyOrder" @tap="cancelTarget = o">{{ tr('取消订单', 'Cancel order') }}</button><button class="btn-primary" :disabled="!!busyOrder || remainingSeconds(o) <= 0" :loading="busyOrder === o.id" @tap="handleContinuePay(o)">{{ remainingSeconds(o) <= 0 ? tr('正在自动取消', 'Cancelling') : tr('继续支付', 'Continue payment') }}</button></view>
          <text class="pending-tip">{{ remainingSeconds(o) <= 0 ? tr('订单已超时，正在取消。', 'Order expired. Cancelling.') : tr('请在倒计时内完成支付。', 'Please pay before the countdown ends.') }}</text>
        </view>
      </view>
      <view class="tab-bar" role="tablist" :aria-label="tr('预约状态', 'Booking status')"><button v-for="tab in tabs" :key="tab.value" role="tab" :aria-selected="currentTab === tab.value" class="tab-item" :class="{ active: currentTab === tab.value }" @tap="currentTab = tab.value">{{ tab.label }}<text v-if="tab.count" class="tab-count">{{ tab.count }}</text></button></view>
      <view class="course-list">
        <view v-for="item in currentList" :key="item.id" class="booking-card">
          <view class="booking-main" role="link" tabindex="0" @tap="goDetail(item.courseId)" @keydown.enter="goDetail(item.courseId)"><view class="date-block"><text class="date-month">{{ item.month }}</text><text class="date-day latin">{{ item.day }}</text><text class="date-week">{{ item.weekday }}</text></view><view class="booking-body"><view class="booking-top"><text class="order-type">{{ item.type }}</text><text class="status-label">{{ item.statusLabel }}</text></view><text class="booking-title serif">{{ item.name }}</text><text class="booking-meta">{{ item.time || tr('时间待确认', 'Time TBC') }}</text><text class="booking-meta">{{ item.venue || tr('场地待确认', 'Venue TBC') }}{{ item.trainer ? ' · ' + item.trainer : '' }}</text></view></view>
          <view class="booking-footer"><text class="muted">{{ footerHint(item) }}</text><view class="footer-actions"><button v-if="canCancelPaid(item)" class="cancel-link" :disabled="!!busyOrder" @tap="openCancelPaid(item)">{{ tr('取消预约', 'Cancel booking') }}</button><button v-if="canReviewOrder(item)" class="small-button" @tap="openReview(item)">{{ tr('写评价', 'Write a review') }}</button><text v-else-if="item.reviewed && reviewsLoaded && item.status === 'COMPLETED'" class="muted">{{ tr('已评价', 'Reviewed') }}</text><button v-else-if="item.courseId" class="detail-button" @tap="goDetail(item.courseId)">{{ tr('查看课程 ›', 'View course ›') }}</button></view></view>
        </view>
        <PageState v-if="!loading && !loadError && !currentList.length" state="empty" :title="emptyText" :message="tr('想来在场的时候，随时去看看新课程。', 'Whenever you feel like being present, explore a new course.')" :action="currentTab === 'upcoming' ? tr('发现好课', 'Explore courses') : undefined" @action="goHome" />
      </view>
    </template>
    <BottomSheet :show="!!cancelTarget" :title="tr('取消待支付订单', 'Cancel unpaid order')" :busy="!!busyOrder" @close="cancelTarget = null"><view class="sheet-copy"><text class="sheet-course serif">{{ cancelTarget?.name }}</text><text>{{ tr('取消后将释放名额。', 'Cancelling releases the seat.') }}</text></view><template #actions><view class="sheet-action-row"><button class="btn-secondary row-btn" :disabled="!!busyOrder" @tap="cancelTarget = null">{{ tr('再想想', 'Not now') }}</button><button class="btn-primary row-btn" :disabled="!!busyOrder" :loading="!!busyOrder" @tap="confirmCancel">{{ tr('确认取消', 'Confirm cancellation') }}</button></view></template></BottomSheet>
    <BottomSheet :show="!!cancelPaidTarget" :title="tr('取消预约并申请退款', 'Cancel booking and request refund')" :busy="!!busyOrder" @close="cancelPaidTarget = null"><view class="sheet-copy"><text class="sheet-course serif">{{ cancelPaidTarget?.name }}</text><text v-if="cancelPaidTarget?.orderType === 'WAITLIST'">{{ tr('预付款将全额退回。', 'Your prepayment is refunded in full.') }}</text><text v-else-if="cancelRefundPreview && !cancelRefundPreview.fullRefund">{{ tr(`由于课程退款政策，本次可退金额为 ¥${fenToYuan(cancelRefundPreview.refundFen)}（实付 ¥${fenToYuan(cancelRefundPreview.totalFen)}），其余部分不予退还。`, `Due to the course refund policy, only ¥${fenToYuan(cancelRefundPreview.refundFen)} of ¥${fenToYuan(cancelRefundPreview.totalFen)} paid is refundable.`) }}</text><text v-else-if="cancelRefundPreview">{{ tr('取消后名额立即释放，实付金额将全额退回。', 'The seat is released immediately and your payment is refunded in full.') }}</text><text v-else>{{ tr('取消后名额立即释放，退款按课程退款规则核算。', 'The seat is released immediately and the refund follows the course refund policy.') }}</text></view><template #actions><view class="sheet-action-row"><button class="btn-secondary row-btn" :disabled="!!busyOrder" @tap="cancelPaidTarget = null">{{ tr('再想想', 'Not now') }}</button><button class="btn-primary row-btn" :disabled="!!busyOrder" :loading="!!busyOrder" @tap="confirmCancelPaid">{{ tr('确认取消', 'Confirm cancellation') }}</button></view></template></BottomSheet>
    <BottomSheet :show="!!reviewTarget" :title="tr('分享这次在场体验', 'Share your Presence experience')" :busy="reviewBusy" @close="reviewTarget = null"><text class="sheet-course serif">{{ reviewTarget?.name }}</text><view class="rating-row"><button v-for="n in 5" :key="n" class="rating-button" :aria-label="tr(`${n}分`, `${n} points`)" :aria-pressed="rating === n" @tap="rating = n"><PresenceIcon name="star" :size="56" :filled="n <= rating" :color="n <= rating ? '#96581c' : '#cfc4a8'" /></button></view><text class="rating-label">{{ rating }} / 5 {{ tr('分', 'points') }}</text><textarea v-model="reviewContent" class="review-input" :placeholder="tr('这一节课，带给你怎样的感受？', 'How did this session feel to you?')" :maxlength="1000" :disabled="reviewBusy" /><text class="review-count">{{ reviewContent.length }} / 1000</text><template #actions><view class="sheet-action-row"><button class="btn-primary row-btn" :disabled="reviewBusy || !reviewContent.trim()" :loading="reviewBusy" @tap="confirmReview">{{ tr('提交评价', 'Submit review') }}</button></view></template></BottomSheet>
    <view class="tabbar-space"></view><FloatingTabBar active="courses" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow, onHide, onUnload, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { listMyOrders, cancelOrder, previewOrderRefund, type OrderItem } from '@/api/order'
import { listMyWaitlist } from '@/api/waitlist'
import { listMyReviews, submitReview } from '@/api/review'
import { payOrder, isOrderPaid } from '@/utils/wechat'
import { paymentSeconds, attendanceLabel, canReviewOrder } from '@/utils/presence-view'
import { useUserStore } from '@/stores/user'
import { t, tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import FloatingTabBar from '@/components/FloatingTabBar.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'
import PageState from '@/components/PageState.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { brandShareMessage, brandShareTimeline } from '@/utils/share'

const userStore = useUserStore()
const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const currentTab = ref('upcoming')
const loading = ref(false)
const loadError = ref(false)
const allOrders = ref<OrderItem[]>([])
/** courseId → 当前真实候补位次（仅排队中的条目） */
const waitlistQueues = ref<Map<string, { position: number; ahead: number; size: number }>>(new Map())
const reviewedIds = ref<Set<string>>(new Set())
const reviewsLoaded = ref(false)
const nowTs = ref(Date.now())
const busyOrder = ref('')
const cancelTarget = ref<any>(null)
const cancelPaidTarget = ref<any>(null)
/** 取消弹窗的退款预览（打开时拉取；null=加载中/失败，弹窗回退到通用文案） */
const cancelRefundPreview = ref<{ fullRefund: boolean; refundFen: number; totalFen: number; percent: number } | null>(null)
const reviewTarget = ref<any>(null)
const rating = ref(5)
const reviewContent = ref('')
const reviewBusy = ref(false)
let visible = false
let requestId = 0
let timer: ReturnType<typeof setInterval> | null = null
let expiryReloadTimer: ReturnType<typeof setTimeout> | null = null
const paymentRefreshTimers: ReturnType<typeof setTimeout>[] = []
let expiredHandled = false
const ORDER_TYPE_LABEL: Record<string, string> = { COURSE: '课程报名', WAITLIST: '候补预约', MEMBER_CARD: '会员卡', COMMUNITY: '社群年费' }
const ORDER_TYPE_LABEL_EN: Record<string, string> = { COURSE: 'Course booking', WAITLIST: 'Waitlist', MEMBER_CARD: 'Member card', COMMUNITY: 'Community membership' }
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function orderTypeLabel(type: string) {
  const labels = isEnglish() ? ORDER_TYPE_LABEL_EN : ORDER_TYPE_LABEL
  return labels[type] || (isEnglish() ? 'Booking' : '预约')
}
function statusText(status: string, orderType: string) {
  if (status === 'PAID') return orderType === 'WAITLIST' ? tr('已支付', 'Paid') : tr('待上课', 'Upcoming')
  const labels = isEnglish()
    ? { COMPLETED: 'Completed', CANCELLED: 'Cancelled', REFUNDING: 'Refunding', REFUNDED: 'Refunded' }
    : { COMPLETED: '已完成', CANCELLED: '已取消', REFUNDING: '退款中', REFUNDED: '已退款' }
  return (labels as Record<string, string>)[status] || tr('待支付', 'Payment due')
}
function mapOrder(o: OrderItem) {
  const course = o.course || {}
  const date = new Date(course.startDate)
  const validDate = Number.isFinite(date.getTime())
  const raw = o as OrderItem & { checkedIn?: boolean }
  // 候补中的已支付订单展示真实位次，避免误以为已经报名成功
  const queue = o.orderType === 'WAITLIST' && o.status === 'PAID' ? waitlistQueues.value.get(o.courseId || '') : null
  const statusLabel = queue
    ? tr(`候补中 · 第 ${queue.position} 位`, `Waitlisted · #${queue.position}`)
    : statusText(o.status, o.orderType)
  // 开课时刻 = startDate + startTime，用于判断是否仍可自助取消/退款
  const startAt = validDate ? new Date(date.getTime()) : null
  const startClock = /^(\d{1,2}):(\d{2})/.exec(String(course.startTime || ''))
  if (startAt && startClock) startAt.setHours(Number(startClock[1]), Number(startClock[2]), 0, 0)
  const startAtMs = startAt && Number.isFinite(startAt.getTime()) ? startAt.getTime() : 0
  return {
    id: o.id,
    courseId: o.courseId,
    name: course.title || o.courseName || orderTypeLabel(o.orderType) || tr('订单', 'Order'),
    type: orderTypeLabel(o.orderType),
    date: validDate ? (isEnglish() ? `${MONTHS_EN[date.getMonth()]} ${date.getDate()}` : `${date.getMonth() + 1}月${date.getDate()}日`) : '',
    month: validDate ? (isEnglish() ? MONTHS_EN[date.getMonth()] : `${date.getMonth() + 1}月`) : tr('待定', 'TBC'),
    day: validDate ? String(date.getDate()).padStart(2, '0') : '—',
    weekday: validDate ? (isEnglish() ? WEEKDAYS_EN[date.getDay()] : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]) : '',
    time: course.startTime ? `${course.startTime}${course.endTime ? '–' + course.endTime : ''}` : '',
    venue: course.venue?.name || '',
    trainer: course.trainer?.displayName || '',
    orderNo: o.orderNo || '',
    orderType: o.orderType,
    actualPaid: Number(o.actualPaid) || 0,
    expireAt: o.expireAt || '',
    startAtMs,
    status: o.status,
    statusLabel,
    waitlistAhead: queue ? queue.ahead : null,
    checkedIn: typeof raw.checkedIn === 'boolean' ? raw.checkedIn : undefined,
    reviewed: !reviewsLoaded.value || reviewedIds.value.has(o.courseId || ''),
  }
}
const courseOrders = computed(() => allOrders.value.filter(o => o.orderType === 'COURSE' || o.orderType === 'WAITLIST').map(mapOrder))
const pendingOrders = computed(() => courseOrders.value.filter(o => o.status === 'PENDING_PAYMENT').sort((a, b) => Date.parse(a.expireAt || '') - Date.parse(b.expireAt || '')))
const upcomingCourses = computed(() => courseOrders.value.filter(o => o.status === 'PAID'))
const completedCourses = computed(() => courseOrders.value.filter(o => o.status === 'COMPLETED'))
const cancelledCourses = computed(() => courseOrders.value.filter(o => ['CANCELLED', 'REFUNDING', 'REFUNDED'].includes(o.status)))
const tabs = computed(() => [{ value: 'upcoming', label: t('myCourses.upcoming'), count: upcomingCourses.value.length }, { value: 'completed', label: t('myCourses.completed'), count: completedCourses.value.length }, { value: 'cancelled', label: t('myCourses.cancelled'), count: cancelledCourses.value.length }])
const currentList = computed(() => currentTab.value === 'upcoming' ? upcomingCourses.value : currentTab.value === 'completed' ? completedCourses.value : cancelledCourses.value)
const emptyText = computed(() => currentTab.value === 'upcoming'
  ? tr('还没有待上课的预约', 'No upcoming bookings yet')
  : currentTab.value === 'completed'
    ? tr('还没有完成的课程', 'No completed courses yet')
    : tr('还没有取消或退款记录', 'No cancellations or refunds yet'))
function fenToYuan(value: number) { return (value / 100).toFixed(2) }
function remainingSeconds(o: { expireAt: string }) { return paymentSeconds(o.expireAt, nowTs.value) }
function remainingText(o: { expireAt: string }) {
  const seconds = remainingSeconds(o)
  return seconds <= 0 ? tr('已超时', 'Expired') : tr(`剩 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} left`)
}
/** 仅未开课的已支付订单允许自助取消/退款；开始后由后台强制退款通道处理 */
function canCancelPaid(item: { status: string; startAtMs?: number }) {
  return item.status === 'PAID' && (!item.startAtMs || Date.now() < item.startAtMs)
}
function footerHint(item: { status: string; startAtMs?: number; checkedIn?: boolean; orderType?: string; waitlistAhead?: number | null }) {
  if (item.orderType === 'WAITLIST' && item.status === 'PAID') {
    if (item.waitlistAhead == null) return tr('候补排队中', 'On the waitlist')
    return (item.waitlistAhead as number) > 0
      ? tr(`前面还有 ${item.waitlistAhead} 人`, `${item.waitlistAhead} ahead of you`)
      : tr('已排在最前', 'First in line')
  }
  if (item.status === 'COMPLETED') return attendanceLabel(item as any, isEnglish() ? 'en' : 'zh')
  if (item.status === 'PAID') return canCancelPaid(item) ? tr('详细安排请查看课程', 'See the course for full details') : tr('课程已开始', 'Course started')
  if (item.status === 'REFUNDING') return tr('退款处理中，到账时间以支付渠道为准', 'Refund processing; arrival time depends on the payment channel')
  if (item.status === 'REFUNDED') return tr('退款已完成，到账时间以支付渠道为准', 'Refund completed; arrival time depends on the payment channel')
  return tr('订单记录已保留', 'Order record retained')
}
function stopTicker() { if (timer) clearInterval(timer); if (expiryReloadTimer) clearTimeout(expiryReloadTimer); timer = null; expiryReloadTimer = null }
function scheduleExpiryRefresh() { if (expiryReloadTimer || !visible) return; expiryReloadTimer = setTimeout(() => { expiryReloadTimer = null; if (visible) loadOrders(true) }, 6000) }
function startTicker() {
  stopTicker()
  if (!visible || !pendingOrders.value.length) return
  timer = setInterval(() => {
    nowTs.value = Date.now()
    if (pendingOrders.value.some(o => remainingSeconds(o) <= 0)) {
      if (!expiredHandled) { expiredHandled = true; uni.showToast({ title: tr('订单已超时，正在取消', 'Order expired. Cancelling.'), icon: 'none' }) }
      scheduleExpiryRefresh()
    }
  }, 1000)
}
/** 候补位次由候补接口计算（转正/退出后实时变化），与订单列表分开加载。 */
async function loadWaitlistQueues(currentRequest: number) {
  try {
    const entries = await listMyWaitlist()
    if (currentRequest !== requestId) return
    const map = new Map<string, { position: number; ahead: number; size: number }>()
    for (const entry of entries || []) {
      if (entry.status === 'WAITING' && entry.queuePosition) {
        map.set(entry.courseId, { position: entry.queuePosition, ahead: entry.aheadCount ?? 0, size: entry.queueSize ?? 0 })
      }
    }
    waitlistQueues.value = map
  } catch {
    if (currentRequest === requestId) waitlistQueues.value = new Map()
  }
}
async function loadOrders(quiet = false) {
  const currentRequest = ++requestId
  if (!userStore.isLoggedIn) { allOrders.value = []; waitlistQueues.value = new Map(); reviewedIds.value = new Set(); reviewsLoaded.value = false; loading.value = false; loadError.value = false; stopTicker(); return }
  if (!quiet) loading.value = true
  try {
    const orders = await listMyOrders()
    if (currentRequest !== requestId) return
    allOrders.value = orders || []; loadError.value = false; nowTs.value = Date.now()
    void loadWaitlistQueues(currentRequest)
    if (!pendingOrders.value.some(o => remainingSeconds(o) <= 0)) expiredHandled = false
    try { const reviews = await listMyReviews(); if (currentRequest === requestId) { reviewedIds.value = new Set(reviews.map(r => r.courseId)); reviewsLoaded.value = true } } catch { reviewsLoaded.value = false }
  } catch { if (currentRequest === requestId) { loadError.value = true; if (!uni.getStorageSync('token')) { userStore.logout(); allOrders.value = [] } } }
  finally { if (currentRequest === requestId) { loading.value = false; nowTs.value = Date.now(); startTicker() } }
}
async function handleContinuePay(o: any) {
  if (busyOrder.value) return
  nowTs.value = Date.now()
  if (remainingSeconds(o) <= 0) { uni.showToast({ title: tr('订单已超时，请重新预约', 'Order expired. Please book again.'), icon: 'none' }); loadOrders(true); return }
  busyOrder.value = o.id
  try {
    await payOrder(o.id)
    uni.showToast({ title: tr('支付结果正在同步', 'Syncing payment result'), icon: 'none' })
    for (const delay of [800, 2200]) paymentRefreshTimers.push(setTimeout(() => { if (visible) loadOrders(true) }, delay))
  } catch (error: any) {
    const message = String(error?.errMsg || error?.message || '')
    // 微信回调丢失/晚到时不直接判失败，先核对订单真实状态
    if (!message.includes('cancel') && await isOrderPaid(o.id)) {
      uni.showToast({ title: tr('支付结果正在同步', 'Syncing payment result'), icon: 'none' })
      for (const delay of [800, 2200]) paymentRefreshTimers.push(setTimeout(() => { if (visible) loadOrders(true) }, delay))
      return
    }
    if (message.includes('cancel')) uni.showToast({ title: tr('支付未完成，可在倒计时内继续支付', 'Payment incomplete. You can continue before the countdown ends.'), icon: 'none' })
    else if (message.includes('超时')) { uni.showToast({ title: tr('订单已超时，请重新预约', 'Order expired. Please book again.'), icon: 'none' }); loadOrders(true) }
    else uni.showToast({ title: tr('支付未完成，请稍后重试', 'Payment incomplete. Please retry later.'), icon: 'none' })
  } finally { busyOrder.value = '' }
}
async function confirmCancel() {
  if (!cancelTarget.value || busyOrder.value) return
  busyOrder.value = cancelTarget.value.id
  try { await cancelOrder(cancelTarget.value.id, '用户取消待支付订单'); cancelTarget.value = null; uni.showToast({ title: tr('订单已取消', 'Order cancelled'), icon: 'none' }); await loadOrders(true) } catch { /* 请求层展示真实失败原因 */ } finally { busyOrder.value = '' }
}
function openReview(item: any) { if (!item.courseId || !canReviewOrder(item)) return; reviewTarget.value = item; rating.value = 5; reviewContent.value = '' }
function openCancelPaid(item: any) {
  if (busyOrder.value || !canCancelPaid(item)) return
  cancelPaidTarget.value = item
  // 拉取退款预览：非全额时在弹窗里明示可退金额，用户确认后才真正发起
  cancelRefundPreview.value = null
  previewOrderRefund(item.id).then((p) => { if (cancelPaidTarget.value?.id === item.id) cancelRefundPreview.value = p }).catch(() => { if (cancelPaidTarget.value?.id === item.id) cancelRefundPreview.value = null })
}
async function confirmCancelPaid() {
  const target = cancelPaidTarget.value
  if (!target || busyOrder.value) return
  busyOrder.value = target.id
  try {
    const res: any = await cancelOrder(target.id, target.orderType === 'WAITLIST' ? '用户取消候补' : '用户取消预约')
    cancelPaidTarget.value = null
    const amount = Number(res?.refundAmount) || 0
    const title = target.orderType === 'WAITLIST'
      ? tr('候补已取消，预付款将全额退回', 'Waitlist cancelled. Prepayment will be refunded in full.')
      : amount > 0
        ? tr(`已取消，可退 ¥${fenToYuan(amount)}`, `Cancelled. ¥${fenToYuan(amount)} will be refunded.`)
        : tr('已取消，本次无可退金额', 'Cancelled. No refund is due.')
    uni.showToast({ title, icon: 'none', duration: 3000 })
    await loadOrders(true)
  } catch { /* 请求层展示真实失败原因 */ } finally { busyOrder.value = '' }
}
async function confirmReview() {
  if (reviewBusy.value || !reviewTarget.value || !reviewContent.value.trim()) return
  reviewBusy.value = true
  try { await submitReview({ courseId: reviewTarget.value.courseId, rating: rating.value, content: reviewContent.value.trim() }); reviewedIds.value = new Set([...reviewedIds.value, reviewTarget.value.courseId]); reviewTarget.value = null; uni.showToast({ title: tr('评价已提交', 'Review submitted'), icon: 'success' }) } catch { /* 保留内容以便重试 */ } finally { reviewBusy.value = false }
}
function leavePage() { visible = false; stopTicker(); paymentRefreshTimers.splice(0).forEach(clearTimeout) }
onShow(() => { visible = true; if (!uni.getStorageSync('token') && userStore.isLoggedIn) userStore.logout(); loadOrders() })
onHide(leavePage)
onUnload(() => { leavePage(); requestId++ })
function goDetail(id?: string) { if (id) uni.navigateTo({ url: `/pages/course-detail/index?id=${id}` }) }
function goLogin() { uni.switchTab({ url: '/pages/profile/index' }) }
function goHome() { uni.switchTab({ url: '/pages/index/index' }) }

const shareTitle = () => tr('Full愈 · 在场｜一起留一点时间给自己', 'Full愈 · Presence | Make a little time for yourself')
onShareAppMessage(() => brandShareMessage(shareTitle()))
// #ifdef MP-WEIXIN
onShareTimeline(() => brandShareTimeline(shareTitle()))
// #endif
</script>

<style scoped>
.page-heading { padding: 44rpx 32rpx 32rpx; }
.eyebrow { display: block; font-size: 20rpx; color: var(--c-brown); letter-spacing: 4rpx; }
.page-title { display: block; font-size: 48rpx; color: var(--c-deep); margin-top: 12rpx; }
.page-subtitle { display: block; margin-top: 14rpx; font-size: 26rpx; color: var(--c-muted); }
.pending-wrap { padding: 0 32rpx; }
.pending-card { background: #fff7df; border: 2rpx solid #e7c878; border-radius: var(--radius-card); padding: 28rpx; margin-bottom: 24rpx; }
.pending-head,.pending-tag,.pending-info,.pending-actions { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.pending-tag { justify-content: flex-start; font-size: 26rpx; font-weight: 600; color: var(--c-primary); }
.pending-countdown { font-size: 26rpx; color: var(--c-primary); padding: 6rpx 12rpx; border-radius: 12rpx; background: #f4e8c9; }
.pending-countdown.urgent { color: var(--c-error); }
.pending-title { display: block; font-size: 34rpx; color: var(--c-deep); line-height: 1.5; margin-top: 20rpx; }
.pending-meta { display: block; font-size: 24rpx; color: var(--c-muted); line-height: 1.7; margin-top: 8rpx; }
.pending-info { margin-top: 24rpx; }
.pending-amount { font-size: 42rpx; color: var(--c-primary); font-weight: 600; }
.pending-no { display: block; font-size: 22rpx; color: var(--c-muted); word-break: break-all; margin: 8rpx 0 24rpx; }
.pending-actions button { flex: 1; margin: 0; font-size: 26rpx; padding: 18rpx 10rpx; }
.pending-tip { display: block; font-size: 24rpx; color: var(--c-muted); line-height: 1.6; margin-top: 20rpx; }
.tab-bar { display: flex; gap: 8rpx; padding: 8rpx; margin: 8rpx 32rpx 28rpx; border-radius: 24rpx; background: var(--c-card-2); }
.tab-item { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8rpx; padding: 16rpx 4rpx; margin: 0; background: transparent; color: var(--c-muted); font-size: 26rpx; border-radius: 20rpx; line-height: 1.5; }
.tab-item.active { background: var(--c-primary); color: white; }
.tab-count { font-size: 22rpx; }
.course-list { padding: 0 32rpx; }
.booking-card { background: var(--c-card); border-radius: var(--radius-card); padding: 28rpx; margin-bottom: 24rpx; box-shadow: var(--shadow-card); }
.booking-main { display: flex; gap: 24rpx; align-items: flex-start; }
.date-block { width: 100rpx; flex-shrink: 0; background: var(--c-card-2); border-radius: 24rpx; padding: 16rpx 8rpx; display: flex; flex-direction: column; align-items: center; gap: 4rpx; color: var(--c-brown); }
.date-month,.date-week { font-size: 24rpx; }
.date-day { font-size: 48rpx; line-height: 1.2; }
.booking-body { min-width: 0; flex: 1; }
.booking-top { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12rpx; margin-bottom: 10rpx; }
.order-type { font-size: 24rpx; color: var(--c-muted); }
.status-label { font-size: 24rpx; color: var(--c-brown); }
.booking-title { display: block; font-size: 32rpx; line-height: 1.4; color: var(--c-deep); margin-bottom: 12rpx; }
.booking-meta { display: block; font-size: 24rpx; color: var(--c-muted); line-height: 1.7; }
.booking-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12rpx; margin-top: 24rpx; padding-top: 16rpx; border-top: 1rpx solid var(--line-soft); }
.muted { font-size: 24rpx; color: var(--c-muted); }
.footer-actions { display: flex; align-items: center; gap: 16rpx; flex-wrap: wrap; }
.cancel-link { margin: 0; padding: 10rpx 0; background: transparent; color: var(--c-error); font-size: 24rpx; line-height: 1.5; }
.detail-button { margin: 0; padding: 8rpx 0; background: transparent; color: var(--c-primary); font-size: 24rpx; }
.small-button { margin: 0; padding: 12rpx 24rpx; background: var(--c-primary); color: white; border-radius: 20rpx; font-size: 24rpx; line-height: 1.5; }
.error-wrap { padding: 0 32rpx; }
.sheet-copy { display: flex; flex-direction: column; gap: 24rpx; color: var(--c-muted); font-size: 28rpx; line-height: 1.8; padding: 16rpx 0 36rpx; }
.sheet-action-row { display: flex; align-items: center; gap: 20rpx; width: 100%; }
.sheet-action-row .row-btn { flex: 1 1 0; min-width: 0; margin: 0; }
.sheet-course { display: block; font-size: 34rpx; color: var(--c-deep); }
.rating-row { display: flex; justify-content: center; gap: 12rpx; margin-top: 28rpx; }
.rating-button { margin: 0; padding: 12rpx; background: transparent; line-height: 1; }
.rating-label { display: block; text-align: center; color: var(--c-brown); font-size: 28rpx; margin: 12rpx 0 28rpx; }
.review-input { width: 100%; height: 220rpx; padding: 24rpx; box-sizing: border-box; border-radius: 24rpx; background: var(--c-cream); color: var(--c-deep); font-size: 28rpx; }
.review-count { display: block; text-align: right; font-size: 24rpx; color: var(--c-muted); padding: 12rpx 0 28rpx; }
</style>
