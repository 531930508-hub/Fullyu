<template>
  <view class="page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <FloatingBack />
    <view class="nav-bar" :style="{ paddingTop: headerTop + 'px' }">
      <view class="back-spacer"></view>
      <text class="nav-title serif">{{ tr('分享', 'Share') }}</text>
      <view class="nav-space"></view>
    </view>

    <PageState v-if="loading" state="loading" :title="tr('正在打开分享内容', 'Opening shared content')" />
    <PageState
      v-else-if="errorMessage"
      state="error"
      :title="tr('这个分享暂时打不开', 'This share cannot be opened')"
      :message="errorMessage"
      :action="tr('重试', 'Retry')"
      @action="open"
    />

    <view v-else-if="payload && payload.type === 'invite' && invite" class="content">
      <view class="hero">
        <image v-if="invite.community.cover && !coverFailed" class="hero-image" :src="invite.community.cover" mode="aspectFill" @error="coverFailed = true" />
        <BrandCover v-else :label="invite.community.name" height="320rpx" icon="leaf" />
      </view>
      <view class="content-inner">
        <view class="card invite-card">
          <text class="eyebrow">{{ kindLabel(invite.kind) }}</text>
          <text class="invite-title serif">{{ invite.name }}</text>
          <text class="community-name">{{ invite.community.name }}</text>
          <text v-if="invite.community.slogan" class="muted slogan">{{ invite.community.slogan }}</text>

          <view class="facts">
            <view class="fact"><text class="fact-label">{{ tr('权益', 'Benefit') }}</text><text class="fact-value">{{ benefitLabel(invite) }}</text></view>
            <view class="fact"><text class="fact-label">{{ tr('有效期', 'Valid until') }}</text><text class="fact-value">{{ expiryLabel(invite) }}</text></view>
            <view class="fact"><text class="fact-label">{{ tr('名额', 'Quota') }}</text><text class="fact-value">{{ quotaLabel(invite) }}</text></view>
          </view>

          <view class="notice">
            <PresenceIcon name="info" :size="30" />
            <text>{{ tr('领取邀请不等于直接入群：仍需按社群规则完成审核；减免只作用于本社群年费。', 'Claiming is not admission: approval still applies. The benefit only covers this community.' ) }}</text>
          </view>

          <text v-if="claimError" class="error-text">{{ claimError }}</text>

          <button v-if="claimed" class="btn-primary full-width" @tap="goCommunity">{{ tr('去社群', 'Open community') }}</button>
          <button v-else-if="!invite.available" class="btn-disabled full-width" disabled>{{ invite.reason || tr('邀请已失效', 'Invitation unavailable') }}</button>
          <button v-else class="btn-primary full-width" :disabled="claimBusy" @tap="onClaim">
            {{ claimBusy ? tr('处理中…', 'Processing…') : guest ? tr('登录后领取', 'Log in to claim') : tr('领取邀请', 'Claim invitation') }}
          </button>
          <button class="btn-secondary full-width spacing" @tap="goCommunity">{{ tr('先看看社群', 'View community first') }}</button>
        </view>
      </view>
    </view>

    <PageState
      v-else-if="payload && !payload.available"
      state="error"
      :title="tr('内容已不可用', 'Content unavailable')"
      :message="payload.reason || tr('内容可能已下架、删除或过期。', 'It may have been removed, hidden or expired.')"
      :action="tr('回到社群广场', 'Back to communities')"
      @action="goHub"
    />

    <PageState
      v-else
      state="loading"
      :title="tr('正在跳转', 'Opening')"
      :message="tr('马上带你进入对应页面。', 'Taking you to the page now.')"
    />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { fetchInvite, resolveShareScene, claimInvite, type CommunityInvitePublic, type ShareResolveResult } from '@/api/skool'
import { normalizeScene, goLoginFor } from '@/utils/share'
import { tr, isEnglish } from '@/locale'
import { readCapsuleLayout } from '@/utils/capsule'
import PageState from '@/components/PageState.vue'
import BrandCover from '@/components/BrandCover.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'
import FloatingBack from '@/components/FloatingBack.vue'

const capsule = readCapsuleLayout()
const statusBarHeight = capsule.statusBarHeight
const headerTop = capsule.headerTop

const scene = ref('')
const loading = ref(true)
const errorMessage = ref('')
const payload = ref<ShareResolveResult | null>(null)
const invite = ref<CommunityInvitePublic | null>(null)
const coverFailed = ref(false)
const claimBusy = ref(false)
const claimError = ref('')
const claimed = ref(false)
const guest = ref(!uni.getStorageSync('token'))

onLoad((query) => {
  scene.value = normalizeScene(query?.scene)
  if (!scene.value) {
    loading.value = false
    errorMessage.value = tr('分享链接不完整，请让分享者重新发送。', 'The share link is incomplete. Ask the sender to share again.')
    return
  }
  open()
})

async function open() {
  loading.value = true
  errorMessage.value = ''
  payload.value = null
  invite.value = null
  guest.value = !uni.getStorageSync('token')
  try {
    const result = await resolveShareScene(scene.value)
    if (!result || !result.type) throw new Error(result?.reason || tr('分享内容无法识别。', 'This share cannot be recognised.'))
    payload.value = result
    if (result.type === 'invite' && result.id) {
      invite.value = await fetchInvite(result.id)
      loading.value = false
      return
    }
    if (result.available && result.path) {
      go(result.path)
      return
    }
    loading.value = false
  } catch (error) {
    loading.value = false
    errorMessage.value = error instanceof Error ? error.message : tr('网络暂不可用，请稍后重试。', 'Network unavailable. Please retry later.')
  }
}

function go(path: string) {
  loading.value = true
  setTimeout(() => {
    uni.redirectTo({
      url: path,
      fail: () => {
        loading.value = false
        errorMessage.value = tr('页面跳转失败，请重试。', 'Could not open the page. Please retry.')
      },
    })
  }, 240)
}

async function onClaim() {
  if (!invite.value || claimBusy.value) return
  if (!uni.getStorageSync('token')) {
    goLoginFor(`/pages/share-landing/index?scene=${encodeURIComponent(scene.value)}`)
    return
  }
  claimBusy.value = true
  claimError.value = ''
  try {
    const result = await claimInvite(invite.value.id)
    if (result?.claimed !== true) throw new Error(tr('领取未成功，请重试。', 'The claim did not complete. Please retry.'))
    claimed.value = true
    uni.showToast({ title: tr('已领取', 'Claimed'), icon: 'success' })
    const communityId = result.communityId || invite.value.community.id
    setTimeout(() => go(`/pages/community-detail/index?id=${encodeURIComponent(communityId)}`), 500)
  } catch (error) {
    claimError.value = error instanceof Error ? error.message : tr('领取失败，请稍后重试。', 'Claim failed. Please retry later.')
  } finally {
    claimBusy.value = false
  }
}

function goCommunity() {
  const id = invite.value?.community.id
  if (id) go(`/pages/community-detail/index?id=${encodeURIComponent(id)}`)
}

function goHub() {
  uni.redirectTo({ url: '/pages/community-list/index' })
}

function kindLabel(kind: string) {
  if (kind === 'WAIVER') return tr('免年费礼遇', 'Annual fee waived')
  if (kind === 'REDUCE') return tr('年费减免', 'Annual fee discount')
  return tr('社群邀请', 'Community invitation')
}

function benefitLabel(value: CommunityInvitePublic) {
  if (value.kind === 'WAIVER') return tr('免年费加入', 'Join with no annual fee')
  if (value.kind === 'REDUCE') return tr(`减免 ¥${(value.amount / 100).toFixed(2)}`, `¥${(value.amount / 100).toFixed(2)} off`)
  return tr('邀请加入', 'Invited access')
}

function expiryLabel(value: CommunityInvitePublic) {
  if (!value.expiresAt) return tr('长期有效', 'No expiry')
  const date = new Date(value.expiresAt)
  if (Number.isNaN(date.getTime())) return tr('以社群说明为准', 'See community notice')
  if (isEnglish()) return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function quotaLabel(value: CommunityInvitePublic) {
  if (!value.quota) return tr('不限名额', 'Unlimited')
  return tr(`${value.claimedCount} / ${value.quota} 已领取`, `${value.claimedCount} / ${value.quota} claimed`)
}
</script>

<style scoped>
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 12rpx 32rpx 16rpx; }
.back-spacer, .nav-space { width: 120rpx; }
.nav-title { font-size: 34rpx; color: var(--c-ink); }
.content { padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); }
.hero { width: 100%; }
.hero-image { width: 100%; height: 320rpx; display: block; }
.content-inner { padding: 24rpx 32rpx 0; }
.invite-card { display: flex; flex-direction: column; gap: 10rpx; }
.eyebrow { font-size: 22rpx; letter-spacing: 2rpx; color: var(--c-brown); }
.invite-title { font-size: 44rpx; color: var(--c-ink); line-height: 1.35; }
.community-name { font-size: 28rpx; color: var(--c-ink); }
.slogan { font-size: 26rpx; line-height: 1.7; }
.facts { display: flex; gap: 16rpx; margin: 16rpx 0 4rpx; }
.fact { flex: 1; background: var(--c-card-2); border-radius: 20rpx; padding: 18rpx 20rpx; display: flex; flex-direction: column; gap: 4rpx; }
.fact-label { font-size: 22rpx; color: var(--c-muted); }
.fact-value { font-size: 26rpx; color: var(--c-ink); }
.notice { display: flex; gap: 12rpx; align-items: flex-start; background: var(--c-card-2); border-radius: 20rpx; padding: 20rpx 24rpx; font-size: 24rpx; line-height: 1.7; color: var(--c-muted); }
.error-text { font-size: 24rpx; color: var(--c-error); }
.full-width { width: 100%; }
.spacing { margin-top: 16rpx; }
</style>
