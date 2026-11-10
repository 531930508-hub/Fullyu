<template>
  <view v-if="show" class="sheet-mask" :class="{ 'sheet-mask-center': center }" @tap="close" @touchmove.stop.prevent>
    <view ref="dialogRef" class="bottom-sheet" :class="{ 'sheet-center': center }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" @tap.stop>
      <view v-if="!center" class="sheet-grab"></view>
      <!-- center 模式：卡片自带居中欢迎区，隐藏标题条；关闭按钮悬浮右上角（已批准提案） -->
      <view v-if="!center" class="sheet-heading">
        <text class="sheet-title serif">{{ title }}</text>
        <button class="sheet-close" :aria-label="tr('关闭', 'Close')" :disabled="busy" @tap="close"><PresenceIcon name="close" :size="36" /></button>
      </view>
      <button v-else class="sheet-close sheet-close-float" :aria-label="tr('关闭', 'Close')" :disabled="busy" @tap="close"><PresenceIcon name="close" :size="32" /></button>
      <scroll-view scroll-y class="sheet-scroll"><slot /></scroll-view>
      <view v-if="$slots.actions" class="sheet-actions"><slot name="actions" /></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import PresenceIcon from './PresenceIcon.vue'
import { tr } from '@/locale'
// center：登录等需要视线居中的弹层使用居中卡片；其余保持底部抽屉（对齐时叙 BottomSheet center 模式）
const props = withDefaults(defineProps<{ show: boolean; title: string; busy?: boolean; center?: boolean }>(), { busy: false, center: false })
const emit = defineEmits<{ (e: 'close'): void }>()
const dialogRef = ref<any>(null)
function close() { if (!props.busy) emit('close') }

// #ifdef H5
// Keep keyboard users inside the active dialog, then return to its trigger.
let previousFocus: HTMLElement | null = null
let previousOverflow = ''
let listening = false
function dialogElement(): HTMLElement | null { return dialogRef.value?.$el || dialogRef.value }
function focusableElements() {
  const root = dialogElement()
  return root ? Array.from(root.querySelectorAll<HTMLElement>('button,input,textarea,select,a[href],[tabindex]'))
    .filter(el => el.tabIndex >= 0 && !el.hasAttribute('disabled') && el.getClientRects().length > 0) : []
}
function onDialogKey(event: KeyboardEvent) {
  if (!props.show) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
  if (event.key !== 'Tab') return
  const root = dialogElement()
  const items = focusableElements()
  const first = items[0], last = items[items.length - 1]
  if (!first) { event.preventDefault(); root?.focus({ preventScroll: true }); return }
  const active = document.activeElement
  if (!root?.contains(active) || active === root || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus({ preventScroll: true })
  }
}
function releaseFocus() {
  if (!listening) return
  document.removeEventListener('keydown', onDialogKey, true)
  document.body.style.overflow = previousOverflow
  listening = false
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  previousFocus = null
}
watch(() => props.show, async show => {
  if (!show) { releaseFocus(); return }
  previousFocus = document.activeElement as HTMLElement | null
  await nextTick()
  if (!props.show || !dialogElement()) return
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', onDialogKey, true)
  listening = true
  ;(focusableElements()[0] || dialogElement())?.focus({ preventScroll: true })
}, { immediate: true })
onBeforeUnmount(releaseFocus)
// #endif
</script>
<style scoped>
.sheet-mask { position: fixed; inset: 0; z-index: 2000; background: rgba(58,42,26,.4); display: flex; align-items: flex-end; justify-content: center; }
/* 居中卡片模式：屏幕正中弹窗，登录使用（已批准提案：无标题条、内容自带欢迎区） */
.sheet-mask-center { align-items: center; padding: calc(40rpx + env(safe-area-inset-top)) 48rpx calc(40rpx + env(safe-area-inset-bottom)); }
.bottom-sheet { width: 100%; max-width: 480px; max-height: 90vh; display: flex; flex-direction: column; padding: 16rpx 36rpx calc(32rpx + env(safe-area-inset-bottom)); border-radius: 40rpx 40rpx 0 0; background: var(--c-card); outline: none; }
.sheet-center { width: 100%; max-width: 620rpx; max-height: 80vh; border-radius: 40rpx; padding: 20rpx 36rpx 40rpx; box-shadow: 0 24rpx 64rpx rgba(58,42,26,.28); position: relative; }
/* 居中弹窗：关闭按钮绝对定位右上角，不占用内容行 */
.sheet-close-float { position: absolute; right: 16rpx; top: 16rpx; width: 64rpx; height: 64rpx; min-height: 0; padding: 0; margin: 0; border: 0; display: flex; justify-content: center; align-items: center; background: var(--c-card-2); border-radius: 50%; z-index: 2; }
.sheet-center .sheet-scroll { text-align: center; }
.sheet-center .sheet-actions { flex-direction: column; }
.sheet-center .sheet-actions :deep(button) { width: 100%; margin: 0; flex: none; }
.sheet-grab { width: 72rpx; height: 8rpx; border-radius: 8rpx; background: var(--line-soft); margin: 0 auto 20rpx; flex-shrink: 0; }
.sheet-heading { display: flex; align-items: center; justify-content: space-between; gap: 24rpx; padding-bottom: 20rpx; flex-shrink: 0; }
.sheet-title { font-size: 40rpx; color: var(--c-ink); }
.sheet-close { width: 80rpx; height: 80rpx; padding: 0; border: 0; display: flex; justify-content: center; align-items: center; background: var(--c-card-2); border-radius: 50%; }
.sheet-scroll { max-height: 58vh; min-height: 0; }
.sheet-actions { display: flex; align-items: center; gap: 20rpx; padding-top: 24rpx; flex-shrink: 0; }
.sheet-actions :deep(button) { flex: 1; }
</style>
