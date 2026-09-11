<template>
  <view class="page">
    <!-- 课程封面 -->
    <view class="cover" :style="{ background: course.coverImage ? 'none' : getCoverBg() }">
      <image v-if="course.coverImage" class="cover-image" :src="course.coverImage" mode="aspectFill" @tap="previewGallery(0)" />
      <view class="cover-overlay">
        <text class="cover-type">{{ typeLabel(course.type) }}</text>
        <text class="cover-title serif">{{ course.title }}</text>
        <text class="cover-subtitle">{{ course.subtitle }}</text>
      </view>
      <view class="back-btn" @tap="goBack">
        <text>←</text>
      </view>
    </view>

    <!-- 图片图集滚动 -->
    <view v-if="course.gallery && course.gallery.length > 0" class="gallery-section">
      <scroll-view scroll-x class="gallery-scroll">
        <view class="gallery-list">
          <view v-for="(img, idx) in course.gallery" :key="idx" class="gallery-item" @tap="previewGallery(idx)">
            <image :src="img" mode="aspectFill" class="gallery-img" />
          </view>
        </view>
      </scroll-view>
      <text class="gallery-hint">左右滑动查看更多 · 点击查看大图</text>
    </view>

    <!-- 课程状态横幅（非 PUBLISHED 时显示） -->
    <view v-if="course.status === 'CANCELLED'" class="status-banner cancelled">
      <view class="status-dot"></view>
      <text class="status-text">该课程因未达成团人数已取消，已报名学员将获全额退款</text>
    </view>
    <view v-else-if="course.status === 'COMPLETED'" class="status-banner completed">
      <view class="status-dot"></view>
      <text class="status-text">该课程已结束</text>
    </view>
    <view v-else-if="course.status === 'EXPIRED'" class="status-banner cancelled">
      <view class="status-dot"></view>
      <text class="status-text">该课程已过期</text>
    </view>

    <!-- 课程信息 -->
    <view class="content">
      <!-- 基本信息 -->
      <view class="section">
        <view class="tags">
          <text v-for="tag in course.tags" :key="tag" class="tag">{{ tag }}</text>
          <text class="tag difficulty">{{ difficultyLabel(course.difficulty) }}</text>
        </view>

        <view class="info-row">
          <view class="info-dot"></view>
          <text class="info-text">{{ formatDate(course.startDate) }} {{ course.startTime }}-{{ course.endTime }}</text>
        </view>
        <view class="info-row">
          <view class="info-dot"></view>
          <text class="info-text">{{ course.venue.name }}（{{ course.venue.address }}）</text>
        </view>
        <view class="info-row">
          <view class="info-dot"></view>
          <text class="info-text">{{ course.currentEnrolled }}/{{ course.maxCapacity }}人 · 余{{ course.maxCapacity - course.currentEnrolled }}位</text>
        </view>
      </view>

      <!-- 导师信息 -->
      <view class="section" @tap="goTrainer">
        <text class="section-title serif">导师</text>
        <view class="trainer-card">
          <image v-if="course.trainer.avatar" class="trainer-avatar-img" :src="course.trainer.avatar" mode="aspectFill" />
          <view v-else class="trainer-avatar">{{ course.trainer.displayName.charAt(0) }}</view>
          <view class="trainer-info">
            <view class="trainer-row">
              <text class="trainer-name">{{ course.trainer.displayName }}</text>
              <text class="trainer-level">LV{{ course.trainer.level }}</text>
              <text v-if="course.trainer.seedifyCert" class="trainer-cert">Seedify认证</text>
              <text v-if="course.trainer.title" class="trainer-title">{{ course.trainer.title }}</text>
            </view>
            <text class="trainer-bio">{{ course.trainer.bio }}</text>
          </view>
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 多节课程安排 -->
      <view v-if="course.sessions.length > 1" class="section">
        <text class="section-title serif">课程安排（{{ course.sessions.length }}节）</text>
        <view class="session-list">
          <view v-for="session in course.sessions" :key="session.index" class="session-item">
            <view class="session-dot"></view>
            <view class="session-content">
              <text class="session-name">{{ course.title }}·第{{ session.index }}节：{{ session.title }}</text>
              <text class="session-date">{{ formatDate(session.date) }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 价格 -->
      <view class="section">
        <text class="section-title serif">价格</text>
        <view class="price-display">
          <text class="price-current latin">¥{{ toYuan(getUserPrice()) }}</text>
          <text class="price-label">/人</text>
        </view>
        <view class="discount-section" v-if="memberDiscountList.length">
          <text class="discount-title">会员优惠</text>
          <view class="discount-row" v-for="md in memberDiscountList" :key="md.label">
            <text class="discount-label">{{ md.label }}</text>
            <text class="discount-value" v-if="md.percent < 100">{{ (md.percent / 10).toFixed(1) }}折</text>
            <text class="discount-value muted" v-else>无优惠</text>
          </view>
        </view>
        <view class="discount-section" v-else>
          <text class="discount-title">会员优惠</text>
          <text class="discount-value muted">暂无会员优惠</text>
        </view>
      </view>

      <!-- Seeds 奖励 -->
      <view class="section">
        <text class="section-title serif">Seeds 奖励</text>
        <view class="reward-list">
          <view class="reward-item">
            <view class="reward-dot"></view>
            <text class="reward-text">完课奖励 +<text class="latin">{{ course.completionSeeds }}</text> Seeds</text>
          </view>
          <view class="reward-item">
            <view class="reward-dot"></view>
            <text class="reward-text">评价奖励 +<text class="latin">{{ course.reviewSeeds }}</text> Seeds（每人限一次）</text>
          </view>
        </view>
      </view>

      <!-- 退款规则 -->
      <view class="section">
        <text class="section-title serif">退款政策</text>
        <view class="refund-list">
          <view v-for="rule in course.refundRules" :key="rule.hoursFrom" class="refund-item">
            <text class="refund-time">{{ formatRefundTime(rule) }}</text>
            <text class="refund-percent" :class="{ zero: rule.refundPercent === 0 }">
              {{ rule.refundPercent === 0 ? '不可退' : `退${rule.refundPercent}%` }}
            </text>
          </view>
        </view>
      </view>

      <!-- 已报名学员 -->
      <view class="section">
        <text class="section-title serif">已报名</text>
        <view class="enrolled-section">
          <view class="avatar-wall">
            <view v-for="(name, i) in course.enrolledAvatars" :key="i" class="enrolled-avatar" :style="{ marginLeft: i > 0 ? '-12rpx' : '0' }">
              {{ name }}
            </view>
          </view>
          <text class="enrolled-count">共{{ course.currentEnrolled }}人报名</text>
        </view>
      </view>
    </view>

    <!-- 底部报名按钮（仅 PUBLISHED 状态显示） -->
    <view v-if="course.status === 'PUBLISHED'" class="bottom-bar safe-area-bottom">
      <view class="bottom-left">
        <text class="bottom-price latin">¥{{ toYuan(getUserPrice()) }}</text>
        <text class="bottom-original" v-if="bestDiscount">会员价 ¥{{ toYuan(Math.round(getUserPrice() * bestDiscount / 100)) }}</text>
      </view>
      <!-- 正常报名 -->
      <view v-if="course.currentEnrolled < course.maxCapacity" class="book-btn" @tap="handleBook">
        <text class="book-text">立即报名</text>
      </view>
      <!-- 候补入口 -->
      <view v-else class="book-btn waitlist-btn" @tap="handleWaitlist">
        <text class="book-text">候补报名</text>
      </view>
    </view>

    <!-- 候补弹窗 -->
    <view v-if="waitlistVisible" class="popup-mask" @tap="waitlistVisible = false">
      <view class="popup-content" @tap.stop>
        <view class="popup-handle"></view>
        <text class="popup-title serif">候补报名</text>
        <text class="popup-desc">当前课程已满员。候补需先预付锁价并锁定排队顺序，如有人取消将按队列顺序自动补位。</text>

        <!-- 双队列席位情况 -->
        <view class="queue-cards">
          <view class="queue-card member">
            <text class="queue-card-title">会员优先席</text>
            <text class="queue-card-num">余 {{ memberSeatsLeft }} 位</text>
            <text class="queue-card-tip">会员整体优先于普通队列递补</text>
          </view>
          <view class="queue-card normal">
            <text class="queue-card-title">普通候补席</text>
            <text class="queue-card-num">不限量</text>
            <text class="queue-card-tip">当前排在第 {{ course.currentEnrolled - course.maxCapacity + 1 }} 位</text>
          </view>
        </view>

        <!-- 非会员引流 -->
        <view v-if="!isMember" class="member-promo" @tap="goMember">
          <view class="promo-left">
            <text class="promo-title">开通会员，优先候补补位</text>
            <text class="promo-desc">会员享优先席位 + 全课程折扣，补位更快一步</text>
          </view>
          <text class="promo-btn">去开通 ›</text>
        </view>

        <view class="waitlist-info">
          <view class="waitlist-rule">
            <view class="rule-dot"></view>
            <text class="rule-text">候补截止：到期未补上自动取消并全额退款</text>
          </view>
          <view class="waitlist-rule">
            <view class="rule-dot"></view>
            <text class="rule-text">主动取消：按课程退款政策退款</text>
          </view>
          <view class="waitlist-rule">
            <view class="rule-dot"></view>
            <text class="rule-text">候补成功：自动占位并短信通知您</text>
          </view>
        </view>

        <view class="form-item">
          <text class="form-label">候补截止时间</text>
          <view class="deadline-options">
            <view v-for="opt in deadlineOptions" :key="opt.value" class="deadline-option" :class="{ active: waitlistDeadline === opt.value }" @tap="waitlistDeadline = opt.value">
              <text>{{ opt.label }}</text>
            </view>
          </view>
        </view>

        <view class="popup-actions">
          <view class="popup-cancel" @tap="waitlistVisible = false"><text>取消</text></view>
          <view class="popup-confirm" @tap="confirmWaitlist"><text>确认候补 ¥{{ getUserPrice() }}</text></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '../../stores/user'
import { getCourseDetail } from '@/api/course'
import { quoteEnroll, enrollCourse } from '@/api/order'
import { joinWaitlist } from '@/api/waitlist'
import { getActiveCard } from '@/api/member'
import { payOrder } from '@/utils/wechat'

const userStore = useUserStore()

// 分→元转换
function toYuan(fen: number) {
  return (fen / 100).toFixed(fen % 100 === 0 ? 0 : 2)
}

// 课程类型/难度枚举→中文
function typeLabel(v: string) {
  const map: Record<string, string> = { SINGLE: '单次课程', SERIES: '系列课程' }
  return map[v] || v
}
function difficultyLabel(v: string) {
  const map: Record<string, string> = { BEGINNER: '入门', INTERMEDIATE: '进阶', ADVANCED: '高级' }
  return map[v] || v
}

// 带默认值的课程对象，避免模板访问 undefined
const course = ref<any>({
  id: '', title: '', subtitle: '', type: '', coverImage: '', gallery: [], status: 'PUBLISHED',
  startDate: '', startTime: '', endTime: '',
  venue: { name: '', address: '' },
  trainer: { id: '', displayName: '', level: 0, title: '', bio: '', avatar: '', seedifyCert: false },
  currentEnrolled: 0, maxCapacity: 0,
  tags: [], difficulty: '', sessions: [],
  priceTiers: [], originalPrice: 0,
  memberDiscounts: [],
  completionSeeds: 0, reviewSeeds: 0,
  refundRules: [], enrolledAvatars: [], memberWaitlistSeats: 3,
})

// 会员折扣列表（从 memberDiscounts 数组计算）
const CARD_LABELS: Record<string, string> = { YEARLY: '年卡会员', QUARTERLY: '季卡会员', MONTHLY: '月卡会员' }
const memberDiscountList = computed(() => {
  const discounts = course.value.memberDiscounts || []
  return discounts.map((d: any) => ({
    label: CARD_LABELS[d.cardType] || d.cardType,
    percent: d.discountPercent,
  }))
})
// 最优折扣百分比（用于底部栏显示会员价）
const bestDiscount = computed(() => {
  const discounts = course.value.memberDiscounts || []
  if (!discounts.length) return 0
  return Math.min(...discounts.map((d: any) => d.discountPercent))
})
const waitlistVisible = ref(false)
const waitlistDeadline = ref(24)

// 当前用户是否为会员（用于非会员引流展示）
const isMember = ref(false)

// 候补截止可选项（与后台 WAITLIST_DEADLINE_OPTIONS 保持一致）
const deadlineOptions = [
  { value: 48, label: '开课前48小时' },
  { value: 24, label: '开课前24小时' },
  { value: 6, label: '开课前6小时' },
  { value: 1, label: '开课前1小时' },
  { value: 0.5, label: '开课前30分钟' },
]

// 会员优先席剩余（总会员席位 - 已占用，缺省 3）
const memberSeatsLeft = computed(() => {
  const total = (course.value as any).memberWaitlistSeats ?? 3
  return Math.max(total - 1, 0)
})

async function loadDetail(id: string) {
  try {
    const data = await getCourseDetail(id)
    if (data) {
      course.value = {
        ...course.value,
        ...data,
        venue: data.venue ?? course.value.venue,
        trainer: data.trainer ?? course.value.trainer,
        gallery: (data as any).gallery ?? [],
        tags: (data as any).tags ?? [],
        sessions: (data as any).sessions ?? [],
        priceTiers: (data as any).priceTiers ?? [],
        memberDiscounts: (data as any).memberDiscounts ?? [],
        refundRules: (data as any).refundRules ?? [],
        enrolledAvatars: (data as any).enrolledAvatars ?? [],
      }
    }
  } catch (e) {
    // 忽略，保留默认
  }
}

onLoad(async (query) => {
  const id = query?.id || ''
  if (id) await loadDetail(id)
  if (userStore.isLoggedIn) {
    try {
      const card = await getActiveCard()
      isMember.value = !!card
    } catch (e) {
      isMember.value = false
    }
  }
})

function ensureLogin() {
  if (userStore.isLoggedIn) return true
  uni.showModal({
    title: '请先登录',
    content: '前往「我的」完成微信登录后再报名',
    showCancel: false,
    success: () => uni.switchTab({ url: '/pages/profile/index' }),
  })
  return false
}

function getCoverBg() {
  const map: Record<string, string> = {
    SINGLE: 'linear-gradient(135deg, #584219, #6D5934)',
    SERIES: 'linear-gradient(135deg, #3F2F10, #6D5934)',
  }
  return map[course.value.type] || 'linear-gradient(135deg, #584219, #6D5934)'
}

function goMember() {
  waitlistVisible.value = false
  uni.switchTab({ url: '/pages/member/index' })
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.switchTab({ url: '/pages/index/index' })
  }
}

function previewGallery(startIdx: number) {
  const images = course.value.gallery && course.value.gallery.length > 0
    ? course.value.gallery
    : (course.value.coverImage ? [course.value.coverImage] : [])
  if (images.length === 0) return
  uni.previewImage({
    urls: images,
    current: images[Math.min(startIdx, images.length - 1)],
  })
}

/** 根据当前报名人数计算用户本次需付价格 */
function getUserPrice() {
  const enrolled = course.value.currentEnrolled || 0
  const nextPos = enrolled + 1
  const tiers = course.value.priceTiers || []
  const tier = tiers.find((t: any) => {
    const from = t.seatFrom ?? t.from
    const to = t.seatTo ?? t.to
    return nextPos >= from && nextPos <= to
  })
  return tier ? tier.price : course.value.originalPrice
}

function goTrainer() {
  const tid = course.value.trainer?.id
  if (tid) uni.navigateTo({ url: `/pages/trainer-home/index?id=${tid}` })
}

async function handleBook() {
  if (!ensureLogin()) return
  if (course.value.currentEnrolled >= course.value.maxCapacity) return
  try {
    const quote = await quoteEnroll(course.value.id)
    // timeDiscount.fixedPrice 后端按「元」返回（quote 其余金额是「分」，需 toYuan）
    const td = (quote as any).timeDiscount as
      | { ruleName: string; actionType: string; discountPercent: number | null; fixedPrice: number | null }
      | null
      | undefined
    const tdLine = td
      ? td.actionType === 'FIXED_BY_DURATION'
        ? `\n会员时段价 ¥${td.fixedPrice}（${td.ruleName}）`
        : `\n时段折扣 ${td.discountPercent}%（${td.ruleName}）`
      : ''
    uni.showModal({
      title: '确认报名',
      content: `${course.value.title}\n${formatDate(course.value.startDate)} ${course.value.startTime}\n应付 ¥${toYuan(quote.priceAfterDiscount)}${tdLine}`,
      confirmText: '确认支付',
      confirmColor: '#584219',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const order = await enrollCourse(course.value.id)
          await payOrder(order.orderId)
          uni.showToast({ title: '报名成功！', icon: 'success' })
          await loadDetail(course.value.id)
        } catch (e) {
          // 支付失败/取消，错误已由 request 提示
        }
      },
    })
  } catch (e) {
    // 询价失败已提示
  }
}

function handleWaitlist() {
  if (!ensureLogin()) return
  waitlistVisible.value = true
}

async function confirmWaitlist() {
  waitlistVisible.value = false
  try {
    const entry = await joinWaitlist(course.value.id)
    await payOrder(entry.orderId)
    uni.showToast({ title: '候补成功，排队中', icon: 'success' })
    await loadDetail(course.value.id)
  } catch (e) {
    // 错误已提示
  }
}

function formatDate(date: string) {
  const d = new Date(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function formatRefundTime(rule: any) {
  if (rule.hoursFrom >= 9999) return '48小时前'
  if (rule.hoursTo >= 9999) return `${rule.hoursFrom}小时前`
  if (rule.hoursFrom === 0) return `${rule.hoursTo}小时内`
  return `${rule.hoursFrom}-${rule.hoursTo}小时`
}
</script>

<style scoped>
.page { background: #EAE0D7; min-height: 100vh; padding-bottom: 200rpx; }

.cover { position: relative; height: 420rpx; display: flex; align-items: flex-end; overflow: hidden; }
.cover-image { position: absolute; inset: 0; width: 100%; height: 100%; }
.cover-overlay { padding: 40rpx; width: 100%; position: relative; z-index: 1; background: linear-gradient(to top, rgba(63, 47, 16, 0.55) 0%, transparent 100%); }
.cover-type { font-size: 22rpx; color: #F7F2E9; background: rgba(247, 242, 233, 0.22); padding: 6rpx 22rpx; border-radius: 999rpx; display: inline-block; margin-bottom: 12rpx; letter-spacing: 1rpx; }
.cover-title { display: block; font-size: 44rpx; color: #F7F2E9; margin-bottom: 8rpx; }
.cover-subtitle { display: block; font-size: 26rpx; color: rgba(247, 242, 233, 0.85); letter-spacing: 1rpx; }
.back-btn { position: absolute; top: calc(24rpx + env(safe-area-inset-top, 0px)); left: 24rpx; width: 64rpx; height: 64rpx; background: rgba(251, 248, 243, 0.35); backdrop-filter: blur(12px); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36rpx; color: #F7F2E9; z-index: 2; }

.gallery-section { padding: 24rpx 0 0; background: transparent; }

.status-banner { display: flex; align-items: center; gap: 14rpx; padding: 24rpx 32rpx; margin: 0; }
.status-banner.cancelled { background: rgba(211, 149, 110, 0.16); }
.status-banner.completed { background: rgba(88, 66, 25, 0.08); }
.status-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #D3956E; flex-shrink: 0; }
.status-banner.completed .status-dot { background: #6D5934; }
.status-text { font-size: 26rpx; color: #3F2F10; flex: 1; }
.gallery-scroll { width: 100%; }
.gallery-list { display: flex; gap: 16rpx; padding: 0 32rpx; }
.gallery-item { flex-shrink: 0; width: 280rpx; height: 200rpx; border-radius: 26rpx; overflow: hidden; }
.gallery-img { width: 100%; height: 100%; }
.gallery-hint { display: block; text-align: center; font-size: 22rpx; color: #A78E70; margin-top: 12rpx; padding-bottom: 16rpx; }

.content { padding: 0 32rpx; position: relative; z-index: 1; }

.section { background: #FBF8F3; border-radius: 44rpx; padding: 36rpx 32rpx; margin-bottom: 28rpx; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.section-title { font-size: 32rpx; color: #584219; margin-bottom: 24rpx; display: block; }

.tags { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 24rpx; }
.tag { font-size: 22rpx; color: #584219; background: rgba(88, 66, 25, 0.08); padding: 6rpx 22rpx; border-radius: 999rpx; letter-spacing: 1rpx; }
.tag.difficulty { background: #584219; color: #F7F2E9; }

.info-row { display: flex; align-items: center; gap: 16rpx; margin-bottom: 14rpx; }
.info-dot { width: 10rpx; height: 10rpx; border-radius: 50%; background: #A78E70; flex-shrink: 0; }
.info-text { font-size: 26rpx; color: #6D5934; }

.trainer-card { display: flex; align-items: center; gap: 20rpx; padding: 24rpx; background: #F4EEE6; border-radius: 32rpx; }
.trainer-avatar-img { width: 88rpx; height: 88rpx; border-radius: 50%; flex-shrink: 0; }
.trainer-avatar { width: 88rpx; height: 88rpx; border-radius: 50%; background: #584219; color: #F7F2E9; font-size: 34rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.trainer-info { flex: 1; }
.trainer-row { display: flex; align-items: center; gap: 12rpx; margin-bottom: 8rpx; }
.trainer-name { font-size: 28rpx; font-weight: 600; color: #3F2F10; letter-spacing: 1rpx; }
.trainer-level { font-size: 20rpx; color: #584219; background: rgba(88, 66, 25, 0.08); padding: 2rpx 14rpx; border-radius: 999rpx; }
.trainer-cert { font-size: 20rpx; color: #8C7335; background: rgba(201, 163, 92, 0.18); padding: 2rpx 14rpx; border-radius: 999rpx; }
.trainer-title { font-size: 22rpx; color: #A78E70; }
.trainer-bio { font-size: 24rpx; color: #6D5934; line-height: 1.6; }
.arrow { font-size: 36rpx; color: #A78E70; }

.session-list { padding-left: 8rpx; }
.session-item { display: flex; align-items: flex-start; gap: 18rpx; margin-bottom: 18rpx; }
.session-dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: #D3956E; margin-top: 10rpx; flex-shrink: 0; }
.session-content { flex: 1; }
.session-name { font-size: 26rpx; color: #3F2F10; display: block; }
.session-date { font-size: 22rpx; color: #A78E70; }

.price-display { display: flex; align-items: baseline; gap: 6rpx; margin-bottom: 28rpx; }
.price-current { font-size: 52rpx; font-weight: 600; color: #584219; }
.price-label { font-size: 24rpx; color: #A78E70; }

.discount-section { border-top: 2rpx dashed rgba(88, 66, 25, 0.14); padding-top: 24rpx; }
.discount-title { font-size: 24rpx; color: #A78E70; margin-bottom: 14rpx; display: block; letter-spacing: 1rpx; }
.discount-row { display: flex; justify-content: space-between; margin-bottom: 10rpx; }
.discount-label { font-size: 26rpx; color: #3F2F10; }
.discount-value { font-size: 26rpx; color: #8C7335; font-weight: 500; }
.discount-value.muted { color: #A78E70; }

.reward-list { display: flex; flex-direction: column; gap: 16rpx; }
.reward-item { display: flex; align-items: center; gap: 16rpx; }
.reward-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #D3956E; flex-shrink: 0; }
.reward-text { font-size: 26rpx; color: #3F2F10; }

.refund-list { display: flex; flex-direction: column; gap: 14rpx; }
.refund-item { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 24rpx; background: #F4EEE6; border-radius: 24rpx; }
.refund-time { font-size: 26rpx; color: #3F2F10; }
.refund-percent { font-size: 26rpx; color: #584219; font-weight: 500; }
.refund-percent.zero { color: #A78E70; }

.enrolled-section { display: flex; align-items: center; gap: 20rpx; }
.avatar-wall { display: flex; }
.enrolled-avatar { width: 60rpx; height: 60rpx; border-radius: 50%; background: #6D5934; color: #F7F2E9; font-size: 22rpx; display: flex; align-items: center; justify-content: center; border: 3rpx solid #FBF8F3; }
.enrolled-count { font-size: 24rpx; color: #A78E70; }

/* 底部报名栏：悬浮胶囊 */
.bottom-bar { position: fixed; bottom: calc(24rpx + env(safe-area-inset-bottom)); left: 32rpx; right: 32rpx; background: #FBF8F3; display: flex; align-items: center; justify-content: space-between; padding: 24rpx 36rpx; border-radius: 999rpx; box-shadow: 0 12rpx 36rpx rgba(63, 47, 16, 0.16); z-index: 100; }
.bottom-left { display: flex; flex-direction: column; }
.bottom-price { font-size: 42rpx; font-weight: 600; color: #584219; }
.bottom-original { font-size: 22rpx; color: #A78E70; }
.book-btn { background: #584219; padding: 22rpx 64rpx; border-radius: 999rpx; }
.book-btn:active { transform: scale(0.96); }
.book-btn.disabled { background: #A78E70; }
.book-btn.waitlist-btn { background: #6D5934; }
.book-text { color: #F7F2E9; font-size: 30rpx; font-weight: 600; letter-spacing: 2rpx; }

/* 候补弹窗 Bottom Sheet */
.popup-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(63, 47, 16, 0.4); z-index: 999; display: flex; align-items: flex-end; justify-content: center; }
.popup-content { width: 100%; background: #F4EEE6; border-radius: 52rpx 52rpx 0 0; padding: 48rpx 40rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); animation: sheet-up 0.3s ease; }
@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.popup-handle { width: 72rpx; height: 8rpx; border-radius: 999rpx; background: rgba(88, 66, 25, 0.14); margin: 0 auto 32rpx; }
.popup-title { font-size: 36rpx; color: #3F2F10; display: block; margin-bottom: 8rpx; }
.popup-desc { font-size: 24rpx; color: #A78E70; display: block; margin-bottom: 28rpx; line-height: 1.7; }

/* 双队列席位卡 */
.queue-cards { display: flex; gap: 20rpx; margin-bottom: 24rpx; }
.queue-card { flex: 1; border-radius: 32rpx; padding: 24rpx; }
.queue-card.member { background: rgba(201, 163, 92, 0.16); border: 2rpx solid rgba(201, 163, 92, 0.5); }
.queue-card.normal { background: #FBF8F3; border: 2rpx solid rgba(88, 66, 25, 0.14); }
.queue-card-title { font-size: 24rpx; font-weight: 600; color: #3F2F10; display: block; margin-bottom: 8rpx; letter-spacing: 1rpx; }
.queue-card-num { font-size: 30rpx; font-weight: 600; color: #584219; display: block; margin-bottom: 6rpx; }
.queue-card-tip { font-size: 20rpx; color: #A78E70; line-height: 1.5; }

/* 非会员引流 */
.member-promo { display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #3F2F10, #584219); border-radius: 32rpx; padding: 24rpx 28rpx; margin-bottom: 28rpx; }
.promo-left { flex: 1; }
.promo-title { font-size: 26rpx; font-weight: 600; color: #EAD9B8; display: block; margin-bottom: 6rpx; letter-spacing: 1rpx; }
.promo-desc { font-size: 20rpx; color: rgba(247, 242, 233, 0.8); line-height: 1.5; }
.promo-btn { font-size: 24rpx; color: #F7F2E9; font-weight: 600; background: rgba(201, 163, 92, 0.3); padding: 10rpx 24rpx; border-radius: 999rpx; margin-left: 16rpx; flex-shrink: 0; }

.waitlist-info { background: #FBF8F3; border-radius: 32rpx; padding: 28rpx; margin-bottom: 32rpx; }
.waitlist-rule { display: flex; align-items: flex-start; gap: 16rpx; margin-bottom: 18rpx; }
.waitlist-rule:last-child { margin-bottom: 0; }
.rule-dot { width: 10rpx; height: 10rpx; border-radius: 50%; background: #A78E70; margin-top: 16rpx; flex-shrink: 0; }
.rule-text { font-size: 24rpx; color: #3F2F10; line-height: 1.6; }

.form-item { margin-bottom: 28rpx; }
.form-label { font-size: 26rpx; color: #3F2F10; font-weight: 500; display: block; margin-bottom: 14rpx; letter-spacing: 1rpx; }
.deadline-options { display: flex; flex-wrap: wrap; gap: 16rpx; }
.deadline-option { padding: 14rpx 28rpx; border: 2rpx solid rgba(88, 66, 25, 0.14); background: #FBF8F3; border-radius: 999rpx; font-size: 24rpx; color: #6D5934; }
.deadline-option.active { border-color: #584219; background: rgba(88, 66, 25, 0.06); color: #584219; font-weight: 600; }

.popup-actions { display: flex; gap: 20rpx; margin-top: 28rpx; }
.popup-cancel { flex: 1; height: 92rpx; border: 2rpx solid #584219; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; font-size: 30rpx; color: #584219; }
.popup-confirm { flex: 2; height: 92rpx; background: #584219; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; }
.popup-confirm:active { transform: scale(0.96); }
.popup-confirm text { color: #F7F2E9; font-size: 28rpx; font-weight: 600; letter-spacing: 2rpx; }
</style>
