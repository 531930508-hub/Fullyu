<template>
  <view class="page">
    <PortalNav :title="tr('申请成为导师', 'Apply to teach')" :sub="tr('资料越完整，审核越快', 'The fuller your profile, the faster the review')" fallback="/pages/trainer-portal/login/index" />
    <view class="container form-body">
      <view class="card">
        <text class="block-title serif">{{ tr('基本信息', 'Basics') }}</text>
        <view class="field">
          <text class="field-label">{{ tr('真实姓名', 'Full name') }}</text>
          <input v-model="form.realName" class="field-input" maxlength="20" :placeholder="tr('与证件一致', 'As on your ID')" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field-label">{{ tr('手机号', 'Phone') }}</text>
          <input v-model="form.phone" class="field-input latin" type="number" maxlength="11" :placeholder="tr('用于登录门户', 'Used to sign in')" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field-label">{{ tr('所在城市', 'City') }}</text>
          <input v-model="form.city" class="field-input" maxlength="20" :placeholder="tr('例如：上海', 'e.g. Shanghai')" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field-label">{{ tr('从业年限', 'Years of experience') }}</text>
          <input v-model="yearsInput" class="field-input latin" type="number" maxlength="2" :placeholder="tr('填写数字', 'Numbers only')" placeholder-class="ph" />
        </view>
        <view class="field">
          <text class="field-label">{{ tr('一句话介绍', 'One-line intro') }}</text>
          <input v-model="form.headline" class="field-input" maxlength="40" :placeholder="tr('例如：10 年阴瑜伽与呼吸练习', 'e.g. 10 years of yin yoga and breathwork')" placeholder-class="ph" />
        </view>
      </view>

      <view class="card">
        <text class="block-title serif">{{ tr('擅长方向', 'Specialties') }}</text>
        <view class="chip-wrap">
          <view v-for="(s, i) in form.specialties" :key="s + i" class="chip chip-olive" @tap="removeFrom(form.specialties, i)">
            <text>{{ s }}</text><text class="chip-x">×</text>
          </view>
        </view>
        <view class="field-input-wrap">
          <input v-model="specialtyInput" class="field-input grow no-bg" maxlength="12" :placeholder="tr('输入后点添加', 'Type, then add')" placeholder-class="ph" @confirm="addSpecialty" />
          <button class="mini-btn" @tap="addSpecialty">{{ tr('添加', 'Add') }}</button>
        </view>
      </view>

      <view class="card">
        <text class="block-title serif">{{ tr('个人介绍', 'About you') }}</text>
        <textarea v-model="form.intro" class="field-textarea" maxlength="600" :placeholder="tr('教学经历、师承、擅长的课程类型…', 'Teaching history, training, class types…')" placeholder-class="ph" />
        <text class="counter latin">{{ form.intro.length }} / 600</text>
        <view class="field">
          <text class="field-label">{{ tr('资质证书', 'Certificates') }}</text>
          <view class="chip-wrap">
            <view v-for="(c, i) in form.certificates" :key="c + i" class="chip chip-apricot" @tap="removeFrom(form.certificates, i)">
              <text>{{ c }}</text><text class="chip-x">×</text>
            </view>
          </view>
          <view class="field-input-wrap">
            <input v-model="certInput" class="field-input grow no-bg" maxlength="30" :placeholder="tr('证书名称', 'Certificate name')" placeholder-class="ph" @confirm="addCert" />
            <button class="mini-btn" @tap="addCert">{{ tr('添加', 'Add') }}</button>
          </view>
        </view>
      </view>

      <view class="card">
        <text class="block-title serif">{{ tr('作品 / 证明', 'Work samples') }}</text>
        <text class="block-hint">{{ tr('可选，最多 3 张，照片或证书截图。', 'Optional, up to 3 images.') }}</text>
        <view class="portfolio-grid">
          <view v-for="(p, i) in form.portfolio" :key="i" class="portfolio-item">
            <image :src="p.image" mode="aspectFill" class="portfolio-img" />
            <button class="portfolio-del" @tap="form.portfolio.splice(i, 1)">×</button>
          </view>
          <button v-if="form.portfolio.length < 3" class="portfolio-add" @tap="addPortfolio">
            <text class="plus">＋</text>
            <text class="add-label">{{ tr('上传', 'Upload') }}</text>
          </button>
        </view>
      </view>

      <view class="card">
        <text class="block-title serif">{{ tr('可授课时间', 'Availability') }}</text>
        <view class="chip-wrap">
          <view v-for="d in days" :key="d" class="chip" :class="form.availableDays.includes(d) ? 'chip-olive' : 'chip-idle'" @tap="toggleDay(d)">
            {{ d }}
          </view>
        </view>
        <view class="field">
          <text class="field-label">{{ tr('为什么想加入 Full愈', 'Why Full愈') }}</text>
          <textarea v-model="form.motivation" class="field-textarea small" maxlength="300" :placeholder="tr('想和什么样的学员一起练习？', 'Who do you want to practise with?')" placeholder-class="ph" />
        </view>
      </view>

      <view v-if="error" class="error-box">{{ error }}</view>
      <button class="btn-primary" :class="{ 'btn-disabled': submitting }" :disabled="submitting" @tap="submit">
        {{ submitting ? tr('提交中…', 'Submitting…') : tr('提交申请', 'Submit application') }}
      </button>
      <text class="footnote">{{ tr('提交后由教务联系你，通常 3 个工作日内答复。', 'Our team will contact you, usually within 3 working days.') }}</text>
      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { tr } from '@/locale'
import { portalApply } from '@/api/trainer-portal'
import { pickAndUploadImage } from '@/utils/trainer-request'
import PortalNav from '@/components/PortalNav.vue'

interface PortfolioItem {
  title: string
  image: string
  desc?: string
}

const form = reactive({
  realName: '',
  phone: '',
  city: '',
  headline: '',
  specialties: [] as string[],
  intro: '',
  experienceYears: 0,
  certificates: [] as string[],
  portfolio: [] as PortfolioItem[],
  availableDays: [] as string[],
  motivation: '',
})

const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const specialtyInput = ref('')
const certInput = ref('')
const yearsInput = ref('')
const submitting = ref(false)
const error = ref('')

function addSpecialty() {
  const v = specialtyInput.value.trim()
  if (!v || form.specialties.includes(v)) return
  form.specialties.push(v)
  specialtyInput.value = ''
}

function addCert() {
  const v = certInput.value.trim()
  if (!v || form.certificates.includes(v)) return
  form.certificates.push(v)
  certInput.value = ''
}

function removeFrom(list: string[], index: number) {
  list.splice(index, 1)
}

function toggleDay(day: string) {
  const i = form.availableDays.indexOf(day)
  if (i >= 0) form.availableDays.splice(i, 1)
  else form.availableDays.push(day)
}

async function addPortfolio() {
  const uploaded = await pickAndUploadImage('portfolio')
  if (!uploaded) return
  form.portfolio.push({ title: `作品 ${form.portfolio.length + 1}`, image: uploaded.url })
}

async function submit() {
  if (submitting.value) return
  error.value = ''
  // 只做「提交前一眼能看出」的校验；格式规则以后端为准，错误直接展示
  if (form.realName.trim().length < 2) {
    error.value = tr('请填写真实姓名', 'Please fill in your name')
    return
  }
  if (!/^1\d{10}$/.test(form.phone.trim())) {
    error.value = tr('请填写正确的手机号', 'Please enter a valid phone number')
    return
  }
  submitting.value = true
  try {
    const years = Number(yearsInput.value)
    await portalApply({
      ...form,
      realName: form.realName.trim(),
      phone: form.phone.trim(),
      experienceYears: Number.isFinite(years) && years >= 0 ? years : 0,
    })
    uni.showToast({ title: tr('已提交，请等待教务联系', 'Submitted'), icon: 'none' })
    setTimeout(() => uni.reLaunch({ url: '/pages/trainer-portal/login/index' }), 1200)
  } catch (e: any) {
    error.value = e?.message || tr('提交失败，请重试', 'Submit failed, please retry')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.form-body {
  padding-top: 24rpx;
}
.block-title {
  display: block;
  font-size: 32rpx;
  color: var(--c-ink);
  margin-bottom: 8rpx;
}
.block-hint {
  display: block;
  font-size: 23rpx;
  color: var(--c-muted);
  margin-bottom: 20rpx;
  line-height: 1.5;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 24rpx;
}
.field-label {
  font-size: 24rpx;
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
.field-input-wrap {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 16rpx;
}
.grow {
  flex: 1;
}
.no-bg {
  background: var(--c-cream);
}
.field-textarea {
  width: 100%;
  min-height: 220rpx;
  background: var(--c-cream);
  border-radius: 18rpx;
  padding: 24rpx;
  font-size: 28rpx;
  line-height: 1.7;
  color: var(--c-ink);
  margin-top: 12rpx;
}
.field-textarea.small {
  min-height: 150rpx;
}
.counter {
  display: block;
  text-align: right;
  font-size: 22rpx;
  color: var(--c-muted);
  margin-top: 8rpx;
}
.ph {
  color: #b4ab97;
}
.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 12rpx;
}
.chip {
  padding: 10rpx 22rpx;
  font-size: 24rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.chip-olive {
  background: var(--c-card-2);
  color: var(--c-primary);
}
.chip-apricot {
  background: #fbf1df;
  color: #8a5a17;
}
.chip-idle {
  background: var(--c-cream);
  color: var(--c-muted);
}
.chip-x {
  font-size: 26rpx;
  opacity: 0.6;
}
.mini-btn {
  height: 72rpx;
  padding: 0 28rpx;
  border-radius: 18rpx;
  background: var(--c-primary);
  color: var(--c-rice);
  font-size: 24rpx;
  line-height: 72rpx;
}
.portfolio-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}
.portfolio-item {
  position: relative;
  width: 180rpx;
  height: 180rpx;
  border-radius: 20rpx;
  overflow: hidden;
}
.portfolio-img {
  width: 100%;
  height: 100%;
}
.portfolio-del {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 26rpx;
  line-height: 40rpx;
  padding: 0;
  text-align: center;
}
.portfolio-add {
  width: 180rpx;
  height: 180rpx;
  border-radius: 20rpx;
  border: 2rpx dashed #cfc6ad;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: var(--c-muted);
}
.plus {
  font-size: 40rpx;
  line-height: 1;
}
.add-label {
  font-size: 22rpx;
}
.error-box {
  font-size: 24rpx;
  color: #b3261e;
  background: #fbeceb;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
  margin: 12rpx 0;
}
.footnote {
  display: block;
  margin-top: 20rpx;
  font-size: 22rpx;
  color: var(--c-muted);
  text-align: center;
  line-height: 1.6;
}
</style>