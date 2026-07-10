<template>
  <a-modal :open="open" title="裁剪封面（正方形）" width="520px" @ok="handleConfirm" @cancel="handleCancel" :ok-button-props="{ disabled: !imgLoaded }">
    <div v-if="!rawSrc" style="text-align: center; padding: 24px;">
      <a-upload :show-upload-list="false" :before-upload="handleSelect" accept="image/*">
        <a-button type="primary">选择图片</a-button>
      </a-upload>
      <div style="color: #999; font-size: 12px; margin-top: 12px;">建议上传正方形图片，支持拖动与缩放调整裁剪区域</div>
    </div>
    <div v-else>
      <div class="crop-viewport"
        @mousedown="onDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onUp">
        <img ref="imgEl" :src="rawSrc" class="crop-img"
          :style="{ transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }"
          @load="onImgLoad" draggable="false" />
        <div class="crop-mask"></div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-top: 16px;">
        <span style="font-size: 13px; color: #666;">缩放</span>
        <a-slider style="flex: 1;" :min="0.2" :max="3" :step="0.01" v-model:value="scale" />
        <a-button size="small" @click="reset">重置</a-button>
        <a-upload :show-upload-list="false" :before-upload="handleSelect" accept="image/*">
          <a-button size="small">重新选择</a-button>
        </a-upload>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { message } from 'ant-design-vue'

const props = defineProps<{ open: boolean; output?: number }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'cropped', dataUrl: string): void }>()

const VIEW = 300 // 裁剪视口边长（正方形）
const outputSize = props.output || 400

const rawSrc = ref('')
const imgEl = ref<HTMLImageElement>()
const imgLoaded = ref(false)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const natW = ref(0)
const natH = ref(0)

const dragging = ref(false)
const startX = ref(0)
const startY = ref(0)

watch(() => props.open, v => {
  if (v) {
    rawSrc.value = ''
    imgLoaded.value = false
    scale.value = 1
    offsetX.value = 0
    offsetY.value = 0
  }
})

function handleSelect(file: File) {
  const reader = new FileReader()
  reader.onload = e => {
    rawSrc.value = e.target?.result as string
    imgLoaded.value = false
  }
  reader.readAsDataURL(file)
  return false
}

function onImgLoad() {
  const el = imgEl.value
  if (!el) return
  natW.value = el.naturalWidth
  natH.value = el.naturalHeight
  // 初始缩放：使图片较短边填满视口
  const base = VIEW / Math.min(natW.value, natH.value)
  scale.value = base
  offsetX.value = (VIEW - natW.value * base) / 2
  offsetY.value = (VIEW - natH.value * base) / 2
  imgLoaded.value = true
}

function reset() {
  onImgLoad()
}

function onDown(e: MouseEvent) {
  dragging.value = true
  startX.value = e.clientX - offsetX.value
  startY.value = e.clientY - offsetY.value
}
function onMove(e: MouseEvent) {
  if (!dragging.value) return
  offsetX.value = e.clientX - startX.value
  offsetY.value = e.clientY - startY.value
}
function onUp() {
  dragging.value = false
}

function handleConfirm() {
  if (!imgLoaded.value || !imgEl.value) {
    message.warning('请先选择图片')
    return
  }
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, outputSize, outputSize)
  // 视口坐标 → 原图坐标映射，再放大到输出尺寸
  // 视口内 (0,0) 对应原图上的点：(-offset)/scale
  const sx = -offsetX.value / scale.value
  const sy = -offsetY.value / scale.value
  const sw = VIEW / scale.value
  const sh = VIEW / scale.value
  ctx.drawImage(imgEl.value, sx, sy, sw, sh, 0, 0, outputSize, outputSize)
  emit('cropped', canvas.toDataURL('image/jpeg', 0.9))
  emit('update:open', false)
}

function handleCancel() {
  emit('update:open', false)
}
</script>

<style scoped>
.crop-viewport {
  width: 300px; height: 300px; margin: 0 auto; position: relative;
  overflow: hidden; border-radius: 8px; background: #f0ebe5; cursor: move;
  border: 1px solid #e0d5c8;
}
.crop-img { position: absolute; top: 0; left: 0; transform-origin: 0 0; user-select: none; }
.crop-mask {
  position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(107,70,60,0.4);
}
</style>
