<template>
  <view class="page">
    <view class="nav-bar">
      <view class="back-btn" @tap="goBack"><text>←</text></view>
      <text class="nav-title serif">我的资产</text>
    </view>

    <!-- 余额卡片 -->
    <view class="balance-section">
      <view class="balance-card">
        <view class="balance-item">
          <text class="balance-label">Seeds 积分</text>
          <text class="balance-value latin">{{ pointsBalance }}</text>
        </view>
        <view class="balance-divider"></view>
        <view class="balance-item">
          <text class="balance-label">可用代金券</text>
          <text class="balance-value latin">{{ usableVoucherCount }}</text>
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
        <text class="history-amount latin" :class="{ positive: item.amount > 0 }">{{ item.amount > 0 ? '+' : '' }}{{ item.amount }}</text>
      </view>
      <view v-if="pointsHistory.length === 0" class="empty"><text>暂无积分记录</text></view>
    </view>

    <!-- 代金券 -->
    <view v-if="currentTab === 'vouchers'" class="list-section">
      <view v-for="voucher in vouchers" :key="voucher.id" class="voucher-card">
        <view class="voucher-left" :style="{ background: voucher.bg }">
          <text class="voucher-mode">减额券</text>
          <text class="voucher-value latin">¥{{ voucher.amount }}</text>
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
  'linear-gradient(135deg, #584219, #6D5934)',
  'linear-gradient(135deg, #6D5934, #A78E70)',
  'linear-gradient(135deg, #3F2F10, #584219)',
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
        bg: usable ? VOUCHER_BG[idx % VOUCHER_BG.length] : 'linear-gradient(135deg, #A78E70, #C4B5A6)',
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
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.switchTab({ url: '/pages/profile/index' })
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: #EAE0D7; }
.nav-bar { display: flex; align-items: center; padding: 32rpx 32rpx 20rpx; gap: 16rpx; }
.back-btn { width: 48rpx; height: 48rpx; display: flex; align-items: center; justify-content: center; font-size: 32rpx; color: #3F2F10; }
.nav-title { font-size: 38rpx; color: #3F2F10; }

.balance-section { padding: 8rpx 32rpx 32rpx; }
.balance-card { position: relative; overflow: hidden; background: linear-gradient(135deg, #3F2F10, #584219); border-radius: 44rpx; padding: 48rpx 40rpx; display: flex; align-items: center; box-shadow: 0 12rpx 36rpx rgba(63, 47, 16, 0.22); }
.balance-item { flex: 1; text-align: center; }
.balance-label { font-size: 24rpx; color: rgba(247, 242, 233, 0.7); display: block; margin-bottom: 10rpx; letter-spacing: 1rpx; }
.balance-value { font-size: 52rpx; font-weight: 600; color: #D3956E; }
.balance-divider { width: 2rpx; height: 64rpx; background: rgba(247, 242, 233, 0.18); }

.tab-bar { display: flex; padding: 0 32rpx 24rpx; gap: 20rpx; }
.tab-item { padding: 10rpx 28rpx; font-size: 26rpx; color: #6D5934; background: #F4EEE6; border-radius: 999rpx; letter-spacing: 1rpx; }
.tab-item.active { color: #F7F2E9; font-weight: 500; background: #584219; }

.list-section { padding: 0 32rpx; }
.history-item { background: #FBF8F3; border-radius: 32rpx; padding: 28rpx 32rpx; margin-bottom: 16rpx; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.history-left { flex: 1; }
.history-title { font-size: 28rpx; color: #3F2F10; display: block; margin-bottom: 4rpx; letter-spacing: 1rpx; }
.history-time { font-size: 22rpx; color: #A78E70; }
.history-amount { font-size: 32rpx; font-weight: 600; color: #A78E70; }
.history-amount.positive { color: #D3956E; }

.voucher-card { background: #FBF8F3; border-radius: 32rpx; padding: 24rpx; margin-bottom: 16rpx; display: flex; align-items: center; gap: 20rpx; box-shadow: 0 6rpx 24rpx rgba(88, 66, 25, 0.05); }
.voucher-left { width: 104rpx; height: 104rpx; border-radius: 26rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #F7F2E9; flex-shrink: 0; }
.voucher-mode { font-size: 18rpx; opacity: 0.8; letter-spacing: 1rpx; }
.voucher-value { font-size: 30rpx; font-weight: 600; }
.voucher-right { flex: 1; }
.voucher-name { font-size: 28rpx; font-weight: 500; color: #3F2F10; display: block; margin-bottom: 4rpx; }
.voucher-condition { font-size: 22rpx; color: #6D5934; display: block; margin-bottom: 4rpx; }
.voucher-expire { font-size: 20rpx; color: #A78E70; }
.voucher-status { padding: 6rpx 20rpx; border-radius: 999rpx; }
.voucher-status.active { background: rgba(211, 149, 110, 0.16); }
.voucher-status.active text { color: #B06A3F; font-size: 22rpx; letter-spacing: 1rpx; }
.voucher-status.expired { background: rgba(167, 142, 112, 0.14); }
.voucher-status.expired text { color: #A78E70; font-size: 22rpx; letter-spacing: 1rpx; }
.empty { text-align: center; padding: 100rpx 0; }
.empty text { font-size: 28rpx; color: #A78E70; letter-spacing: 1rpx; }
</style>
