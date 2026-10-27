<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack fallback="/pages/profile/index" />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <text class="nav-title serif">{{ tr('我的资产', 'My assets') }}</text>
    </view>
    <view class="content">
      <PageState v-if="!isLoggedIn" state="guest" :title="tr('登录后查看资产', 'Log in to view your assets')" :message="tr('积分和代金券都会保存在这里', 'Points and vouchers are saved here')" :action="tr('去登录', 'Log in')" @action="goLogin" />
      <PageState v-else-if="loading" state="loading" :title="tr('正在读取资产', 'Loading assets')" />
      <PageState v-else-if="loadError" state="error" :title="tr('资产加载失败', 'Failed to load assets')" :message="tr('暂时无法确认余额，请检查网络后重试', 'Balance is temporarily unavailable. Check your network and retry.')" :action="tr('重新加载', 'Reload')" @action="loadData" />
      <template v-else>
        <view class="balance-card">
          <text class="eyebrow">MY ASSETS</text>
          <view class="balance-grid">
            <view class="balance-item"><text class="balance-value">{{ pointsBalance }}</text><text class="balance-label">{{ tr('积分余额', 'Points balance') }}</text></view>
            <view class="balance-item"><text class="balance-value">{{ usableVoucherCount }}</text><text class="balance-label">{{ tr('可用代金券', 'Usable vouchers') }}</text></view>
          </view>
        </view>
        <view class="tabs">
          <button v-for="tab in tabs" :key="tab.value" class="tab" :class="{ active: currentTab === tab.value }" @tap="currentTab = tab.value">{{ tab.label }}</button>
        </view>
        <template v-if="currentTab === 'points'">
          <view v-if="pointsHistory.length" class="ledger-card">
            <view v-for="item in pointsHistory" :key="item.id" class="ledger-row">
              <view class="ledger-copy"><text class="ledger-title">{{ item.title }}</text><text class="secondary">{{ item.time }}</text></view>
              <text class="ledger-amount" :class="{ positive: item.amount > 0 }">{{ item.amount > 0 ? '+' : '' }}{{ item.amount }}</text>
            </view>
          </view>
          <PageState v-else state="empty" :title="tr('还没有积分记录', 'No points history yet')" :message="tr('积分变动会记录在这里，具体获取与使用规则以课程说明为准', 'Points changes appear here. Earning and usage rules follow each course description.')" :action="tr('看看课程', 'Browse courses')" @action="goCourses" />
          <text v-if="historyTotal > pointsHistory.length" class="list-note">{{ tr(`显示最近 ${pointsHistory.length} 条记录，共 ${historyTotal} 条`, `Showing the latest ${pointsHistory.length} of ${historyTotal} records`) }}</text>
        </template>
        <template v-else>
          <view v-for="group in voucherGroups" :key="group.title" class="voucher-group">
            <text class="group-title">{{ group.title }} · {{ group.items.length }}</text>
            <view v-for="voucher in group.items" :key="voucher.id" class="voucher-card" :class="{ inactive: voucher.statusClass !== 'active' }">
              <view class="voucher-value"><text class="voucher-mode">{{ voucher.modeLabel }}</text><text v-if="voucher.displayAmount !== null" class="voucher-amount">¥{{ voucher.displayAmount }}</text><text v-else class="voucher-mode">{{ tr('金额待确认', 'Amount pending') }}</text></view>
              <view class="voucher-copy">
                <text class="voucher-name">{{ voucher.name }}</text>
                <text class="secondary">{{ voucher.condition }}</text>
                <text class="secondary">{{ voucher.expire }}</text>
                <button v-if="voucher.statusClass === 'active'" class="use-button" @tap="useVoucher(voucher)">{{ tr('去使用', 'Use now') }}<PresenceIcon name="arrow" :size="26" /></button>
                <text v-else class="status-label">{{ voucher.statusLabel }}</text>
              </view>
            </view>
          </view>
          <PageState v-if="!vouchers.length" state="empty" :title="tr('暂无代金券', 'No vouchers yet')" :message="tr('获得的代金券及使用状态会展示在这里', 'Vouchers you receive and their status appear here')" :action="tr('看看课程', 'Browse courses')" @action="goCourses" />
        </template>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { getPoints, getPointsHistory } from '@/api/user'
import { listMyVouchers, type VoucherItem } from '@/api/voucher'
import { useUserStore } from '@/stores/user'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PresenceIcon from '@/components/PresenceIcon.vue'
import PageState from '@/components/PageState.vue'
import FloatingBack from '@/components/FloatingBack.vue'

const userStore = useUserStore()
const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop
const isLoggedIn = computed(() => userStore.isLoggedIn)
const currentTab = ref('points')
const tabs = computed(() => [{ value: 'points', label: tr('积分明细', 'Points history') }, { value: 'vouchers', label: tr('代金券', 'Vouchers') }])
const loading = ref(false)
const loadError = ref(false)
const pointsBalance = ref(0)
const historyTotal = ref(0)
const pointsHistory = ref<Array<{ id: string; title: string; amount: number; time: string }>>([])
// mode/targetPrice are returned by the voucher service, but not yet declared in the shared client type.
type ServerVoucher = VoucherItem & { mode?: string; targetPrice?: number | null }
interface VoucherView { id: string; amount: number; displayAmount: number | null; modeLabel: string; name: string; condition: string; expire: string; statusLabel: string; statusClass: string; courseIds: string[]; applicableAll: boolean }
const vouchers = ref<VoucherView[]>([])
const usableVoucherCount = computed(() => vouchers.value.filter(v => v.statusClass === 'active').length)
const voucherGroups = computed(() => [
  { title: tr('可使用', 'Available'), items: vouchers.value.filter(v => v.statusClass === 'active') },
  { title: tr('已使用 / 已失效', 'Used / expired'), items: vouchers.value.filter(v => v.statusClass !== 'active') },
].filter(group => group.items.length))

function formatTime(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  if (isEnglish()) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function toVoucher(v: ServerVoucher): VoucherView {
  const date = new Date(v.expiresAt).getTime()
  const expired = v.status === 'EXPIRED' || (Number.isFinite(date) && date <= Date.now())
  const amount = Number(v.amount)
  const reduceTo = v.mode === 'REDUCE_TO'
  const rawAmount = reduceTo ? v.targetPrice : v.amount
  const displayAmount = rawAmount != null && Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : null
  const usable = v.status === 'UNUSED' && Number.isFinite(date) && !expired && displayAmount !== null
  const statusLabel = v.status === 'USED' ? tr('已使用', 'Used') : v.status === 'REVOKED' ? tr('已撤销', 'Revoked') : expired ? tr('已过期', 'Expired') : usable ? tr('可使用', 'Available') : tr('暂不可用', 'Unavailable')
  const courseIds = Array.isArray(v.applicableCourseIds) ? v.applicableCourseIds : []
  return {
    id: v.id, amount, displayAmount,
    modeLabel: reduceTo ? tr('减至券', 'Reduce-to voucher') : tr('减额券', 'Discount voucher'),
    name: v.source || tr('代金券', 'Voucher'),
    condition: v.applicableAll ? tr('全部课程可用', 'Valid for all courses') : tr(`指定 ${courseIds.length} 门课程可用`, `Valid for ${courseIds.length} selected courses`),
    expire: formatTime(v.expiresAt) ? tr(`有效期至 ${formatTime(v.expiresAt)}`, `Valid until ${formatTime(v.expiresAt)}`) : tr('有效期信息暂缺', 'Expiry information unavailable'),
    statusLabel, statusClass: usable ? 'active' : 'inactive', courseIds, applicableAll: v.applicableAll,
  }
}
async function loadData() {
  if (!uni.getStorageSync('token')) userStore.logout()
  if (!isLoggedIn.value) { pointsBalance.value = 0; pointsHistory.value = []; vouchers.value = []; return }
  if (loading.value) return
  loading.value = true
  loadError.value = false
  try {
    const [pts, history, vlist] = await Promise.all([getPoints(), getPointsHistory(), listMyVouchers()])
    if (!uni.getStorageSync('token')) { userStore.logout(); return }
    pointsBalance.value = pts.balance
    pointsHistory.value = (history.items || []).map(it => ({ id: it.id, title: it.reason || it.type || tr('积分变动', 'Points change'), amount: it.amount, time: formatTime(it.createdAt) }))
    historyTotal.value = history.total
    vouchers.value = (vlist || []).map(toVoucher)
  } catch {
    loadError.value = true
    if (!uni.getStorageSync('token')) userStore.logout()
  } finally { loading.value = false }
}
function useVoucher(voucher: VoucherView) {
  if (voucher.statusClass !== 'active') return
  if (!voucher.applicableAll && voucher.courseIds.length === 1) uni.navigateTo({ url: `/pages/course-detail/index?id=${encodeURIComponent(voucher.courseIds[0])}` })
  else goCourses()
}
function goCourses() { uni.switchTab({ url: '/pages/index/index' }) }
function goLogin() { uni.switchTab({ url: '/pages/profile/index' }) }
function goBack() { if (getCurrentPages().length > 1) uni.navigateBack(); else goLogin() }
onLoad((query) => { if (query?.tab === 'vouchers') currentTab.value = 'vouchers' })
onShow(loadData)
</script>

<style scoped>
.page { min-height: 100vh; background: var(--c-cream); color: var(--c-ink); font-size: 28rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); }
.nav-bar { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 32rpx; }
.back-spacer { width: 80rpx; height: 80rpx; flex-shrink: 0; }
.nav-title { font-size: 36rpx; }
button::after { border: none; }
.content { padding: 0 32rpx; }
.balance-card { background: var(--c-primary); color: var(--c-rice); padding: 36rpx 40rpx; border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.eyebrow { color: var(--c-gold); font-size: 22rpx; letter-spacing: 3rpx; }
.balance-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 28rpx; }
.balance-item + .balance-item { padding-left: 32rpx; border-left: 1rpx solid var(--c-brown); }
.balance-value { display: block; font-size: 56rpx; font-weight: 600; overflow-wrap: anywhere; }
.balance-label { display: block; font-size: 24rpx; margin-top: 8rpx; }
.tabs { display: flex; gap: 32rpx; margin: 28rpx 0; border-bottom: 2rpx solid var(--line-soft); }
.tab { margin: 0; padding: 22rpx 4rpx; border-radius: 0; font-size: 28rpx; color: var(--c-muted); background: transparent; line-height: 1.6; border-bottom: 3rpx solid transparent; }
.tab.active { color: var(--c-primary); border-bottom-color: var(--c-primary); font-weight: 600; }
.ledger-card { padding: 12rpx 36rpx; background: var(--c-card); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.ledger-row { display: flex; align-items: center; gap: 24rpx; padding: 28rpx 0; border-bottom: 1rpx solid var(--line-soft); }
.ledger-row:last-child { border-bottom: none; }
.ledger-copy { flex: 1; min-width: 0; }
.ledger-title { display: block; line-height: 1.7; overflow-wrap: anywhere; }
.secondary { display: block; font-size: 24rpx; color: var(--c-muted); line-height: 1.7; margin-top: 6rpx; }
.ledger-amount { font-size: 30rpx; font-weight: 600; }
.ledger-amount.positive { color: var(--c-brown); }
.list-note { display: block; font-size: 24rpx; color: var(--c-muted); text-align: center; margin: 24rpx 0; }
.group-title { display: block; font-size: 28rpx; margin: 28rpx 0 20rpx; font-weight: 600; }
.voucher-card { display: flex; background: var(--c-card); border-radius: var(--radius-card); overflow: hidden; margin-bottom: 24rpx; box-shadow: var(--shadow-card); }
.voucher-value { width: 192rpx; flex-shrink: 0; padding: 32rpx 16rpx; box-sizing: border-box; background: var(--c-card-2); color: var(--c-primary); display: flex; flex-direction: column; justify-content: center; align-items: center; border-right: 2rpx dashed var(--line-soft); }
.voucher-mode { font-size: 24rpx; }
.voucher-amount { font-size: 40rpx; font-weight: 600; margin-top: 12rpx; overflow-wrap: anywhere; }
.voucher-copy { flex: 1; min-width: 0; padding: 28rpx 24rpx; }
.voucher-name { font-size: 30rpx; font-weight: 600; overflow-wrap: anywhere; }
.use-button { display: inline-flex; align-items: center; gap: 10rpx; margin: 16rpx 0 0; padding: 14rpx 24rpx; min-height: 72rpx; box-sizing: border-box; background: var(--c-card); color: var(--c-primary); border: 2rpx solid var(--c-primary); border-radius: var(--radius-button); font-size: 26rpx; line-height: 1.6; }
.status-label { display: inline-block; margin-top: 16rpx; padding: 8rpx 16rpx; background: var(--c-card-2); color: var(--c-muted); font-size: 24rpx; border-radius: 12rpx; }
.inactive .voucher-value { color: var(--c-muted); }
</style>
