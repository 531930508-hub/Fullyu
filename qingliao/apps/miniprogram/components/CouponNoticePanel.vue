<template>
  <view v-if="hasNotices" class="coupon-notices">
    <button class="notice-heading" @click="expanded = !expanded" :aria-expanded="expanded">
      <text class="notice-title">{{ t('卡券到期提醒') }}</text>
      <text class="notice-count" v-if="inbox.unreadCount">{{inbox.unreadCount > 99 ? '99+' : inbox.unreadCount}}{{ t(' 条未读') }}</text>
      <text class="notice-toggle">{{expanded ? t('收起') : t('查看')}}</text>
    </button>
    <view v-if="expanded" class="notice-body">
      <view class="notice-explanation">{{ t('到期前 5 天、3 天提醒。请以卡券当前状态为准。') }}</view>
      <view v-if="inbox.loading" class="notice-state" role="status">{{ t('正在读取提醒…') }}</view>
      <view v-else-if="inbox.error" class="notice-state">
        <text>{{inbox.error}}</text>
        <button class="notice-action" @click="load(inbox.page)">{{ t('重新加载') }}</button>
      </view>
      <view v-else-if="!inbox.items.length" class="notice-state">{{ t('还没有到期提醒，安心安排下一次相愈。') }}</view>
      <view v-else>
        <view v-for="row in inbox.items" :key="row.id" class="notice-row" :class="{'notice-read': row.readAt}">
          <view class="notice-row-heading">
            <text class="notice-row-title">{{row.title}}</text>
            <text class="notice-unread" v-if="!row.readAt">{{ t('未读') }}</text>
          </view>
          <view class="notice-copy">{{row.body}}</view>
          <view class="notice-row-actions">
            <button v-if="!row.readAt" class="notice-action" :disabled="inbox.readingIds.includes(row.id)" @click="markRead(row)">{{ t('标为已读') }}</button>
            <button class="notice-action" @click="book">{{ t('去预约') }}</button>
          </view>
        </view>
        <view class="notice-pagination" v-if="inbox.total > inbox.size">
          <button class="notice-action" :disabled="inbox.loading || inbox.page === 1" @click="load(inbox.page - 1)">{{ t('上一页') }}</button>
          <text>{{inbox.page}} / {{Math.ceil(inbox.total / inbox.size)}}</text>
          <button class="notice-action" :disabled="inbox.loading || inbox.page * inbox.size >= inbox.total" @click="load(inbox.page + 1)">{{ t('下一页') }}</button>
        </view>
      </view>
      <button class="notice-subscribe" :disabled="subscribing || !configuration" @click="subscribe">{{subscribing ? t('正在记录授权…') : t('开启微信到期提醒')}}</button>
      <view class="notice-explanation">{{ t('微信提醒需要您的授权；未开启也可在这里查看。') }}</view>
    </view>
  </view>
</template>



<script setup>
	import { t } from '../utils/locale'
import {ref, reactive, computed, onMounted, onBeforeUnmount} from 'vue'
import api from '../api/customerNotice'
import {newNoticeState, resetNotices, loadNotices, readNotice, subscribeCouponNotice} from '../utils/couponNotices'
const props = defineProps({
  defaultExpanded: {type: Boolean, default: false}
})
const expanded = ref(props.defaultExpanded)
const subscribing = ref(false)
const inbox = reactive(newNoticeState())
//没有到期提醒时不展示任何固定入口，避免占位菜单
const hasNotices = computed(() => inbox.total > 0 || inbox.items.length > 0)
const configuration = ref(null)
let configurationRequestId = 0
const load = page => loadNotices(inbox, api, page, t)
const refresh = async () => {
  const requestId = ++configurationRequestId
  await Promise.all([
    load(1),
    api.config().then(config => { if (requestId === configurationRequestId) configuration.value = config })
      .catch(() => { if (requestId === configurationRequestId) configuration.value = null })
  ])
}
const markRead = async row => {
  try { await readNotice(inbox, api, row) }
  catch { uni.showToast({title: t('未能标为已读，请重试'), icon: 'none'}) }
}
const book = () => uni.navigateTo({url: '/pages/index/select-project'})
const authorize = ids => new Promise((resolve, reject) => {
  // #ifdef MP-WEIXIN
  uni.requestSubscribeMessage({tmplIds: ids, success: resolve, fail: reject})
  // #endif
  // #ifndef MP-WEIXIN
  reject(new Error('请在小程序中开启微信提醒'))
  // #endif
})
const subscribe = async () => {
  if (subscribing.value || !configuration.value) return
  subscribing.value = true
  try {
    const result = await subscribeCouponNotice(api, authorize, undefined, configuration.value, t)
    const text = result.status === 'not-configured' ? t('微信提醒准备中，站内提醒会保留')
      : result.status === 'accept' ? (result.realDeliveryEnabled ? t('提醒授权已记录') : t('授权已记录，微信发送尚未开启'))
      : t('暂未开启微信提醒，站内提醒会保留')
    uni.showToast({title: text, icon: 'none'})
  } catch (error) {
    uni.showToast({title: t('未能完成提醒授权，请稍后重试'), icon: 'none'})
  } finally { subscribing.value = false }
}
onMounted(refresh)
onBeforeUnmount(() => { configurationRequestId++; resetNotices(inbox) })
defineExpose({refresh})
</script>

<style scoped>
.coupon-notices {
  --notice-ink: #584219;
  --notice-muted: #8A6A40;
  --notice-line: #E6E2DC;
  --notice-surface: #FFFFFF;
  color: var(--notice-ink);
  background: var(--notice-surface);
  border-radius: 24rpx;
  letter-spacing: 0.05em;
  font-size: 28rpx;
  line-height: 1.7;
  overflow: hidden;
}
.coupon-notices button { font-size: 26rpx; line-height: 1.7; margin: 0; background: transparent; color: var(--notice-ink); letter-spacing: 0.05em; }
.coupon-notices button::after { border: none; }
.notice-heading { width: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx; min-height: 88rpx; padding: 20rpx 24rpx; text-align: left; }
.notice-title { font-weight: 600; letter-spacing: 0.06em; }
.notice-count { color: var(--notice-muted); font-size: 24rpx; }
.notice-toggle { margin-left: auto; color: var(--notice-muted); }
.notice-body { padding: 0 24rpx 24rpx; }
.notice-explanation { color: var(--notice-muted); font-size: 24rpx; }
.notice-state { padding: 24rpx 0; }
.notice-row { padding: 24rpx 0; border-bottom: 1rpx solid var(--notice-line); }
.notice-row-heading { display: flex; align-items: baseline; gap: 16rpx; }
.notice-row-title { flex: 1; font-weight: 600; }
.notice-unread { color: var(--notice-muted); font-size: 24rpx; flex-shrink: 0; }
.notice-copy { margin-top: 8rpx; overflow-wrap: anywhere; }
.notice-row-actions { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 12rpx; }
.coupon-notices .notice-action { padding: 8rpx 16rpx; min-height: 72rpx; border: 1rpx solid var(--notice-line); border-radius: 12rpx; }
.notice-read .notice-row-title { font-weight: 400; }
.notice-pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 24rpx; gap: 12rpx; }
.coupon-notices .notice-subscribe { width: 100%; margin: 24rpx 0 12rpx; padding: 16rpx; border: 1rpx solid var(--notice-line); border-radius: 16rpx; }
.coupon-notices button[disabled] { opacity: .5; }
</style>
