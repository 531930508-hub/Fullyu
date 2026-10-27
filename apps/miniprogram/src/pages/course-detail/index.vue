<template>
  <view class="page">
    <FloatingBack />
    <view class="hero">
      <image v-if="course?.coverImage && !coverFailed" class="cover-image" :src="course.coverImage" mode="aspectFill" @error="coverFailed = true" @tap="previewCover" />
      <BrandCover v-else :label="tr('Full愈 · 在场', 'Full愈 · Presence')" height="440rpx" />
    </view>
    <PageState v-if="loading" state="loading" :title="tr('正在载入课程', 'Loading course')" />
    <PageState v-else-if="loadError" state="error" :title="tr('课程加载失败', 'Failed to load course')" :message="tr('请稍后重试，暂时无法报名。', 'Please try again later. Booking is temporarily unavailable.')" :action="tr('重新加载', 'Retry')" @action="loadDetail(courseId)" />
    <PageState v-else-if="!course" state="empty" :title="tr('课程暂不可查看', 'Course unavailable')" :action="tr('返回首页', 'Back to home')" @action="goBack" />
    <view v-else class="content">
      <view class="card title-card">
        <view class="tags">
          <text class="tag">{{ typeLabel(course.type) }}<template v-if="course.type === 'SERIES' && course.totalSessions"> · {{ tr(`${course.totalSessions}节`, `${course.totalSessions} sessions`) }}</template></text>
          <text v-for="tag in course.categories" :key="tag" class="tag">{{ tag }}</text>
          <text v-if="phaseText" class="tag status" :class="{ gold: isBookablePhase }">{{ phaseText }}</text>
          <text v-if="capacityKnown" class="tag" :class="{ gold: isFull }">{{ isFull ? tr('已约满', 'Full') : tr(`余 ${seatsLeft} 位`, `${seatsLeft} seats left`) }}</text>
        </view>
        <view class="title-row">
          <text class="course-title serif">{{ course.title }}</text>
          <button class="share-entry" :aria-label="tr('分享课程', 'Share course')" @tap="shareVisible = true">
            <PresenceIcon name="arrow" :size="28" />
            <text>{{ tr('分享', 'Share') }}</text>
          </button>
        </view>
        <text v-if="course.subtitle" class="secondary">{{ course.subtitle }}</text>
        <view v-if="course.difficulty || course.tags.length" class="tags detail-tags">
          <text v-if="course.difficulty" class="tag">{{ difficultyLabel(course.difficulty) }}</text>
          <text v-for="tag in course.tags" :key="tag" class="tag">{{ tag }}</text>
        </view>
      </view>
      <view v-if="statusMessage" class="notice"><PresenceIcon name="info" :size="32" /><text>{{ statusMessage }}</text></view>

      <view class="section-heading"><text class="serif">{{ tr('开课安排', 'Schedule') }}</text><text class="caption">Schedule</text></view>
      <view class="card">
        <view class="info-row"><PresenceIcon name="calendar" :size="34" /><view class="grow"><text>{{ formatDate(course.startDate) }} {{ course.startTime }}–{{ course.endTime }}</text><text v-if="course.duration || course.type === 'SERIES'" class="secondary">{{ course.duration ? tr(`${course.duration} 分钟`, `${course.duration} min`) : '' }}{{ course.type === 'SERIES' ? tr(' · 按系列整体报名', ' · Enrol for the full series') : '' }}</text></view></view>
        <view class="info-row"><PresenceIcon name="pin" :size="34" /><view class="grow"><text>{{ course.venue?.name || tr('场地待确认', 'Venue TBC') }}</text><text v-if="course.venue?.address" class="secondary">{{ course.venue.address }}</text></view></view>
        <view v-if="capacityKnown" class="info-row"><PresenceIcon name="users" :size="34" /><view class="grow"><text>{{ tr(`已报名 ${course.currentEnrolled} / ${course.maxCapacity} 人`, `${course.currentEnrolled} / ${course.maxCapacity} enrolled`) }}</text><text v-if="course.minCapacity" class="secondary">{{ tr(`满 ${course.minCapacity} 人开课 · ${course.currentEnrolled >= course.minCapacity ? '已达成团人数' : `还差 ${course.minCapacity - course.currentEnrolled} 人`}`, `Starts at ${course.minCapacity} · ${course.currentEnrolled >= course.minCapacity ? 'minimum reached' : `${course.minCapacity - course.currentEnrolled} more needed`}`) }}</text></view></view>
        <view v-if="course.groupDeadline" class="info-row"><PresenceIcon name="clock" :size="34" /><text class="secondary">{{ tr('成团截止', 'Group deadline') }} {{ formatDateTime(course.groupDeadline) }}</text></view>
        <text v-if="enrollDeadlineText" class="secondary">{{ tr('报名截止', 'Enrollment deadline') }} {{ enrollDeadlineText }}</text>
      </view>

      <template v-if="course.detailDesc || course.description || course.targetAudience.length || course.learningGoals || course.materials.length || course.notice || course.gallery.length">
        <view class="section-heading"><text class="serif">{{ tr('课程信息', 'About') }}</text><text class="caption">About</text></view>
        <view class="card prose">
          <rich-text v-if="course.detailDesc || course.description" :nodes="course.detailDesc || course.description" />
          <template v-if="course.targetAudience.length"><text class="subheading">{{ tr('适合谁', 'Who it is for') }}</text><text v-for="item in course.targetAudience" :key="item" class="body-line">{{ item }}</text></template>
          <template v-if="course.learningGoals"><text class="subheading">{{ tr('你会体验', 'What you will experience') }}</text><text class="body-line">{{ course.learningGoals }}</text></template>
          <template v-if="course.materials.length"><text class="subheading">{{ tr('课前准备', 'Before class') }}</text><text v-for="item in course.materials" :key="item" class="body-line">{{ item }}</text></template>
          <template v-if="course.notice"><text class="subheading">{{ tr('预约须知', 'Booking notes') }}</text><text class="body-line">{{ course.notice }}</text></template>
          <scroll-view v-if="course.gallery.length" scroll-x class="gallery-scroll"><view class="gallery-list"><image v-for="(img, index) in course.gallery" :key="img" class="gallery-image" :src="img" mode="aspectFill" @tap="previewGallery(index)" /></view></scroll-view>
        </view>
      </template>

      <view class="section-heading"><text class="serif">{{ tr('带领导师', 'Your guide') }}</text><text class="caption">Guide</text></view>
      <button v-if="course.trainer?.id" class="card trainer-card" @tap="goTrainer">
        <image v-if="course.trainer.avatar" class="avatar" :src="course.trainer.avatar" mode="aspectFill" />
        <view v-else class="avatar avatar-placeholder"><PresenceIcon name="user" :size="44" /></view>
        <view class="grow"><text class="trainer-name">{{ course.trainer.displayName || tr('导师', 'Guide') }}</text><view class="tags"><text v-if="course.trainer.title" class="tag">{{ course.trainer.title }}</text><text v-if="course.trainer.certBadge" class="tag">{{ course.trainer.certBadge }}</text><text v-if="course.trainer.seedifyCert" class="tag gold">{{ tr('Full愈认证', 'Full愈 Certified') }}</text></view><text v-if="course.trainer.bio" class="secondary trainer-bio">{{ course.trainer.bio }}</text></view>
        <PresenceIcon name="arrow" :size="30" />
      </button>
      <view v-else class="card"><text class="secondary">{{ tr('导师信息待公布', 'Guide to be announced') }}</text></view>

      <template v-if="course.type === 'SERIES'">
        <view class="section-heading"><text class="serif">{{ tr('系列课表', 'Syllabus') }}</text><text class="caption">Syllabus</text></view>
        <view class="card">
          <view v-for="(session, index) in syllabus" :key="index" class="session-row"><view class="session-index">{{ tr(`第 ${index + 1} 节`, `Session ${index + 1}`) }}</view><view class="grow"><text>{{ session.title }}</text><text v-if="session.content" class="secondary">{{ session.content }}</text><text v-if="session.date" class="secondary">{{ formatDate(session.date) }} {{ session.startTime || '' }}</text></view></view>
          <text v-if="!syllabus.length" class="secondary">{{ tr('详细课表待公布，不同课节的时间以课程通知为准。', 'The detailed syllabus will be announced. Session times are subject to course notices.') }}</text>
        </view>
      </template>

      <view class="section-heading"><text class="serif">{{ tr('价格与权益', 'Price') }}</text><text class="caption">Price</text></view>
      <view class="card">
        <view class="price-display"><text class="price latin">¥{{ toYuan(displayPrice) }}</text><text class="secondary">/ {{ course.type === 'SERIES' ? tr('系列', 'series') : tr('人', 'person') }}</text></view>
        <text class="secondary">{{ priceCaption }}</text>
        <view v-if="course.seedsReward > 0" class="kv"><text>{{ tr('每节完课奖励', 'Points per completed session') }}</text><text>{{ course.seedsReward }} {{ tr('积分', 'points') }} / {{ tr('人', 'person') }}</text></view>
        <view v-if="course.reviewSeeds > 0" class="kv"><text>{{ tr('评价奖励', 'Review reward') }}</text><text>{{ course.reviewSeeds }} {{ tr('积分', 'points') }} / {{ tr('人', 'person') }}</text></view>
      </view>

      <view class="section-heading"><text class="serif">{{ tr('退款规则', 'Refund policy') }}</text><text class="caption">Policy</text></view>
      <view class="card">
        <view v-for="(rule, index) in course.refundRules" :key="index" class="kv"><text>{{ formatRefundTime(rule) }}</text><text class="refund-value">{{ Number(rule.refundPercent) === 0 ? tr('不可退', 'Non-refundable') : tr(`退 ${rule.refundPercent}%`, `${rule.refundPercent}% refund`) }}</text></view>
        <text v-if="!course.refundRules.length" class="secondary">{{ tr('暂无退款规则展示，退款金额以取消预约时系统核算为准。', 'No refund rules are listed. The refund amount is calculated when you cancel.') }}</text>
      </view>
    </view>

    <view v-if="showBookingBar" class="bottom-bar">
      <view class="bottom-left"><text class="bottom-price latin">¥{{ toYuan(displayPrice) }}</text><text class="secondary">{{ bottomCaption }}</text></view>
      <button class="primary-btn" :class="{ 'gold-btn': isFull && !pendingOrderId }" :disabled="bookingButtonDisabled" @tap="handlePrimary">{{ primaryLabel }}</button>
    </view>

    <BottomSheet :show="bookingVisible" :title="tr('确认报名', 'Confirm booking')" :busy="busy" @close="closeBooking">
      <template v-if="currentQuote && course">
        <text class="secondary">{{ tr('下单后可在「我的预约」继续支付，超时未支付订单将自动取消。', 'You can continue payment in My Bookings. Unpaid orders are cancelled automatically after the time limit.') }}</text>
        <view class="summary-box"><text class="subheading">{{ course.title }}</text><view class="kv"><text>{{ tr('场次', 'Session') }}</text><text>{{ formatDate(course.startDate) }} {{ course.startTime }}</text></view><view class="kv"><text>{{ tr('地点', 'Venue') }}</text><text>{{ course.venue?.name || tr('待确认', 'TBC') }}</text></view><view class="kv"><text>{{ tr('人数', 'Attendees') }}</text><text>{{ tr('1 人', '1 person') }}{{ course.type === 'SERIES' ? tr(' · 整个系列', ' · full series') : '' }}</text></view></view>
        <view class="summary-box">
          <view class="kv"><text>{{ tr('当前价格', 'Current price') }}</text><text>¥{{ toYuan(currentQuote.basePrice) }}</text></view>
          <view v-if="currentQuote.memberCardType" class="kv"><text>{{ tr('会员卡', 'Member card') }}</text><text>{{ cardLabel(currentQuote.memberCardType) }}</text></view>
          <view v-if="slotDiscount" class="slot-discount"><text>{{ slotDiscount.ruleName }}</text><text v-if="slotDiscount.actionType === 'FIXED_BY_DURATION' && slotDiscount.fixedPrice != null" class="secondary">{{ tr('会员时段价', 'Member time-slot price') }} ¥{{ slotDiscount.fixedPrice }}</text><text v-else-if="slotDiscount.discountPercent != null" class="secondary">{{ tr('时段计价比例', 'Time-slot rate') }} {{ slotDiscount.discountPercent }}%</text></view>
          <view v-if="currentQuote.discountAmount" class="kv"><text>{{ currentQuote.discountAmount > 0 ? tr('本次优惠', 'Discount') : tr('本次价格调整', 'Price adjustment') }}</text><text>{{ currentQuote.discountAmount > 0 ? '−' : '+' }}¥{{ toYuan(Math.abs(currentQuote.discountAmount)) }}</text></view>
          <view class="kv total"><text>{{ tr('应付', 'Total') }}</text><text>¥{{ toYuan(currentQuote.priceAfterDiscount) }}</text></view>
        </view>
        <text class="secondary">{{ tr('请确认课程安排及退款规则。本次不使用积分或代金券抵扣。', 'Please review the schedule and refund policy. Points and vouchers are not used for this booking.') }}</text>
      </template>
      <template #actions><view class="sheet-actions"><button class="outline-btn" :disabled="busy" @tap="closeBooking">{{ tr('再想想', 'Not now') }}</button><button class="primary-btn" :disabled="busy || !currentQuote" :loading="busy" @tap="confirmBook">{{ busy ? tr('处理中', 'Processing') : `${tr('确认支付', 'Pay')} ¥${toYuan(currentQuote?.priceAfterDiscount)}` }}</button></view></template>
    </BottomSheet>

    <BottomSheet :show="waitlistVisible" :title="tr('候补报名', 'Join waitlist')" :busy="busy" @close="closeWaitlist">
      <template v-if="waitlistQuote && course">
        <text class="subheading">{{ course.title }}</text>
        <text class="secondary">{{ tr('课程已满员，候补需预付。有人取消时按队列递补，会员候补席优先。最终席位以下单结果为准。', 'This course is full. A prepayment is required to join the waitlist. Seats are offered in queue order with member seats prioritised. Final availability is subject to the booking result.') }}</text>
        <view class="summary-box">
          <view v-if="waitlistQuote.seatType" class="kv"><text>{{ tr('本次候补队列', 'Waitlist queue') }}</text><text>{{ waitlistQuote.seatType === 'MEMBER' ? tr('会员候补席', 'Member waitlist') : tr('普通候补席', 'Standard waitlist') }}</text></view>
          <view v-if="waitlistQuote.position != null" class="kv"><text>{{ tr('预计队列位置', 'Estimated position') }}</text><text>{{ tr(`第 ${waitlistQuote.position} 位`, `#${waitlistQuote.position}`) }}</text></view>
          <view v-if="waitlistQuote.memberSeatsLeft != null" class="kv"><text>{{ tr('当前会员候补余位', 'Member waitlist seats left') }}</text><text>{{ tr(`${waitlistQuote.memberSeatsLeft} 位`, `${waitlistQuote.memberSeatsLeft} seats`) }}</text></view>
          <view class="kv total"><text>{{ tr('预付', 'Prepayment') }}</text><text>¥{{ toYuan(waitlistQuote.lockedPrice) }}</text></view>
        </view>
        <text v-if="course.waitlistDeadlineHours != null" class="secondary">{{ tr(`候补截止：开课前 ${course.waitlistDeadlineHours} 小时。`, `Waitlist closes ${course.waitlistDeadlineHours} hours before the course starts.`) }}</text>
        <text class="secondary spaced">{{ tr('截止仍未递补将取消候补并全额退款；主动取消候补同样全额原路退回。支付未完成可到「我的预约」继续支付。', 'If no seat is offered by the deadline, the waitlist entry is cancelled and fully refunded. Voluntary cancellation is also refunded in full. Unfinished payments can be continued in My Bookings.') }}</text>
        <button v-if="!isMember" class="member-link" @tap="goMember"><PresenceIcon name="card" :size="32" /><text>{{ tr('了解会员候补权益', 'Explore member waitlist benefits') }}</text><PresenceIcon name="arrow" :size="28" /></button>
      </template>
      <template #actions><view class="sheet-actions"><button class="outline-btn" :disabled="busy" @tap="closeWaitlist">{{ tr('再想想', 'Not now') }}</button><button class="primary-btn gold-btn" :disabled="busy || !waitlistQuote" :loading="busy" @tap="confirmWaitlist">{{ busy ? tr('处理中', 'Processing') : `${tr('预付并候补', 'Prepay and join')} ¥${toYuan(waitlistQuote?.lockedPrice)}` }}</button></view></template>
    </BottomSheet>

    <ShareSheet :show="shareVisible" :targets="shareTargets" @close="shareVisible = false" @payload="sharePayload = $event" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { useUserStore } from '../../stores/user'
import { getCourseDetail } from '@/api/course'
import { quoteEnroll, previewEnrollQuote, enrollCourse, type EnrollQuote } from '@/api/order'
import { quoteWaitlist, joinWaitlist, type WaitlistQuote } from '@/api/waitlist'
import { getActiveCard } from '@/api/member'
import { payOrder, isOrderPaid } from '@/utils/wechat'
import PresenceIcon from '@/components/PresenceIcon.vue'
import BrandCover from '@/components/BrandCover.vue'
import PageState from '@/components/PageState.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import FloatingBack from '@/components/FloatingBack.vue'
import ShareSheet from '@/components/ShareSheet.vue'
import type { ShareTargetOption } from '@/utils/share'
import { tr, isEnglish } from '@/locale'

type TimeDiscount = { ruleName: string; actionType: string; discountPercent: number | null; fixedPrice: number | null }
type BookingQuote = EnrollQuote & { timeDiscount?: TimeDiscount | null }
type QueueQuote = WaitlistQuote & { memberSeatsLeft?: number }
const userStore = useUserStore()
const course = ref<any>(null)
const courseId = ref('')
const loading = ref(true)
const loadError = ref(false)
const coverFailed = ref(false)
const busy = ref(false)
const bookingVisible = ref(false)
const waitlistVisible = ref(false)
const currentQuote = ref<BookingQuote | null>(null)
const waitlistQuote = ref<QueueQuote | null>(null)
const pendingOrderId = ref('')
const registrationComplete = ref(false)
const isMember = ref(false)
const previewQuote = ref<BookingQuote | null>(null)
const CARD_LABELS: Record<string, string> = { YEARLY: '年卡会员', QUARTERLY: '季卡会员', MONTHLY: '月卡会员' }
const slotDiscount = computed(() => currentQuote.value?.timeDiscount ?? null)
const syllabus = computed(() => course.value?.syllabus?.length ? course.value.syllabus : course.value?.sessions || [])
const capacityKnown = computed(() => course.value && Number.isFinite(course.value.currentEnrolled) && Number.isFinite(course.value.maxCapacity) && course.value.maxCapacity > 0)
const seatsLeft = computed(() => capacityKnown.value ? Math.max(0, course.value.maxCapacity - course.value.currentEnrolled) : 0)
const isFull = computed(() => !!capacityKnown.value && seatsLeft.value === 0)

/** 展示状态与后端生命周期口径一致；旧数据缺字段时回退到 PUBLISHED 判断。 */
const PHASE_TEXT: Record<string, { zh: string; en: string }> = {
  DRAFT: { zh: '草稿', en: 'Draft' },
  CANCELLED: { zh: '已下架', en: 'Cancelled' },
  COMPLETED: { zh: '已结束', en: 'Completed' },
  EXPIRED: { zh: '已过期', en: 'Expired' },
  ENROLL_UPCOMING: { zh: '报名未开始', en: 'Enrollment soon' },
  ENROLLING: { zh: '报名中', en: 'Enrolling' },
  ENROLL_CLOSED: { zh: '报名截止', en: 'Enrollment closed' },
  LATE_ENROLLING: { zh: '补报名中', en: 'Late enrollment' },
  ONGOING: { zh: '进行中', en: 'In progress' },
  ENDED: { zh: '已结束', en: 'Ended' },
}
const phase = computed(() => String(course.value?.phase || '').toUpperCase())
const phaseText = computed(() => {
  const item = PHASE_TEXT[phase.value]
  return item ? tr(item.zh, item.en) : (course.value?.phaseLabel || '')
})
const isBookablePhase = computed(() => {
  if (typeof course.value?.bookable === 'boolean') return course.value.bookable
  return phase.value === 'ENROLLING' || phase.value === 'LATE_ENROLLING'
})
const showBookingBar = computed(() => course.value && !loading.value && !loadError.value && (isBookablePhase.value || !!pendingOrderId.value || registrationComplete.value))
const canBook = computed(() => {
  const c = course.value
  if (loading.value || loadError.value || !c?.id) return false
  if (typeof c.bookable === 'boolean') return c.bookable
  // 旧接口未返回生命周期字段时的兜底：开始时刻前且未过报名截止才可报名。
  if (c.status !== 'PUBLISHED') return false
  const now = Date.now()
  if (c.enrollStartAt && now < new Date(c.enrollStartAt).getTime()) return false
  const deadline = c.enrollDeadline || c.enrollEndAt || c.startAt
  if (deadline && now >= new Date(deadline).getTime()) return false
  return true
})
const enrollDeadlineText = computed(() => {
  const raw = course.value?.enrollDeadline || course.value?.enrollEndAt
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : formatDateTime(raw)
})
/** 只展示当前用户此刻的应付价，不列出全部顺位或会员折扣档位。 */
const displayPrice = computed(() => {
  const quote = previewQuote.value
  if (quote && quote.courseId === course.value?.id && quote.priceAfterDiscount != null && Number.isFinite(Number(quote.priceAfterDiscount))) {
    return quote.priceAfterDiscount
  }
  return getUserPrice()
})
const priceCaption = computed(() => {
  const quote = previewQuote.value
  if (quote && quote.courseId === course.value?.id) {
    return quote.memberCardType
      ? tr('当前会员价 · 确认报名时重新询价', 'Your member price · re-quoted at booking')
      : tr('当前应付价 · 确认报名时重新询价', 'Your current price · re-quoted at booking')
  }
  if (isFull.value) return tr('参考价 · 候补预付金额以实际询价为准', 'Reference price · waitlist prepayment is quoted at booking')
  return tr('参考价 · 确认报名时以实际询价为准', 'Reference price · final quote at booking')
})
const bottomCaption = computed(() => {
  if (pendingOrderId.value) return tr('待支付订单可继续支付', 'Unpaid order · continue payment')
  if (registrationComplete.value) return tr('报名已完成', 'Booking confirmed')
  if (isFull.value) return tr('候补预付金额以询价为准', 'Waitlist prepayment quoted at booking')
  if (previewQuote.value?.courseId === course.value?.id) return tr('当前应付价 · 确认时重新询价', 'Your price · re-quoted on confirmation')
  return tr('参考价 · 确认时查看应付金额', 'Reference price · final amount on confirmation')
})
const primaryLabel = computed(() => {
  if (busy.value) return tr('处理中…', 'Processing…')
  if (pendingOrderId.value) return tr('去我的预约续付', 'Continue payment')
  if (registrationComplete.value) return tr('查看我的预约', 'View my bookings')
  if (!canBook.value) return tr('暂不可报名', 'Booking closed')
  if (isFull.value) return course.value?.waitlistEnabled ? tr('候补报名', 'Join waitlist') : tr('已约满', 'Full')
  if (phase.value === 'LATE_ENROLLING') return tr('补报名', 'Late enrolment')
  return course.value?.type === 'SERIES' ? tr('报名系列课', 'Book full series') : tr('立即报名', 'Book now')
})
const bookingButtonDisabled = computed(() => {
  if (busy.value) return true
  if (pendingOrderId.value || registrationComplete.value) return false
  if (!canBook.value) return true
  return isFull.value && !course.value?.waitlistEnabled
})
const statusMessage = computed(() => {
  const c = course.value
  if (!c) return ''
  const p = phase.value
  if (p === 'CANCELLED') return tr('课程已取消，退款进度请在「我的预约」查看。', 'This course has been cancelled. Please check My Bookings for refund progress.')
  if (p === 'COMPLETED' || p === 'ENDED') return tr('课程已结束，报名与自助退款通道均已关闭；历史记录保留在「我的预约」，如需协助请联系客服。', 'This course has ended. Booking and self-service refunds are closed; past records remain in My Bookings. Contact support if you need help.')
  if (p === 'EXPIRED') return tr('课程已过期，报名通道已关闭。', 'This course has expired and booking is closed.')
  if (p === 'DRAFT') return tr('课程暂未开放报名。', 'This course is not open for booking yet.')
  if (p === 'ENROLL_UPCOMING') {
    return c.enrollStartAt
      ? tr(`报名将于 ${formatDateTime(c.enrollStartAt)} 开放。`, `Enrollment opens ${formatDateTime(c.enrollStartAt)}.`)
      : tr('报名暂未开放，请稍后再来。', 'Enrollment has not opened yet. Please check back later.')
  }
  if (p === 'ONGOING') return tr('课程正在进行中，报名已截止。', 'This course is in progress and booking has closed.')
  if (p === 'ENROLL_CLOSED') return tr('报名已截止。如遇特殊情况需要补报名，请联系客服确认是否可开放。', 'Enrollment has closed. If you need late enrollment, please contact support to check availability.')
  if (p === 'LATE_ENROLLING') {
    const deadline = c.enrollDeadline || c.enrollEndAt
    return tr(
      `补报名开放中${deadline ? `，截止 ${formatDateTime(deadline)}` : ''}。`,
      `Late enrollment is open${deadline ? ` until ${formatDateTime(deadline)}` : ''}.`,
    )
  }
  if (c.status && c.status !== 'PUBLISHED' && !p) return tr('课程暂未开放报名。', 'This course is not open for booking.')
  if (!canBook.value) return tr('当前已不在报名时间内。', 'Booking is currently closed.')
  return ''
})

function toYuan(fen: number | string | null | undefined) {
  if (fen == null || !Number.isFinite(Number(fen))) return '—'
  const amount = Number(fen)
  return (amount / 100).toFixed(amount % 100 === 0 ? 0 : 2)
}
function typeLabel(v: string) {
  const labels = isEnglish()
    ? { SINGLE: 'Single session', SERIES: 'Series' }
    : { SINGLE: '单次体验', SERIES: '系列课程' }
  return (labels as Record<string, string>)[v] || v
}
function difficultyLabel(v: string) {
  const labels = isEnglish()
    ? { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' }
    : { BEGINNER: '入门', INTERMEDIATE: '进阶', ADVANCED: '高级' }
  return (labels as Record<string, string>)[v] || v
}
function cardLabel(type: string) {
  if (!isEnglish()) return CARD_LABELS[type] || type
  return ({ YEARLY: 'Yearly member', QUARTERLY: 'Quarterly member', MONTHLY: 'Monthly member' } as Record<string, string>)[type] || type
}

async function loadDetail(id: string) {
  courseId.value = id
  loading.value = true
  loadError.value = false
  previewQuote.value = null
  try {
    if (!id) { course.value = null; return }
    const data = await getCourseDetail(id)
    if (!data?.id) { course.value = null; return }
    const detail: any = { ...data }
    for (const key of ['gallery', 'tags', 'categories', 'targetAudience', 'materials', 'sessions', 'syllabus', 'priceTiers', 'memberDiscounts', 'refundRules']) {
      detail[key] = Array.isArray(detail[key]) ? detail[key] : []
    }
    course.value = detail
    coverFailed.value = false
  } catch {
    course.value = null
    loadError.value = true
  } finally {
    loading.value = false
    if (course.value) void refreshPreviewQuote()
  }
}
/** 仅预览当前用户应付价：不下单、不占位；非报名阶段不请求。 */
async function refreshPreviewQuote() {
  const id = course.value?.id
  if (!id || !userStore.isLoggedIn || !isBookablePhase.value) {
    previewQuote.value = null
    return
  }
  try {
    const quote = await previewEnrollQuote(id)
    if (course.value?.id === id && quote?.courseId === id) previewQuote.value = quote
  } catch {
    // 预览失败保持参考价，不影响正常报名询价与错误提示。
    if (course.value?.id === id) previewQuote.value = null
  }
}
const shareVisible = ref(false)
const sharePayload = ref<any>(null)
const shareTargets = computed<ShareTargetOption[]>(() => course.value?.id
  ? [{ type: 'course', id: course.value.id, label: tr('课程', 'Course') }]
  : [])

onLoad(async (query) => {
  await loadDetail(query?.id || '')
  if (userStore.isLoggedIn) {
    try { isMember.value = !!(await getActiveCard()) } catch { isMember.value = false }
  }
})

onShareAppMessage(() => ({
  title: sharePayload.value?.title || course.value?.title || tr('Full愈 · 在场课程', 'Full愈 · Course'),
  path: sharePayload.value?.path || `/pages/course-detail/index?id=${encodeURIComponent(courseId.value)}`,
  imageUrl: sharePayload.value?.imageUrl,
}))

// #ifdef MP-WEIXIN
onShareTimeline(() => ({
  title: sharePayload.value?.title || course.value?.title || tr('Full愈 · 在场课程', 'Full愈 · Course'),
  query: `id=${encodeURIComponent(courseId.value)}`,
  imageUrl: sharePayload.value?.imageUrl,
}))
// #endif
function ensureLogin() {
  if (userStore.isLoggedIn) return true
  uni.showModal({
    title: tr('请先登录', 'Please log in'),
    content: tr('前往「我的」完成登录后再报名', 'Log in from Me before booking.'),
    confirmText: tr('去登录', 'Log in'),
    showCancel: false,
    success: () => uni.switchTab({ url: '/pages/profile/index' }),
  })
  return false
}
function goBack() { if (getCurrentPages().length > 1) uni.navigateBack(); else uni.switchTab({ url: '/pages/index/index' }) }
function goBookings() { uni.switchTab({ url: '/pages/my-courses/index' }) }
function goMember() { if (busy.value) return; closeWaitlist(); uni.switchTab({ url: '/pages/member/index' }) }
function goTrainer() { const id = course.value?.trainer?.id; if (id) uni.navigateTo({ url: `/pages/trainer-home/index?id=${id}` }) }
function previewCover() { if (course.value?.coverImage) uni.previewImage({ urls: [course.value.coverImage, ...course.value.gallery], current: course.value.coverImage }) }
function previewGallery(index: number) { const images = course.value?.gallery || []; if (images.length) uni.previewImage({ urls: images, current: images[index] }) }
function getUserPrice() {
  const c = course.value
  if (!c) return null
  const position = c.currentEnrolled + 1
  const tier = c.priceTiers.find((t: any) => position >= t.seatFrom && position <= t.seatTo)
  return tier ? tier.price : c.originalPrice
}
function closeBooking() { if (!busy.value) { bookingVisible.value = false; currentQuote.value = null } }
function closeWaitlist() { if (!busy.value) { waitlistVisible.value = false; waitlistQuote.value = null } }
function handlePrimary() {
  if (busy.value) return
  if (pendingOrderId.value || registrationComplete.value) return goBookings()
  if (isFull.value) return handleWaitlist()
  return handleBook()
}
async function handleBook() {
  if (busy.value || bookingVisible.value || waitlistVisible.value) return
  if (pendingOrderId.value || registrationComplete.value) return goBookings()
  if (!canBook.value || isFull.value || !ensureLogin()) return
  busy.value = true
  try {
    const quote = await quoteEnroll(course.value.id)
    if (quote.isFull) {
      uni.showToast({ title: tr('名额已占满，请刷新后查看', 'This course is now full. Please refresh.'), icon: 'none' })
      await loadDetail(course.value.id)
      return
    }
    if (quote.courseId !== course.value.id || quote.priceAfterDiscount == null || !Number.isFinite(Number(quote.priceAfterDiscount))) return
    currentQuote.value = quote
    bookingVisible.value = true
  } catch {
    // 询价失败已由 request 提示，不打开可支付弹层。
  } finally { busy.value = false }
}
async function confirmBook() {
  if (busy.value || !bookingVisible.value || !currentQuote.value || !canBook.value || pendingOrderId.value || !ensureLogin()) return
  busy.value = true
  try {
    let order
    try { order = await enrollCourse(course.value.id) } catch {
      // 保留下单失败与支付失败的区别：未创建订单，不提示续付。
      bookingVisible.value = false
      currentQuote.value = null
      return
    }
    pendingOrderId.value = order.orderId
    bookingVisible.value = false
    // 询价不占位，真正锁价在下单；并发导致变价时先让用户核对，不静默扣新金额。
    if (Number(order.actualPaid) !== Number(currentQuote.value.priceAfterDiscount)) {
      promptPendingOrder(tr(`订单金额已更新为 ¥${toYuan(order.actualPaid)}，请到「我的预约」核对后继续支付。`, `The order total is now ¥${toYuan(order.actualPaid)}. Please review it in My Bookings before paying.`))
      return
    }
    try {
      await payOrder(order.orderId)
    } catch (error: any) {
      // 微信回调可能丢失或晚于客户端：以订单状态为准，已支付按成功处理
      if (!String(error?.errMsg || error?.message || '').includes('cancel') && await isOrderPaid(order.orderId)) {
        pendingOrderId.value = ''
        registrationComplete.value = true
        uni.showToast({ title: tr('报名成功', 'Booked successfully'), icon: 'success' })
        await loadDetail(course.value.id)
        return
      }
      // 订单已创建、支付未完成：引导去预约页继续支付。
      promptPendingOrder()
      return
    }
    pendingOrderId.value = ''
    registrationComplete.value = true
    uni.showToast({ title: tr('报名成功', 'Booked successfully'), icon: 'success' })
    await loadDetail(course.value.id)
  } finally { busy.value = false }
}
async function handleWaitlist() {
  if (busy.value || waitlistVisible.value || bookingVisible.value) return
  if (pendingOrderId.value || registrationComplete.value) return goBookings()
  if (!canBook.value || !isFull.value || !course.value.waitlistEnabled || !ensureLogin()) return
  busy.value = true
  try {
    const quote = await quoteWaitlist(course.value.id)
    if (quote.courseId !== course.value.id || quote.lockedPrice == null || !Number.isFinite(Number(quote.lockedPrice))) return
    waitlistQuote.value = quote
    waitlistVisible.value = true
  } catch {
    // 候补询价失败不展示推测金额或排队位置。
  } finally { busy.value = false }
}
async function confirmWaitlist() {
  if (busy.value || !waitlistVisible.value || !waitlistQuote.value || !canBook.value || pendingOrderId.value || !ensureLogin()) return
  busy.value = true
  try {
    let entry
    try { entry = await joinWaitlist(course.value.id) } catch {
      // 候补下单失败已提示，未创建订单不能引导续付。
      waitlistVisible.value = false
      waitlistQuote.value = null
      return
    }
    pendingOrderId.value = entry.orderId
    waitlistVisible.value = false
    // 现有候补接口真实返回 lockedPrice（分），兼容声明中的 actualPaid。
    const amount = (entry as typeof entry & { lockedPrice?: number }).lockedPrice ?? entry.actualPaid
    if (Number(amount) !== Number(waitlistQuote.value.lockedPrice)) {
      promptPendingOrder(tr(`候补订单金额已更新为 ¥${toYuan(amount)}，请到「我的预约」核对后继续支付。`, `The waitlist order total is now ¥${toYuan(amount)}. Please review it in My Bookings before paying.`))
      return
    }
    try { await payOrder(entry.orderId) } catch (error: any) {
      if (!String(error?.errMsg || error?.message || '').includes('cancel') && await isOrderPaid(entry.orderId)) {
        pendingOrderId.value = ''
        registrationComplete.value = true
        uni.showToast({ title: tr('候补成功，排队中', 'Added to the waitlist'), icon: 'success' })
        await loadDetail(course.value.id)
        return
      }
      promptPendingOrder()
      return
    }
    pendingOrderId.value = ''
    registrationComplete.value = true
    uni.showToast({ title: tr('候补成功，排队中', 'Added to the waitlist'), icon: 'success' })
    await loadDetail(course.value.id)
  } finally { busy.value = false }
}
/** 下单成功但支付未完成：保留原有续付入口，不重新创建订单。 */
function promptPendingOrder(message?: string) {
  uni.showModal({
    title: tr('支付未完成', 'Payment incomplete'),
    content: message || tr('订单已创建，支付有效期为 10 分钟。可在「我的预约」继续支付，超时将自动取消并释放占位。', 'Your order has been created and payment is valid for 10 minutes. Continue in My Bookings; unpaid orders are cancelled and seats released after that.'),
    confirmText: tr('去预约', 'My bookings'), cancelText: tr('稍后支付', 'Pay later'),
    success: (res) => { if (res.confirm) goBookings() },
  })
}
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatDate(value: string) {
  if (!value) return tr('时间待确认', 'Date TBC')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return tr('时间待确认', 'Date TBC')
  return isEnglish() ? `${MONTHS_EN[date.getMonth()]} ${date.getDate()}` : `${date.getMonth() + 1}月${date.getDate()}日`
}
function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return tr('时间待确认', 'Time TBC')
  return `${formatDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function formatRefundTime(rule: any) {
  const from = Number(rule.hoursFrom)
  const to = rule.hoursTo == null ? null : Number(rule.hoursTo)
  if (to == null || to >= 9999) return tr(`开课前${from}小时及以上`, `${from} hours or more before start`)
  if (from === 0) return tr(`开课前${to}小时内`, `Within ${to} hours before start`)
  return tr(`开课前${from}–${to}小时`, `${from}–${to} hours before start`)
}
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: calc(190rpx + env(safe-area-inset-bottom)); background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; line-height: 1.6; }
button { margin: 0; font-size: 28rpx; line-height: 1.5; }
button::after { border: 0; }
button[disabled] { opacity: .55; }
.hero { position: relative; }
.cover-image { display: block; width: 100%; height: 440rpx; }
.content { padding: 32rpx; }
.card { padding: 32rpx; background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.course-title { display: block; font-size: 42rpx; line-height: 1.45; margin: 20rpx 0 8rpx; overflow-wrap: anywhere; }
.title-row { display: flex; align-items: flex-start; gap: 16rpx; }
.title-row .course-title { flex: 1; min-width: 0; }
.share-entry { flex-shrink: 0; display: flex; align-items: center; gap: 4rpx; margin-top: 22rpx; padding: 8rpx 14rpx; border-radius: 24rpx; background: var(--c-card-2); color: var(--c-primary); font-size: 22rpx; }
.tags { display: flex; flex-wrap: wrap; gap: 12rpx; }
.tag { background: var(--c-card-2); color: var(--c-primary); padding: 4rpx 16rpx; border-radius: 16rpx; font-size: 24rpx; }
.tag.gold { background: var(--c-gold); }
.detail-tags { margin-top: 20rpx; }
.secondary, .caption { display: block; color: var(--c-muted); font-size: 24rpx; font-weight: 400; }
.section-heading { display: flex; align-items: baseline; gap: 14rpx; margin: 40rpx 0 20rpx; font-size: 34rpx; }
.caption { font-size: 24rpx; }
.info-row { display: flex; align-items: flex-start; gap: 20rpx; margin-bottom: 24rpx; }
.info-row:last-child { margin-bottom: 0; }
.grow { flex: 1; min-width: 0; text-align: left; }
.notice { display: flex; align-items: flex-start; gap: 16rpx; padding: 24rpx; margin-top: 24rpx; border-radius: var(--radius-button); background: var(--c-card-2); font-size: 24rpx; }
.prose { overflow: hidden; overflow-wrap: anywhere; }
.subheading { display: block; font-weight: 600; margin: 16rpx 0; font-size: 28rpx; }
.body-line { display: block; white-space: pre-wrap; margin: 12rpx 0; }
.gallery-scroll { margin-top: 24rpx; width: 100%; }
.gallery-list { display: flex; gap: 16rpx; }
.gallery-image { flex-shrink: 0; width: 240rpx; height: 180rpx; border-radius: var(--radius-button); }
.trainer-card { display: flex; align-items: center; gap: 20rpx; width: 100%; color: var(--c-ink); }
.avatar { width: 104rpx; height: 104rpx; border-radius: 50%; flex-shrink: 0; }
.avatar-placeholder { display: flex; align-items: center; justify-content: center; background: var(--c-card-2); }
.trainer-name { display: block; font-size: 32rpx; margin-bottom: 8rpx; }
.trainer-bio { margin-top: 12rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.session-row { display: flex; gap: 24rpx; padding: 24rpx 0; border-bottom: 1rpx solid var(--line-soft); }
.session-row:first-child { padding-top: 0; }
.session-row:last-child { border: 0; padding-bottom: 0; }
.session-index { width: 108rpx; flex-shrink: 0; font-size: 24rpx; color: var(--c-brown); }
.price-display { display: flex; align-items: baseline; gap: 12rpx; }
.price { font-size: 48rpx; font-weight: 600; color: var(--c-primary); }
.kv { display: flex; justify-content: space-between; align-items: baseline; gap: 24rpx; padding: 16rpx 0; font-size: 28rpx; }
.kv > text:last-child { text-align: right; overflow-wrap: anywhere; }
.refund-value { flex-shrink: 0; color: var(--c-primary); }
.spaced { margin-top: 16rpx; }
.bottom-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 100; display: flex; align-items: center; gap: 24rpx; padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom)); background: var(--c-card); border-top: 1rpx solid var(--line-soft); }
.bottom-left { flex: 1; min-width: 0; }
.bottom-price { display: block; font-size: 40rpx; font-weight: 600; color: var(--c-primary); }
.primary-btn, .outline-btn { border-radius: var(--radius-button); min-height: 88rpx; padding: 20rpx 28rpx; display: flex; align-items: center; justify-content: center; font-weight: 600; }
.primary-btn { background: var(--c-primary); color: var(--c-rice); }
.outline-btn { color: var(--c-primary); background: var(--c-card); border: 2rpx solid var(--c-primary); }
.gold-btn { background: var(--c-gold); color: var(--c-deep); }
.bottom-bar .primary-btn { flex: 1; }
.summary-box { margin: 24rpx 0; padding: 24rpx; border-radius: var(--radius-card); background: var(--c-cream); }
.summary-box .subheading { margin-top: 0; }
.total { margin-top: 12rpx; padding-top: 24rpx; border-top: 1rpx solid var(--line-soft); font-weight: 600; color: var(--c-primary); }
.slot-discount { padding: 16rpx 0; color: var(--c-brown); }
.sheet-actions { display: flex; gap: 24rpx; width: 100%; }
.sheet-actions .outline-btn { flex: 1; }
.sheet-actions .primary-btn { flex: 2; }
.member-link { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; padding: 24rpx; margin-top: 24rpx; background: var(--c-card-2); color: var(--c-brown); border-radius: var(--radius-button); }
</style>
