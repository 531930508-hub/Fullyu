<template>
  <view class="page">
    <!-- 课程封面 -->
    <view class="cover" :style="{ background: course.coverImage ? 'none' : getCoverBg() }">
      <image v-if="course.coverImage" class="cover-image" :src="course.coverImage" mode="aspectFill" @tap="previewGallery(0)" />
      <view class="cover-overlay">
        <text class="cover-type">{{ course.type }}</text>
        <text class="cover-title">{{ course.title }}</text>
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

    <!-- 课程信息 -->
    <view class="content">
      <!-- 基本信息 -->
      <view class="section">
        <view class="tags">
          <text v-for="tag in course.tags" :key="tag" class="tag">{{ tag }}</text>
          <text class="tag difficulty">{{ course.difficulty }}</text>
        </view>

        <view class="info-row">
          <text class="info-icon">📅</text>
          <text class="info-text">{{ formatDate(course.startDate) }} {{ course.startTime }}-{{ course.endTime }}</text>
        </view>
        <view class="info-row">
          <text class="info-icon">📍</text>
          <text class="info-text">{{ course.venue.name }}（{{ course.venue.address }}）</text>
        </view>
        <view class="info-row">
          <text class="info-icon">👥</text>
          <text class="info-text">{{ course.currentEnrolled }}/{{ course.maxCapacity }}人 · 余{{ course.maxCapacity - course.currentEnrolled }}位</text>
        </view>
      </view>

      <!-- 导师信息 -->
      <view class="section" @tap="goTrainer">
        <text class="section-title">导师</text>
        <view class="trainer-card">
          <view class="trainer-avatar">{{ course.trainer.displayName.charAt(0) }}</view>
          <view class="trainer-info">
            <view class="trainer-row">
              <text class="trainer-name">{{ course.trainer.displayName }}</text>
              <text class="trainer-level">LV{{ course.trainer.level }}</text>
              <text class="trainer-title">{{ course.trainer.title }}</text>
            </view>
            <text class="trainer-bio">{{ course.trainer.bio }}</text>
          </view>
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 多节课程安排 -->
      <view v-if="course.sessions.length > 1" class="section">
        <text class="section-title">课程安排（{{ course.sessions.length }}节）</text>
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
        <text class="section-title">价格</text>
        <view class="price-display">
          <text class="price-current">¥{{ getUserPrice() }}</text>
          <text class="price-label">/人</text>
        </view>
        <view class="discount-section">
          <text class="discount-title">会员优惠</text>
          <view class="discount-row">
            <text class="discount-label">年卡会员</text>
            <text class="discount-value" v-if="course.yearlyDiscount">每节立减 ¥{{ course.yearlyDiscount }}</text>
            <text class="discount-value muted" v-else>无折扣</text>
          </view>
          <view class="discount-row">
            <text class="discount-label">季卡会员</text>
            <text class="discount-value" v-if="course.quarterlyDiscount">每节立减 ¥{{ course.quarterlyDiscount }}</text>
            <text class="discount-value muted" v-else>¥0</text>
          </view>
          <view class="discount-row">
            <text class="discount-label">月卡会员</text>
            <text class="discount-value" v-if="course.monthlyDiscount">每节立减 ¥{{ course.monthlyDiscount }}</text>
            <text class="discount-value muted" v-else>¥0</text>
          </view>
        </view>
      </view>

      <!-- Seeds 奖励 -->
      <view class="section">
        <text class="section-title">Seeds 奖励</text>
        <view class="reward-list">
          <view class="reward-item">
            <text class="reward-icon">🌱</text>
            <text class="reward-text">完课奖励 +{{ course.completionSeeds }} Seeds</text>
          </view>
          <view class="reward-item">
            <text class="reward-icon">⭐</text>
            <text class="reward-text">评价奖励 +{{ course.reviewSeeds }} Seeds（每人限一次）</text>
          </view>
        </view>
      </view>

      <!-- 退款规则 -->
      <view class="section">
        <text class="section-title">退款政策</text>
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
        <text class="section-title">已报名</text>
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

    <!-- 底部报名按钮 -->
    <view class="bottom-bar safe-area-bottom">
      <view class="bottom-left">
        <text class="bottom-price">¥{{ getUserPrice() }}</text>
        <text class="bottom-original" v-if="course.yearlyDiscount">年卡价 ¥{{ getUserPrice() - course.yearlyDiscount }}</text>
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
        <text class="popup-title">候补报名</text>
        <text class="popup-desc">当前课程已满员。候补需先预付锁价并锁定排队顺序，如有人取消将按队列顺序自动补位。</text>

        <!-- 双队列席位情况 -->
        <view class="queue-cards">
          <view class="queue-card member">
            <text class="queue-card-title">👑 会员优先席</text>
            <text class="queue-card-num">余 {{ memberSeatsLeft }} 位</text>
            <text class="queue-card-tip">会员整体优先于普通队列递补</text>
          </view>
          <view class="queue-card normal">
            <text class="queue-card-title">👥 普通候补席</text>
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
            <text class="rule-icon">⏰</text>
            <text class="rule-text">候补截止：到期未补上自动取消并全额退款</text>
          </view>
          <view class="waitlist-rule">
            <text class="rule-icon">❌</text>
            <text class="rule-text">主动取消：按课程退款政策退款</text>
          </view>
          <view class="waitlist-rule">
            <text class="rule-icon">✅</text>
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

// 带默认值的课程对象，避免模板访问 undefined
const course = ref<any>({
  id: '', title: '', subtitle: '', type: '', coverImage: '', gallery: [],
  startDate: '', startTime: '', endTime: '',
  venue: { name: '', address: '' },
  trainer: { id: '', displayName: '', level: 0, title: '', bio: '' },
  currentEnrolled: 0, maxCapacity: 0,
  tags: [], difficulty: '', sessions: [],
  priceTiers: [], originalPrice: 0,
  yearlyDiscount: 0, quarterlyDiscount: 0, monthlyDiscount: 0,
  completionSeeds: 0, reviewSeeds: 0,
  refundRules: [], enrolledAvatars: [], memberWaitlistSeats: 3,
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
    '单次课程': 'linear-gradient(135deg, #6B463C, #8B6354)',
    '系列课程': 'linear-gradient(135deg, #4A6741, #6B8F62)',
  }
  return map[course.value.type] || 'linear-gradient(135deg, #6B463C, #8B6354)'
}

function goMember() {
  waitlistVisible.value = false
  uni.switchTab({ url: '/pages/member/index' })
}

function goBack() {
  uni.navigateBack()
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
    uni.showModal({
      title: '确认报名',
      content: `${course.value.title}\n${formatDate(course.value.startDate)} ${course.value.startTime}\n应付 ¥${quote.priceAfterDiscount}`,
      confirmText: '确认支付',
      confirmColor: '#6B463C',
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
.page { background: #F5E8D8; min-height: 100vh; padding-bottom: 160rpx; }

.cover { position: relative; height: 400rpx; display: flex; align-items: flex-end; overflow: hidden; }
.cover-image { position: absolute; inset: 0; width: 100%; height: 100%; }
.cover-overlay { padding: 40rpx; width: 100%; position: relative; z-index: 1; background: linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%); }
.cover-type { font-size: 22rpx; color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.2); padding: 4rpx 16rpx; border-radius: 16rpx; display: inline-block; margin-bottom: 12rpx; }
.cover-title { display: block; font-size: 40rpx; font-weight: 700; color: #FFF; margin-bottom: 8rpx; }
.cover-subtitle { display: block; font-size: 26rpx; color: rgba(255,255,255,0.85); }
.back-btn { position: absolute; top: 24rpx; left: 24rpx; width: 64rpx; height: 64rpx; background: rgba(255,255,255,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36rpx; color: #FFF; z-index: 2; }

/* 图集滚动 */
.gallery-section { padding: 24rpx 0 0; background: #FFF; margin-bottom: -16rpx; }
.gallery-scroll { width: 100%; }
.gallery-list { display: flex; gap: 16rpx; padding: 0 32rpx; }
.gallery-item { flex-shrink: 0; width: 280rpx; height: 200rpx; border-radius: 16rpx; overflow: hidden; }
.gallery-img { width: 100%; height: 100%; }
.gallery-hint { display: block; text-align: center; font-size: 22rpx; color: #A08A72; margin-top: 12rpx; padding-bottom: 16rpx; }

.content { padding: 0 32rpx; margin-top: -40rpx; position: relative; z-index: 1; }

.section { background: #FFF; border-radius: 24rpx; padding: 32rpx; margin-bottom: 24rpx; }
.section-title { font-size: 30rpx; font-weight: 700; color: #4B3621; margin-bottom: 20rpx; display: block; }

.tags { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 20rpx; }
.tag { font-size: 22rpx; color: #6B463C; background: #F5E8D8; padding: 6rpx 16rpx; border-radius: 16rpx; }
.tag.difficulty { background: #6B463C; color: #FFF; }

.info-row { display: flex; align-items: center; gap: 12rpx; margin-bottom: 12rpx; }
.info-icon { font-size: 28rpx; }
.info-text { font-size: 26rpx; color: #7D665C; }

.trainer-card { display: flex; align-items: center; gap: 16rpx; padding: 16rpx; background: #FAF5F0; border-radius: 16rpx; }
.trainer-avatar { width: 80rpx; height: 80rpx; border-radius: 50%; background: #6B463C; color: #FFF; font-size: 32rpx; display: flex; align-items: center; justify-content: center; }
.trainer-info { flex: 1; }
.trainer-row { display: flex; align-items: center; gap: 12rpx; margin-bottom: 8rpx; }
.trainer-name { font-size: 28rpx; font-weight: 600; color: #4B3621; }
.trainer-level { font-size: 20rpx; color: #6B463C; background: #F5E8D8; padding: 2rpx 10rpx; border-radius: 8rpx; }
.trainer-title { font-size: 22rpx; color: #A08A72; }
.trainer-bio { font-size: 24rpx; color: #7D665C; }
.arrow { font-size: 36rpx; color: #A08A72; }

.session-list { padding-left: 8rpx; }
.session-item { display: flex; align-items: flex-start; gap: 16rpx; margin-bottom: 16rpx; }
.session-dot { width: 16rpx; height: 16rpx; border-radius: 50%; background: #6B463C; margin-top: 8rpx; flex-shrink: 0; }
.session-content { flex: 1; }
.session-name { font-size: 26rpx; color: #4B3621; display: block; }
.session-date { font-size: 22rpx; color: #A08A72; }

.price-display { display: flex; align-items: baseline; gap: 4rpx; margin-bottom: 24rpx; }
.price-current { font-size: 48rpx; font-weight: 700; color: #6B463C; }
.price-label { font-size: 24rpx; color: #A08A72; }

.discount-section { border-top: 1rpx solid #F0E6DC; padding-top: 20rpx; }
.discount-title { font-size: 24rpx; color: #A08A72; margin-bottom: 12rpx; display: block; }
.discount-row { display: flex; justify-content: space-between; margin-bottom: 8rpx; }
.discount-label { font-size: 26rpx; color: #4B3621; }
.discount-value { font-size: 26rpx; color: #6B463C; font-weight: 500; }
.discount-value.muted { color: #A08A72; }

.reward-list { display: flex; flex-direction: column; gap: 12rpx; }
.reward-item { display: flex; align-items: center; gap: 12rpx; }
.reward-icon { font-size: 28rpx; }
.reward-text { font-size: 26rpx; color: #4B3621; }

.refund-list { display: flex; flex-direction: column; gap: 12rpx; }
.refund-item { display: flex; justify-content: space-between; align-items: center; padding: 12rpx 16rpx; background: #FAF5F0; border-radius: 12rpx; }
.refund-time { font-size: 26rpx; color: #4B3621; }
.refund-percent { font-size: 26rpx; color: #27AE60; font-weight: 500; }
.refund-percent.zero { color: #C0392B; }

.enrolled-section { display: flex; align-items: center; gap: 16rpx; }
.avatar-wall { display: flex; }
.enrolled-avatar { width: 56rpx; height: 56rpx; border-radius: 50%; background: #6B463C; color: #FFF; font-size: 22rpx; display: flex; align-items: center; justify-content: center; border: 3rpx solid #FFF; }
.enrolled-count { font-size: 24rpx; color: #A08A72; }

.bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; height: 120rpx; background: #FFF; display: flex; align-items: center; justify-content: space-between; padding: 0 32rpx; box-shadow: 0 -2px 8px rgba(0,0,0,0.05); z-index: 100; }
.bottom-left { display: flex; flex-direction: column; }
.bottom-price { font-size: 40rpx; font-weight: 700; color: #6B463C; }
.bottom-original { font-size: 22rpx; color: #A08A72; }
.book-btn { background: #6B463C; padding: 20rpx 60rpx; border-radius: 40rpx; }
.book-btn.disabled { background: #B8A49A; }
.book-btn.waitlist-btn { background: linear-gradient(135deg, #E67E22, #D35400); }
.book-text { color: #FFF; font-size: 30rpx; font-weight: 600; }

/* 候补弹窗 */
.popup-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; justify-content: center; }
.popup-content { width: 100%; background: #FFF; border-radius: 32rpx 32rpx 0 0; padding: 48rpx 40rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); }
.popup-title { font-size: 34rpx; font-weight: 700; color: #4B3621; display: block; margin-bottom: 8rpx; }
.popup-desc { font-size: 24rpx; color: #A08A72; display: block; margin-bottom: 24rpx; line-height: 1.5; }

/* 双队列席位卡 */
.queue-cards { display: flex; gap: 16rpx; margin-bottom: 20rpx; }
.queue-card { flex: 1; border-radius: 16rpx; padding: 20rpx; }
.queue-card.member { background: linear-gradient(135deg, #FBF0DC, #F5E1C0); border: 2rpx solid #E8C88A; }
.queue-card.normal { background: #FAF5F0; border: 2rpx solid #EADFD4; }
.queue-card-title { font-size: 24rpx; font-weight: 600; color: #4B3621; display: block; margin-bottom: 8rpx; }
.queue-card-num { font-size: 30rpx; font-weight: 700; color: #6B463C; display: block; margin-bottom: 6rpx; }
.queue-card-tip { font-size: 20rpx; color: #A08A72; line-height: 1.3; }

/* 非会员引流 */
.member-promo { display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #6B463C, #A07060); border-radius: 16rpx; padding: 20rpx 24rpx; margin-bottom: 24rpx; }
.promo-left { flex: 1; }
.promo-title { font-size: 26rpx; font-weight: 600; color: #FFF; display: block; margin-bottom: 6rpx; }
.promo-desc { font-size: 20rpx; color: rgba(255,255,255,0.85); line-height: 1.3; }
.promo-btn { font-size: 24rpx; color: #FFF; font-weight: 600; background: rgba(255,255,255,0.2); padding: 10rpx 20rpx; border-radius: 24rpx; margin-left: 16rpx; flex-shrink: 0; }

.waitlist-info { background: #FAF5F0; border-radius: 16rpx; padding: 24rpx; margin-bottom: 28rpx; }
.waitlist-rule { display: flex; align-items: flex-start; gap: 12rpx; margin-bottom: 16rpx; }
.waitlist-rule:last-child { margin-bottom: 0; }
.rule-icon { font-size: 28rpx; }
.rule-text { font-size: 24rpx; color: #4B3621; line-height: 1.4; }

.form-item { margin-bottom: 24rpx; }
.form-label { font-size: 26rpx; color: #4B3621; font-weight: 500; display: block; margin-bottom: 12rpx; }
.deadline-options { display: flex; flex-wrap: wrap; gap: 16rpx; }
.deadline-option { padding: 16rpx 28rpx; border: 2rpx solid #E8DDD4; border-radius: 16rpx; font-size: 24rpx; color: #7D665C; }
.deadline-option.active { border-color: #E67E22; background: #FFF5EE; color: #E67E22; font-weight: 600; }

.popup-actions { display: flex; gap: 20rpx; margin-top: 24rpx; }
.popup-cancel { flex: 1; height: 88rpx; border: 2rpx solid #E8DDD4; border-radius: 44rpx; display: flex; align-items: center; justify-content: center; font-size: 30rpx; color: #7D665C; }
.popup-confirm { flex: 2; height: 88rpx; background: #6B463C; border-radius: 44rpx; display: flex; align-items: center; justify-content: center; }
.popup-confirm text { color: #FFF; font-size: 28rpx; font-weight: 600; }
</style>
