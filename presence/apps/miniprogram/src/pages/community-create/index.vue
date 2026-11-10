<template>
  <view class="page">
    <view class="status-bar-placeholder" :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="nav-bar">
      <view class="nav-back" @tap="goBack"><text>←</text></view>
      <text class="nav-title serif">创建社群</text>
      <view class="nav-right"></view>
    </view>

    <view class="form">
      <view class="form-item">
        <text class="form-label">社群名称</text>
        <input class="form-input" v-model="form.name" placeholder="例如：晨间冥想共修会" maxlength="20" />
      </view>

      <view class="form-item">
        <text class="form-label">一句话定位</text>
        <input class="form-input" v-model="form.slogan" placeholder="用一句话说清这个社群是干嘛的" maxlength="40" />
      </view>

      <view class="form-item">
        <text class="form-label">分类</text>
        <view class="cat-options">
          <view
            v-for="cat in categories"
            :key="cat"
            class="cat-option"
            :class="{ active: form.category === cat }"
            @tap="form.category = cat"
          >
            <text>{{ cat }}</text>
          </view>
        </view>
      </view>

      <view class="form-item">
        <text class="form-label">标签（SDG + 复愈特色）</text>
        <view class="cat-options">
          <view
            v-for="tag in TAG_OPTIONS"
            :key="tag"
            class="cat-option"
            :class="{ active: form.tags.includes(tag) }"
            @tap="onTag(tag)"
          >
            <text>{{ tag }}</text>
          </view>
        </view>
      </view>

      <view class="form-item">
        <text class="form-label">收费方式</text>
        <view class="fee-options">
          <view class="fee-option" :class="{ active: form.feeMode === 'free' }" @tap="form.feeMode = 'free'">
            <text class="fee-option-title">免费</text>
            <text class="fee-option-desc">靠课程与活动变现</text>
          </view>
          <view class="fee-option" :class="{ active: form.feeMode === 'paid' }" @tap="form.feeMode = 'paid'">
            <text class="fee-option-title">订阅制</text>
            <text class="fee-option-desc">按年收费，持续经营</text>
          </view>
        </view>
        <view v-if="form.feeMode === 'paid'" class="fee-input-row">
          <text class="fee-input-label">年费（元）</text>
          <input class="fee-input" type="digit" v-model="form.feeYuan" placeholder="999" />
        </view>
      </view>

      <view class="form-item">
        <text class="form-label">社群介绍</text>
        <textarea
          class="form-textarea"
          v-model="form.description"
          placeholder="成员能得到什么：内容形式、更新频率、专属权益…"
          maxlength="300"
        />
        <text class="form-count">{{ form.description.length }}/300</text>
      </view>

      <view class="tip-card">
        <text class="tip-title">创建后你可以：</text>
        <text class="tip-line">· 发布活动日历（线上/线下），成员一键报名</text>
        <text class="tip-line">· 发布社群动态，与成员互动</text>
        <text class="tip-line">· 生成个人品牌邀请卡，把小红书/朋友圈流量落到自己社群</text>
      </view>

      <view class="audit-card">
        <text class="tip-title">提交说明</text>
        <text class="tip-line">· 创建提交后由平台审核，通过后上架广场</text>
        <text class="tip-line">· 社群内动态需审核通过后展示</text>
      </view>

      <view class="submit-btn" :class="{ disabled: !canSubmit || submitting }" @tap="onSubmit">
        <text>{{ submitting ? '提交中…' : '创建社群' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { COMMUNITY_CATEGORIES, submitCommunity } from '@/api/skool'

const statusBarHeight = ref(44)
try {
  statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 44
} catch (e) { /* fallback */ }

const categories = COMMUNITY_CATEGORIES.filter((c) => c !== '全部')

/** 标签池：SDG 可持续发展目标 + 复愈特色（会议定的标签体系） */
const TAG_OPTIONS = [
  'SDG 3 良好健康',
  'SDG 4 优质教育',
  'SDG 12 责任消费',
  '身心疗愈',
  '身体疗愈',
  '复愈特色',
  '职业成长',
  '轻户外',
]

const form = ref({
  name: '',
  slogan: '',
  category: '疗愈',
  tags: [] as string[],
  feeMode: 'free' as 'free' | 'paid',
  feeYuan: '',
  description: '',
})

function onTag(tag: string) {
  const i = form.value.tags.indexOf(tag)
  if (i >= 0) form.value.tags.splice(i, 1)
  else if (form.value.tags.length < 3) form.value.tags.push(tag)
  else uni.showToast({ title: '最多选 3 个标签', icon: 'none' })
}

const canSubmit = computed(() => form.value.name.trim() && form.value.slogan.trim())
const submitting = ref(false)

function goBack() {
  uni.navigateBack()
}

async function onSubmit() {
  if (!canSubmit.value) {
    uni.showToast({ title: '请先填写名称与定位', icon: 'none' })
    return
  }
  if (submitting.value) return
  const feeYuan = Number(form.value.feeYuan)
  const yearlyFee = form.value.feeMode === 'paid' ? Math.round((isNaN(feeYuan) ? 0 : feeYuan) * 100) : 0
  if (form.value.feeMode === 'paid' && yearlyFee <= 0) {
    uni.showToast({ title: '请填写年费金额', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    await submitCommunity({
      name: form.value.name.trim(),
      slogan: form.value.slogan.trim(),
      category: form.value.category,
      tags: form.value.tags,
      yearlyFee,
      description: form.value.description.trim() || undefined,
    })
    uni.showModal({
      title: '提交成功',
      content: `「${form.value.name}」已提交，审核通过后即可在社群广场展示。`,
      showCancel: false,
      success: () => uni.navigateBack(),
    })
  } catch (e) {
    // 错误已由 request 层统一提示
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: #EAE0D7; }
.status-bar-placeholder { width: 100%; }
.nav-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; }
.nav-back { width: 32px; height: 32px; border-radius: 16px; background: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center; }
.nav-back text { font-size: 18px; color: #584219; }
.nav-title { font-size: 17px; font-weight: 600; color: #3F2F10; }
.nav-right { width: 32px; }

.form { padding: 8px 16px 40px; }
.form-item { background: #fff; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
.form-label { display: block; font-size: 13px; font-weight: 600; color: #3F2F10; margin-bottom: 10px; }
.form-input { background: #EAE0D7; border-radius: 10px; padding: 10px 12px; font-size: 14px; color: #3F2F10; }
.form-textarea { width: 100%; box-sizing: border-box; background: #EAE0D7; border-radius: 10px; padding: 10px 12px; font-size: 14px; color: #3F2F10; height: 110px; }
.form-count { display: block; text-align: right; margin-top: 6px; font-size: 11px; color: #A78E70; }

.cat-options { display: flex; flex-wrap: wrap; gap: 8px; }
.cat-option { padding: 7px 16px; border-radius: 16px; background: #EAE0D7; }
.cat-option text { font-size: 13px; color: #6D5934; }
.cat-option.active { background: #584219; }
.cat-option.active text { color: #fff; }

.fee-options { display: flex; gap: 10px; }
.fee-option { flex: 1; border: 1px solid #F4EEE6; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; }
.fee-option.active { border-color: #584219; background: #FBF8F3; }
.fee-option-title { font-size: 14px; font-weight: 600; color: #3F2F10; }
.fee-option-desc { margin-top: 4px; font-size: 11px; color: #A78E70; }
.fee-input-row { margin-top: 10px; display: flex; align-items: center; }
.fee-input-label { font-size: 13px; color: #6D5934; margin-right: 10px; }
.fee-input { flex: 1; background: #EAE0D7; border-radius: 10px; padding: 10px 12px; font-size: 14px; color: #3F2F10; }

.tip-card { background: #F4EEE6; border-radius: 12px; padding: 14px; margin-bottom: 16px; display: flex; flex-direction: column; }
.audit-card { background: #fff; border: 1px solid #F4EEE6; border-radius: 12px; padding: 14px; margin-bottom: 16px; display: flex; flex-direction: column; }
.tip-title { font-size: 13px; font-weight: 600; color: #8C7335; margin-bottom: 6px; }
.audit-card .tip-title { color: #3F2F10; }
.tip-line { font-size: 12px; color: #8C7335; line-height: 1.8; }
.audit-card .tip-line { color: #6D5934; }

.submit-btn { background: #584219; border-radius: 24px; padding: 14px; text-align: center; }
.submit-btn.disabled { opacity: 0.5; }
.submit-btn text { color: #fff; font-size: 16px; font-weight: 600; }
</style>
