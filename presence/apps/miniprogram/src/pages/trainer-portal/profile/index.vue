<template>
  <view class="page">
    <PortalNav :title="tr('对外资料', 'Public profile')" :sub="tr('学员在课程页看到的内容', 'What students see on class pages')" fallback="/pages/trainer-portal/home/index" />

    <view v-if="loading" class="container">
      <PageState state="loading" :title="tr('正在载入资料', 'Loading profile')" />
    </view>

    <view v-else-if="me" class="container body">
      <view v-if="me.mustChangePassword" class="alert">
        <PresenceIcon name="lock" :size="30" />
        <text class="alert-text">{{ tr('你还在使用初始密码，请在本页下方修改。', 'You are still using the initial password. Change it below.') }}</text>
      </view>

      <view class="card">
        <view class="avatar-row">
          <view class="avatar-wrap" @tap="chooseAvatar">
            <image v-if="me.avatar" :src="me.avatar" mode="aspectFill" class="avatar" />
            <view v-else class="avatar avatar-empty serif">{{ me.displayName.slice(0, 1) }}</view>
            <text class="avatar-edit">{{ tr('更换', 'Change') }}</text>
          </view>
          <view class="identity">
            <text class="name serif">{{ me.displayName }}</text>
            <text class="meta">{{ tr(`L${me.level} 导师`, `Level ${me.level}`) }} · {{ masked }}</text>
            <text class="meta-note">{{ tr('姓名、手机号与等级由教务维护', 'Name, phone and level are managed by the team') }}</text>
          </view>
        </view>

        <view class="field">
          <text class="field-label">{{ tr('一句话介绍', 'One-line intro') }}</text>
          <input v-model="form.headline" class="field-input" maxlength="40" :placeholder="tr('例如：10 年阴瑜伽与呼吸练习', 'e.g. 10 years of yin yoga and breathwork')" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field-label">{{ tr('所在城市', 'City') }}</text>
          <input v-model="form.city" class="field-input" maxlength="20" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field-label">{{ tr('个人介绍', 'Bio') }}</text>
          <textarea v-model="form.bio" class="field-textarea" maxlength="600" :placeholder="tr('教学风格、师承与擅长方向', 'Teaching style, training and focus')" placeholder-class="ph" />
          <text class="counter latin">{{ form.bio.length }} / 600</text>
        </view>
      </view>

      <view class="card">
        <text class="block-title serif">{{ tr('擅长方向', 'Specialties') }}</text>
        <view class="chip-wrap">
          <view v-for="(s, i) in form.specialties" :key="s + i" class="chip chip-on" @tap="form.specialties.splice(i, 1)">
            {{ s }}<text class="chip-x">×</text>
          </view>
        </view>
        <view class="inline-input">
          <input v-model="specialtyInput" class="field-input grow" maxlength="12" :placeholder="tr('如：阴瑜伽、呼吸训练', 'e.g. yin yoga, breathwork')" placeholder-class="ph" @confirm="addSpecialty" />
          <button class="add-btn" @tap="addSpecialty">{{ tr('添加', 'Add') }}</button>
        </view>
      </view>

      <view class="card">
        <text class="block-title serif">{{ tr('作品集', 'Portfolio') }}</text>
        <text class="block-hint">{{ tr('最多 6 张，可在每张图下写一句说明。', 'Up to 6 images, each with a caption.') }}</text>
        <view v-for="(p, i) in form.portfolio" :key="i" class="portfolio-row">
          <image :src="p.image" mode="aspectFill" class="portfolio-img" />
          <view class="portfolio-copy">
            <input v-model="p.title" class="field-input small" maxlength="30" :placeholder="tr('标题', 'Title')" placeholder-class="ph" />
            <input v-model="p.desc" class="field-input small" maxlength="60" :placeholder="tr('一句说明（可选）', 'Caption (optional)')" placeholder-class="ph" />
          </view>
          <button class="row-del" @tap="form.portfolio.splice(i, 1)">×</button>
        </view>
        <button v-if="form.portfolio.length < 6" class="btn-secondary add-work" @tap="addPortfolio">{{ tr('上传作品', 'Upload work') }}</button>
      </view>

      <button class="btn-primary save" :class="{ 'btn-disabled': saving }" :disabled="saving" @tap="save">
        {{ saving ? tr('保存中…', 'Saving…') : tr('保存资料', 'Save profile') }}
      </button>

      <view class="card pwd-card">
        <text class="block-title serif">{{ tr('登录密码', 'Password') }}</text>
        <text class="block-hint">{{ policyHint }}</text>
        <view class="field">
          <text class="field-label">{{ tr('原密码', 'Current password') }}</text>
          <input v-model="pwd.old" class="field-input" :password="true" maxlength="32" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field-label">{{ tr('新密码', 'New password') }}</text>
          <input v-model="pwd.next" class="field-input" :password="true" maxlength="32" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field-label">{{ tr('确认新密码', 'Confirm new password') }}</text>
          <input v-model="pwd.confirm" class="field-input" :password="true" maxlength="32" placeholder-class="ph" @confirm="savePassword" />
        </view>
        <text v-if="pwdError" class="pwd-error">{{ pwdError }}</text>
        <button class="btn-secondary pwd-btn" :disabled="pwdSaving" @tap="savePassword">
          {{ pwdSaving ? tr('提交中…', 'Submitting…') : tr('修改密码', 'Change password') }}
        </button>
      </view>

      <view class="foot">
        <text class="foot-link" @tap="logout">{{ tr('退出导师门户', 'Sign out of the portal') }}</text>
      </view>
      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { tr } from '@/locale'
import { changePassword, getOptions, updateMe } from '@/api/trainer-portal'
import { useTrainerPortalStore } from '@/stores/trainer-portal'
import { ensureTrainerAuth, pickAndUploadImage } from '@/utils/trainer-request'
import PortalNav from '@/components/PortalNav.vue'
import PageState from '@/components/PageState.vue'
import PresenceIcon from '@/components/PresenceIcon.vue'

const store = useTrainerPortalStore()
const me = computed(() => store.me)
const loading = ref(true)
const saving = ref(false)
const specialtyInput = ref('')
const policyHint = ref(tr('密码规则由教务统一配置', 'Password rules are configured by the team'))

const form = reactive({
  headline: '',
  city: '',
  bio: '',
  specialties: [] as string[],
  portfolio: [] as Array<{ title: string; image: string; desc?: string }>,
})

const pwd = reactive({ old: '', next: '', confirm: '' })
const pwdSaving = ref(false)
const pwdError = ref('')

const masked = computed(() => {
  const phone = me.value?.phone || ''
  return phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : ''
})

onShow(async () => {
  if (!ensureTrainerAuth()) return
  loading.value = true
  try {
    const data = await store.loadMe(true)
    if (data) {
      form.headline = data.headline || ''
      form.city = data.city || ''
      form.bio = data.bio || ''
      form.specialties = [...(data.specialties || [])]
      form.portfolio = (data.portfolio || []).map((p) => ({ ...p }))
    }
    // 密码规则提示来自后端配置，前端不硬编码
    getOptions()
      .then((opt) => {
        if (opt?.policy?.hint) policyHint.value = opt.policy.hint
      })
      .catch(() => {})
  } catch {
    // 请求层已提示，保留旧缓存内容
  } finally {
    loading.value = false
  }
})

function addSpecialty() {
  const v = specialtyInput.value.trim()
  if (!v || form.specialties.includes(v)) return
  if (form.specialties.length >= 12) {
    uni.showToast({ title: tr('最多 12 个方向', 'Up to 12'), icon: 'none' })
    return
  }
  form.specialties.push(v)
  specialtyInput.value = ''
}

async function chooseAvatar() {
  const uploaded = await pickAndUploadImage('avatar')
  if (!uploaded) return
  try {
    await updateMe({ avatar: uploaded.url })
    store.patchMe({ avatar: uploaded.url })
    uni.showToast({ title: tr('头像已更新', 'Avatar updated'), icon: 'none' })
  } catch {
    // 请求层已提示
  }
}

async function addPortfolio() {
  const uploaded = await pickAndUploadImage('portfolio')
  if (!uploaded) return
  form.portfolio.push({ title: '', image: uploaded.url, desc: '' })
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    await updateMe({
      headline: form.headline,
      city: form.city,
      bio: form.bio,
      specialties: form.specialties,
      portfolio: form.portfolio.filter((p) => p.image),
    })
    store.patchMe({
      headline: form.headline,
      city: form.city,
      bio: form.bio,
      specialties: [...form.specialties],
      portfolio: form.portfolio.map((p) => ({ ...p })),
    } as any)
    uni.showToast({ title: tr('已保存', 'Saved'), icon: 'none' })
  } catch {
    // 请求层已提示
  } finally {
    saving.value = false
  }
}

async function savePassword() {
  if (pwdSaving.value) return
  pwdError.value = ''
  if (!pwd.old || !pwd.next) {
    pwdError.value = tr('请填写原密码与新密码', 'Fill in both passwords')
    return
  }
  if (pwd.next !== pwd.confirm) {
    pwdError.value = tr('两次输入的新密码不一致', 'The new passwords do not match')
    return
  }
  if (pwd.next.length < 6) {
    pwdError.value = tr('新密码至少 6 位', 'Use at least 6 characters')
    return
  }
  pwdSaving.value = true
  try {
    await changePassword(pwd.old, pwd.next)
    pwd.old = ''
    pwd.next = ''
    pwd.confirm = ''
    store.patchMe({ mustChangePassword: false })
    uni.showToast({ title: tr('密码已更新', 'Password updated'), icon: 'none' })
  } catch (e: any) {
    pwdError.value = e?.message || tr('修改失败，请重试', 'Failed, please retry')
  } finally {
    pwdSaving.value = false
  }
}

function logout() {
  uni.showModal({
    title: tr('退出导师门户', 'Sign out'),
    content: tr('学员端的微信登录不受影响。', 'Your student login is not affected.'),
    success: (res) => {
      if (res.confirm) store.logout()
    },
  })
}
</script>

<style scoped>
.body {
  padding-top: 24rpx;
}
.alert {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 22rpx 24rpx;
  border-radius: 22rpx;
  background: #fbf1df;
  color: #8a5a17;
  margin-bottom: 20rpx;
}
.alert-text {
  flex: 1;
  font-size: 23rpx;
  line-height: 1.6;
}
.avatar-row {
  display: flex;
  gap: 24rpx;
  align-items: center;
  margin-bottom: 8rpx;
}
.avatar-wrap {
  position: relative;
  width: 140rpx;
  height: 140rpx;
  flex-shrink: 0;
}
.avatar {
  width: 140rpx;
  height: 140rpx;
  border-radius: 32rpx;
  background: var(--c-card-2);
}
.avatar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  color: var(--c-primary);
}
.avatar-edit {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  text-align: center;
  font-size: 19rpx;
  color: var(--c-rice);
  background: rgba(61, 74, 42, 0.72);
  padding: 4rpx 0;
  border-bottom-left-radius: 32rpx;
  border-bottom-right-radius: 32rpx;
}
.identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.name {
  font-size: 36rpx;
  color: var(--c-ink);
}
.meta {
  font-size: 22rpx;
  color: var(--c-brown);
}
.meta-note {
  font-size: 20rpx;
  color: var(--c-muted);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 26rpx;
}
.field-label {
  font-size: 23rpx;
  color: var(--c-muted);
}
.field-input {
  height: 88rpx;
  border-radius: 18rpx;
  background: var(--c-cream);
  padding: 0 24rpx;
  font-size: 28rpx;
  color: var(--c-ink);
}
.field-input.small {
  height: 64rpx;
  font-size: 24rpx;
  border-radius: 14rpx;
}
.field-textarea {
  width: 100%;
  min-height: 220rpx;
  background: var(--c-cream);
  border-radius: 18rpx;
  padding: 24rpx;
  font-size: 27rpx;
  line-height: 1.7;
  color: var(--c-ink);
}
.ph {
  color: #b4ab97;
}
.counter {
  text-align: right;
  font-size: 20rpx;
  color: var(--c-muted);
}
.block-title {
  display: block;
  font-size: 28rpx;
  color: var(--c-ink);
  margin-bottom: 10rpx;
}
.block-hint {
  display: block;
  font-size: 21rpx;
  color: var(--c-muted);
  line-height: 1.6;
  margin-bottom: 16rpx;
}
.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.chip {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 10rpx 22rpx;
  border-radius: 22rpx;
  font-size: 24rpx;
}
.chip-on {
  background: var(--c-primary);
  color: var(--c-rice);
}
.chip-x {
  opacity: 0.7;
  font-size: 24rpx;
}
.inline-input {
  display: flex;
  gap: 12rpx;
  margin-top: 14rpx;
}
.grow {
  flex: 1;
}
.add-btn {
  padding: 0 28rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 18rpx;
  background: var(--c-primary);
  color: var(--c-rice);
  font-size: 24rpx;
}
.portfolio-row {
  display: flex;
  gap: 16rpx;
  align-items: center;
  padding: 12rpx 0;
  border-bottom: 1rpx solid var(--line-soft);
}
.portfolio-img {
  width: 120rpx;
  height: 120rpx;
  border-radius: 16rpx;
  flex-shrink: 0;
  background: var(--c-cream);
}
.portfolio-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.row-del {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--c-cream);
  color: var(--c-muted);
  font-size: 26rpx;
  padding: 0;
  line-height: 52rpx;
}
.add-work {
  margin-top: 18rpx;
}
.save {
  margin-top: 8rpx;
}
.pwd-card {
  margin-top: 24rpx;
}
.pwd-error {
  font-size: 22rpx;
  color: #b3261e;
  margin-top: 12rpx;
}
.pwd-btn {
  margin-top: 20rpx;
}
.foot {
  margin: 36rpx 0 12rpx;
  text-align: center;
}
.foot-link {
  font-size: 24rpx;
  color: var(--c-muted);
  text-decoration: underline;
}
</style>