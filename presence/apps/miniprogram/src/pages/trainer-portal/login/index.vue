<template>
  <view class="page login-page">
    <view :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="brand">
      <view class="brand-mark serif"><text>Full愈</text></view>
      <text class="brand-title serif">{{ tr('导师门户', 'Trainer Portal') }}</text>
      <text class="brand-sub">{{ tr('课程安排、学员名单与提案进度，都在这里。', 'Your schedule, student roster and proposals in one place.') }}</text>
    </view>

    <view class="login-card">
      <view class="field">
        <text class="field-label">{{ tr('手机号', 'Phone number') }}</text>
        <input
          v-model="phone"
          class="field-input latin"
          type="number"
          maxlength="11"
          :placeholder="tr('教务登记的手机号', 'Phone registered with us')"
          placeholder-class="ph"
        />
      </view>
      <view class="field">
        <text class="field-label">{{ tr('登录密码', 'Password') }}</text>
        <view class="field-input-wrap">
          <input
            v-model="password"
            class="field-input latin grow"
            :password="!showPassword"
            maxlength="32"
            :placeholder="tr('初始密码由教务发送', 'Initial password sent by the team')"
            placeholder-class="ph"
            @confirm="submit"
          />
          <button class="eye" :aria-label="tr('显示密码', 'Show password')" @tap="showPassword = !showPassword">
            {{ showPassword ? tr('隐藏', 'Hide') : tr('显示', 'Show') }}
          </button>
        </view>
      </view>

      <text v-if="error" class="error">{{ error }}</text>
      <button class="btn-primary submit" :class="{ 'btn-disabled': !canSubmit || submitting }" :disabled="!canSubmit || submitting" @tap="submit">
        {{ submitting ? tr('登录中…', 'Signing in…') : tr('登录', 'Sign in') }}
      </button>
      <text class="tip">{{ tr('首次登录后请立刻修改初始密码。', 'Change the initial password right after your first sign-in.') }}</text>
    </view>

    <view class="apply-row">
      <text class="apply-text">{{ tr('还没有导师账号？', 'No trainer account yet?') }}</text>
      <text class="apply-link" @tap="goApply">{{ tr('申请入驻', 'Apply to join') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { tr } from '@/locale'
import { portalLogin } from '@/api/trainer-portal'
import { useTrainerPortalStore } from '@/stores/trainer-portal'
import { getTrainerToken } from '@/utils/trainer-request'
import { readCapsuleLayout } from '@/utils/capsule'

const statusBarHeight = readCapsuleLayout().statusBarHeight
const store = useTrainerPortalStore()

const phone = ref('')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const error = ref('')

const canSubmit = computed(() => /^1\d{10}$/.test(phone.value) && password.value.length >= 6)

onShow(() => {
  // 已登录直接回门户，避免从别的入口误入登录页
  if (getTrainerToken()) uni.reLaunch({ url: '/pages/trainer-portal/home/index' })
  const last = uni.getStorageSync('trainer_last_phone')
  if (last && !phone.value) phone.value = last
})

async function submit() {
  if (!canSubmit.value || submitting.value) return
  error.value = ''
  submitting.value = true
  try {
    const res = await portalLogin(phone.value, password.value)
    uni.setStorageSync('trainer_last_phone', phone.value)
    store.setSession(res.token)
    uni.reLaunch({ url: '/pages/trainer-portal/home/index' })
  } catch (e: any) {
    error.value = e?.message || tr('登录失败，请重试', 'Sign-in failed, please retry')
  } finally {
    submitting.value = false
  }
}

function goApply() {
  uni.navigateTo({ url: '/pages/trainer-portal/apply/index' })
}
</script>

<style scoped>
.login-page {
  padding: 0 40rpx calc(60rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}
.brand {
  padding: 80rpx 0 48rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.brand-mark {
  width: 132rpx;
  height: 132rpx;
  border-radius: 36rpx;
  background: var(--c-primary);
  color: var(--c-rice);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34rpx;
  letter-spacing: 1rpx;
  box-shadow: var(--shadow-card);
}
.brand-title {
  margin-top: 20rpx;
  font-size: 52rpx;
  color: var(--c-ink);
}
.brand-sub {
  font-size: 26rpx;
  color: var(--c-muted);
  line-height: 1.6;
}
.login-card {
  background: var(--c-card);
  border-radius: var(--radius-card);
  padding: 40rpx 36rpx;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.field-label {
  font-size: 24rpx;
  color: var(--c-muted);
  letter-spacing: 1rpx;
}
.field-input {
  height: 96rpx;
  border-radius: 20rpx;
  background: var(--c-cream);
  padding: 0 28rpx;
  font-size: 30rpx;
  color: var(--c-ink);
}
.field-input-wrap {
  display: flex;
  align-items: center;
  background: var(--c-cream);
  border-radius: 20rpx;
  padding-right: 12rpx;
}
.field-input-wrap .field-input {
  background: transparent;
}
.grow {
  flex: 1;
}
.eye {
  padding: 12rpx 20rpx;
  background: transparent;
  font-size: 24rpx;
  color: var(--c-brown);
  line-height: 1;
}
.ph {
  color: #b4ab97;
}
.error {
  font-size: 24rpx;
  color: #b3261e;
  background: #fbeceb;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
  line-height: 1.5;
}
.submit {
  width: 100%;
}
.tip {
  font-size: 22rpx;
  color: var(--c-muted);
  text-align: center;
}
.apply-row {
  margin-top: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}
.apply-text {
  font-size: 26rpx;
  color: var(--c-muted);
}
.apply-link {
  font-size: 26rpx;
  color: var(--c-primary);
  font-weight: 600;
}
</style>