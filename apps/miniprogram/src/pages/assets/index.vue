<template>
  <view class="page">
    <view class="nav-bar">
      <view class="back-btn" @tap="goBack"><text>←</text></view>
      <text class="nav-title">我的资产</text>
    </view>

    <!-- 余额卡片 -->
    <view class="balance-section">
      <view class="balance-card">
        <view class="balance-item">
          <text class="balance-label">积分</text>
          <text class="balance-value">{{ pointsBalance }}</text>
        </view>
        <view class="balance-divider"></view>
        <view class="balance-item">
          <text class="balance-label">可用代金券</text>
          <text class="balance-value">{{ usableVoucherCount }}</text>
        </view>
      </view>
    </view>

    <!-- Tab 切换 -->
    <view class="tab-bar">
      <view v-for="tab in tabs" :key="tab.value" class="tab-item" :class="{ active: currentTab === tab.value }" @tap="currentTab = tab.value">
        <text>{{ tab.label }}</text>
      </view>
    </view>

    <!-- 积分明细 -->
    <view v-if="currentTab === 'points'" class="list-section">
      <view v-for="item in pointsHistory" :key="item.id" class="history-item">
        <view class="history-left">
          <text class="history-title">{{ item.title }}</text>
          <text class="history-time">{{ item.time }}</text>
        </view>
        <text class="history-amount" :class="{ positive: item.amount > 0 }">{{ item.amount > 0 ? '+' : '' }}{{ item.amount }}</text>
      </view>
      <view v-if="pointsHistory.length === 0" class="empty"><text>暂无积分记录</text></view>
    </view>

    <!-- 代金券 -->
    <view v-if="currentTab === 'vouchers'" class="list-section">
      <view v-for="voucher in vouchers" :key="voucher.id" class="voucher-card">
        <view class="voucher-left" :style="{ background: voucher.bg }">
          <text class="voucher-mode">减额券</text>
          <text class="voucher-value">¥{{ voucher.amount }}</text>
        </view>
        <view class="voucher-right">
          <text class="voucher-name">{{ voucher.name }}</text>
          <text class="voucher-condition">{{ voucher.condition }}</text>
          <text class="voucher-expire">{{ voucher.expire }}</text>
        </view>
        <view class="voucher-status" :class="voucher.statusClass">
          <text>{{ voucher.statusLabel }}</text>
        </view>
      </view>
      <view v-if="vouchers.length === 0" class="empty"><text>暂无代金券</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getPoints, getPointsHistory } from '@/api/user'
import { listMyVouchers } from '@/api/voucher'

const currentTab = ref('points')

const tabs = [
  { value: 'points', label: '积分明细' },
  { value: 'vouchers', label: '我的代金券' },
]

const pointsBalance = ref(0)
const pointsHistory = ref<Array<{ id: string; title: string; amount: number; time: string }>>([])
const vouchers = ref<Array<any>>([])

const usableVoucherCount = computed(
  () => vouchers.value.filter((v) => v.statusClass === 'active').length,
)

function formatTime(d?: string) {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const h = `${date.getHours()}`.padStart(2, '0')
  const min = `${date.getMinutes()}`.padStart(2, '0')
  return `${m}-${day} ${h}:${min}`
}

const VOUCHER_BG = [
  'linear-gradient(135deg, #6B463C, #8B6354)',
  'linear-gradient(135deg, #5C4B8A, #8B73B8)',
  'linear-gradient(135deg, #4A6741, #6B8F62)',
]

async function loadData() {
  try {
    const [pts, history, vlist] = await Promise.all([
      getPoints().catch(() => ({ balance: 0 })),
      getPointsHistory().catch(() => ({ items: [], total: 0 })),
      listMyVouchers().catch(() => []),
    ])
    pointsBalance.value = pts?.balance ?? 0
    pointsHistory.value = (history?.items || []).map((it) => ({
      id: it.id,
      title: it.reason || it.type || '积分变动',
      amount: it.amount,
      time: formatTime(it.createdAt),
    }))
    const now = Date.now()
    vouchers.value = (vlist || []).map((v, idx) => {
      const expired = new Date(v.expiresAt).getTime() < now
      const used = v.status === 'USED'
      const usable = v.status === 'UNUSED' && !expired
      return {
        id: v.id,
        name: v.source || '代金券',
        amount: Number(v.amount),
        condition: v.applicableAll
          ? '全部课程可用'
          : `指定 ${v.applicableCourseIds?.length || 0} 门课程`,
        expire: expired ? '已过期' : `有效至 ${formatTime(v.expiresAt)}`,
        bg: usable ? VOUCHER_BG[idx % VOUCHER_BG.length] : 'linear-gradient(135deg, #999, #bbb)',
        statusLabel: used ? '已使用' : expired ? '已过期' : '可使用',
        statusClass: usable ? 'active' : 'expired',
      }
    })
  } catch (e) {
    // 错误已由 request 统一提示
  }
}

onShow(() => {
  loadData()
})

function goBack() {
  uni.navigateBack()
}
</script>

<style scoped>
.page { min-height: 100vh; background: #F5E8D8; }
.nav-bar { display: flex; align-items: center; padding: 24rpx 32rpx; gap: 16rpx; }
.back-btn { width: 48rpx; height: 48rpx; display: flex; align-items: center; justify-content: center; font-size: 32rpx; color: #4B3621; }
.nav-title { font-size: 34rpx; font-weight: 700; color: #4B3621; }

.balance-section { padding: 0 32rpx 24rpx; }
.balance-card { background: linear-gradient(135deg, #6B463C, #8B6354); border-radius: 24rpx; padding: 40rpx; display: flex; align-items: center; }
.balance-item { flex: 1; text-align: center; }
.balance-label { font-size: 24rpx; color: rgba(255,255,255,0.7); display: block; margin-bottom: 8rpx; }
.balance-value { font-size: 48rpx; font-weight: 700; color: #FFF; }
.balance-divider { width: 1rpx; height: 60rpx; background: rgba(255,255,255,0.3); }

.tab-bar { display: flex; padding: 0 32rpx 20rpx; gap: 24rpx; }
.tab-item { padding: 12rpx 0; font-size: 28rpx; color: #A08A72; }
.tab-item.active { color: #4B3621; font-weight: 600; border-bottom: 4rpx solid #6B463C; }

.list-section { padding: 0 32rpx; }
.history-item { background: #FFF; border-radius: 16rpx; padding: 24rpx; margin-bottom: 12rpx; display: flex; justify-content: space-between; align-items: center; }
.history-left { flex: 1; }
.history-title { font-size: 28rpx; color: #4B3621; display: block; margin-bottom: 4rpx; }
.history-time { font-size: 22rpx; color: #A08A72; }
.history-amount { font-size: 30rpx; font-weight: 600; color: #C0392B; }
.history-amount.positive { color: #27AE60; }

.voucher-card { background: #FFF; border-radius: 16rpx; padding: 20rpx; margin-bottom: 16rpx; display: flex; align-items: center; gap: 16rpx; }
.voucher-left { width: 100rpx; height: 100rpx; border-radius: 12rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #FFF; }
.voucher-mode { font-size: 18rpx; opacity: 0.8; }
.voucher-value { font-size: 28rpx; font-weight: 700; }
.voucher-right { flex: 1; }
.voucher-name { font-size: 28rpx; font-weight: 500; color: #4B3621; display: block; margin-bottom: 4rpx; }
.voucher-condition { font-size: 22rpx; color: #7D665C; display: block; margin-bottom: 4rpx; }
.voucher-expire { font-size: 20rpx; color: #A08A72; }
.voucher-status { padding: 6rpx 16rpx; border-radius: 8rpx; }
.voucher-status.active { background: #E8F5E9; }
.voucher-status.active text { color: #27AE60; font-size: 22rpx; }
.voucher-status.expired { background: #F5F5F5; }
.voucher-status.expired text { color: #999; font-size: 22rpx; }
.empty { text-align: center; padding: 80rpx 0; }
.empty text { font-size: 28rpx; color: #A08A72; }
</style>
