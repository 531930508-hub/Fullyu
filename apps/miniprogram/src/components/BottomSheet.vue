<template>
  <view v-if="show" class="sheet-mask" @tap="close" @touchmove.stop.prevent>
    <view ref="dialogRef" class="bottom-sheet" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" @tap.stop>
      <view class="sheet-grab"></view>
      <view class="sheet-heading">
        <text class="sheet-title serif">{{ title }}</text>
        <button class="sheet-close" :aria-label="tr('关闭', 'Close')" :disabled="busy" @tap="close"><PresenceIcon name="close" :size="36" /></button>
      </view>
      <scroll-view scroll-y class="sheet-scroll"><slot /></scroll-view>
      <view v-if="$slots.actions" class="sheet-actions"><slot name="actions" /></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import PresenceIcon from './PresenceIcon.vue'
import { tr } from '@/locale'
const props = withDefaults(defineProps<{ show: boolean; title: string; busy?: boolean }>(), { busy: false })
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
.bottom-sheet { width: 100%; max-width: 480px; max-height: 90vh; display: flex; flex-direction: column; padding: 16rpx 36rpx calc(32rpx + env(safe-area-inset-bottom)); border-radius: 40rpx 40rpx 0 0; background: var(--c-card); outline: none; }
.sheet-grab { width: 72rpx; height: 8rpx; border-radius: 8rpx; background: var(--line-soft); margin: 0 auto 20rpx; flex-shrink: 0; }
.sheet-heading { display: flex; align-items: center; justify-content: space-between; gap: 24rpx; padding-bottom: 20rpx; flex-shrink: 0; }
.sheet-title { font-size: 40rpx; color: var(--c-ink); }
.sheet-close { width: 80rpx; height: 80rpx; padding: 0; border: 0; display: flex; justify-content: center; align-items: center; background: var(--c-card-2); border-radius: 50%; }
.sheet-scroll { max-height: 58vh; min-height: 0; }
.sheet-actions { display: flex; align-items: center; gap: 20rpx; padding-top: 24rpx; flex-shrink: 0; }
.sheet-actions :deep(button) { flex: 1; }
</style>
