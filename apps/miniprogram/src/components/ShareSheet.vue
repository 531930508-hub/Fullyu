<template>
  <view>
    <BottomSheet :show="show" :title="tr('分享', 'Share')" :busy="posterBusy" @close="close">
      <view v-if="targets.length > 1" class="target-tabs">
        <button
          v-for="item in targets"
          :key="`${item.type}-${item.id}`"
          class="target-tab"
          :class="{ active: item.type === activeType }"
          @tap="selectTarget(item)"
        >{{ item.label }}</button>
      </view>

      <PageState v-if="loading" state="loading" :title="tr('正在准备分享内容', 'Preparing share preview')" />
      <PageState
        v-else-if="loadError"
        state="error"
        :title="tr('分享内容暂时不可用', 'Share preview unavailable')"
        :message="loadError"
        :action="tr('重试', 'Retry')"
        @action="load"
      />
      <template v-else-if="payload">
        <view class="share-preview">
          <image v-if="payload.imageUrl && !artFailed" class="preview-image" :src="payload.imageUrl" mode="aspectFill" @error="artFailed = true" />
          <BrandCover v-else :label="payload.title" height="420rpx" icon="leaf" />
          <view class="preview-meta">
            <text class="preview-title serif">{{ payload.title }}</text>
            <text class="preview-sub">{{ payload.subtitle }}</text>
          </view>
        </view>

        <view v-if="payload.state !== 'normal'" class="state-note" :class="payload.state">
          <PresenceIcon :name="payload.state === 'ended' ? 'clock' : 'info'" :size="30" />
          <text v-if="payload.state === 'ended'">{{ tr('内容已结束，分享后仍可查看回顾信息。', 'This has ended. The shared link still shows its recap.') }}</text>
          <text v-else-if="payload.state === 'restricted'">{{ tr('该社群仅展示公开身份，不展示内部内容。', 'Only public identity is shown for this community.') }}</text>
          <text v-else>{{ payload.reason || tr('内容暂不可分享。', 'This item is not shareable right now.') }}</text>
        </view>

        <text class="share-hint">{{ tr('卡片与海报都使用固定的 5:4 视觉，海报右下角附带可扫码进入的小程序码。', 'Card and poster share the same 5:4 artwork. The poster includes a scannable mini-program code.') }}</text>

        <text class="share-hint muted">{{ tr('分享只展示公开信息，扫码后仍需按社群规则加入或登录。', 'Only public information is shared. Joining or logging in is still required on the landing page.') }}</text>

        <text v-if="posterError" class="error-text">{{ posterError }}</text>
        <view v-if="posterPath" class="poster-result">
          <image class="poster-image" :src="posterPath" mode="widthFix" @tap="previewPoster" />
          <text class="share-hint muted">{{ tr('海报已生成，点图片可预览放大。', 'Poster ready. Tap to preview.') }}</text>
        </view>
      </template>

      <template #actions>
        <!-- #ifdef MP-WEIXIN -->
        <button class="btn-secondary" :disabled="!payload || !payload.available || posterBusy" open-type="share">{{ tr('发送给朋友', 'Send to a friend') }}</button>
        <!-- #endif -->
        <!-- #ifdef H5 -->
        <button class="btn-secondary" :disabled="!payload || posterBusy" @tap="copyLink">{{ tr('复制链接', 'Copy link') }}</button>
        <!-- #endif -->
        <button class="btn-primary" :disabled="!payload || !payload.available || posterBusy" @tap="makePoster">{{ posterBusy ? tr('生成中…', 'Generating…') : tr('保存海报', 'Save poster') }}</button>
      </template>
    </BottomSheet>

    <canvas canvas-id="sharePoster" id="sharePoster" class="poster-canvas" :style="{ width: posterW + 'px', height: posterH + 'px' }"></canvas>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from 'vue'
import { fetchShareTarget, type SharePayload, type ShareType } from '@/api/skool'
import { buildH5SceneUrl, type ShareTargetOption } from '@/utils/share'
import { generateSharePoster, savePosterImage, POSTER_WIDTH, POSTER_HEIGHT } from '@/utils/share-poster'
import { tr } from '@/locale'
import BottomSheet from './BottomSheet.vue'
import BrandCover from './BrandCover.vue'
import PageState from './PageState.vue'
import PresenceIcon from './PresenceIcon.vue'

const props = withDefaults(defineProps<{
  show: boolean
  targets: ShareTargetOption[]
  palette?: 'warm' | 'sage' | 'ink'
}>(), { palette: 'warm' })

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'payload', payload: SharePayload | null): void
}>()

const instance = getCurrentInstance()
const activeType = ref<ShareType>('community')
const activeId = ref('')
const payload = ref<SharePayload | null>(null)
const loading = ref(false)
const loadError = ref('')
const artFailed = ref(false)
const posterBusy = ref(false)
const posterError = ref('')
const posterPath = ref('')
const posterW = POSTER_WIDTH
const posterH = POSTER_HEIGHT

const activeTarget = computed(() => props.targets.find(item => item.type === activeType.value) || props.targets[0])

watch(() => props.show, (show) => {
  if (!show) {
    emit('payload', null)
    return
  }
  const first = props.targets[0]
  activeType.value = first?.type || 'community'
  activeId.value = first?.id || ''
  posterPath.value = ''
  posterError.value = ''
  load()
}, { immediate: true })

function selectTarget(item: ShareTargetOption) {
  if (posterBusy.value || (item.type === activeType.value && item.id === activeId.value)) return
  activeType.value = item.type
  activeId.value = item.id
  posterPath.value = ''
  posterError.value = ''
  load()
}

async function load() {
  if (!activeTarget.value?.id) {
    loadError.value = tr('缺少分享内容。', 'Share content is missing.')
    return
  }
  loading.value = true
  loadError.value = ''
  artFailed.value = false
  payload.value = null
  emit('payload', null)
  try {
    const result = await fetchShareTarget(activeTarget.value.type, activeTarget.value.id)
    if (!result || !result.scene) throw new Error(tr('分享信息不完整，请重试。', 'Share information is incomplete. Please retry.'))
    payload.value = result
    emit('payload', result)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : tr('网络暂不可用，请稍后重试。', 'Network unavailable. Please retry later.')
  } finally {
    loading.value = false
  }
}

function close() {
  if (posterBusy.value) return
  emit('close')
}

async function makePoster() {
  if (!payload.value || posterBusy.value) return
  posterBusy.value = true
  posterError.value = ''
  posterPath.value = ''
  try {
    posterPath.value = await generateSharePoster(instance || undefined, {
      title: payload.value.title,
      subtitle: payload.value.subtitle,
      label: labelOf(payload.value.type),
      scene: payload.value.scene,
      palette: props.palette,
    })
    await savePosterImage(posterPath.value)
    uni.showToast({ title: tr('海报已保存', 'Poster saved'), icon: 'success' })
  } catch (error) {
    posterError.value = error instanceof Error ? error.message : tr('海报生成失败，请重试。', 'Could not generate the poster. Please retry.')
  } finally {
    posterBusy.value = false
  }
}

function previewPoster() {
  if (posterPath.value) uni.previewImage({ urls: [posterPath.value] })
}

function copyLink() {
  if (!payload.value) return
  uni.setClipboardData({
    data: buildH5SceneUrl(payload.value.scene),
    success: () => uni.showToast({ title: tr('链接已复制', 'Link copied'), icon: 'none' }),
  })
}

function labelOf(type: ShareType) {
  if (type === 'course') return tr('课程', 'Course')
  if (type === 'community') return tr('社群', 'Community')
  if (type === 'event') return tr('社群活动', 'Community event')
  if (type === 'host') return tr('主理人', 'Host')
  return tr('邀请', 'Invitation')
}
</script>

<style scoped>
.target-tabs { display: flex; gap: 12rpx; overflow-x: auto; padding-bottom: 20rpx; }
.target-tab { flex: 0 0 auto; min-height: 60rpx; padding: 8rpx 24rpx; border-radius: 30rpx; background: var(--c-card-2); color: var(--c-muted); font-size: 24rpx; }
.target-tab.active { background: var(--c-primary); color: var(--c-rice); }
.share-preview { border-radius: var(--radius-card); overflow: hidden; background: var(--c-card-2); }
.preview-image { width: 100%; height: 420rpx; display: block; }
.preview-meta { padding: 20rpx 24rpx 24rpx; display: flex; flex-direction: column; gap: 6rpx; }
.preview-title { font-size: 32rpx; color: var(--c-ink); }
.preview-sub { font-size: 24rpx; color: var(--c-muted); }
.state-note { margin-top: 16rpx; padding: 20rpx 24rpx; border-radius: 20rpx; background: var(--c-card-2); color: var(--c-muted); font-size: 24rpx; display: flex; gap: 12rpx; align-items: flex-start; }
.state-note.restricted, .state-note.unavailable { background: #f7e9e4; color: var(--c-error); }
.share-hint { display: block; margin-top: 16rpx; font-size: 24rpx; line-height: 1.7; color: var(--c-ink); }
.share-hint.muted { color: var(--c-muted); }
.error-text { display: block; margin-top: 16rpx; font-size: 24rpx; color: var(--c-error); }
.poster-result { margin-top: 20rpx; }
.poster-image { width: 100%; border-radius: 24rpx; display: block; background: var(--c-card-2); }
.poster-canvas { position: fixed; left: -2000px; top: 0; pointer-events: none; }
</style>
