<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <img class="brand-logo" src="/logo.png" alt="Full愈" />
        <p class="subtitle">品牌运营管理系统</p>
      </div>
      <a-form :model="form" @finish="handleLogin" layout="vertical">
        <a-form-item name="username" :rules="[{ required: true, message: '请输入用户名' }]">
          <a-input v-model:value="form.username" size="large" placeholder="用户名">
            <template #prefix><UserOutlined /></template>
          </a-input>
        </a-form-item>
        <a-form-item name="password" :rules="[{ required: true, message: '请输入密码' }]">
          <a-input-password v-model:value="form.password" size="large" placeholder="密码">
            <template #prefix><LockOutlined /></template>
          </a-input-password>
        </a-form-item>
        <a-form-item>
          <a-button type="primary" html-type="submit" size="large" block :loading="loading">
            登录
          </a-button>
        </a-form-item>
      </a-form>
    </div>

    <!-- 首次登录强制改密弹窗 -->
    <a-modal v-model:open="showChangePwd" title="首次登录，请修改密码" :closable="false" :maskClosable="false" :footer="null">
      <p style="color: #999; margin-bottom: 16px;">为保障账户安全，首次登录必须修改密码</p>
      <!-- 必须绑 :model，a-form-item 的 name 才能从 model 里取到值，否则校验器永远当空 -->
      <a-form :model="changePwdForm" layout="vertical" @finish="handleFirstChangePwd">
        <a-form-item label="新密码" name="newPwd" :rules="newPwdRules">
          <a-input-password v-model:value="changePwdForm.newPwd" :placeholder="pwdHint" />
        </a-form-item>
        <a-form-item label="确认新密码" name="confirmPwd" :rules="confirmPwdRules">
          <a-input-password v-model:value="changePwdForm.confirmPwd" placeholder="再次输入新密码" />
        </a-form-item>
        <a-form-item>
          <a-button type="primary" html-type="submit" block :loading="changingPwd">确认修改</a-button>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import type { Rule } from 'ant-design-vue/es/form'
import { adminChangePassword } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { firstAvailablePath } from '@/router'
import {
  currentPasswordHint,
  loadPasswordPolicy,
  validatePassword,
} from '@/utils/password-policy'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const loading = ref(false)
const form = ref({ username: '', password: '' })

const showChangePwd = ref(false)
const changingPwd = ref(false)
const changePwdForm = ref({ newPwd: '', confirmPwd: '' })
let loginPassword = '' // 保存登录时的密码作为oldPassword

// 强度要求由后端策略决定，拉到后才知道具体文案，因此用 ref 存一份
const pwdHint = ref(currentPasswordHint())
onMounted(async () => {
  await loadPasswordPolicy()
  pwdHint.value = currentPasswordHint()
})

const newPwdRules = computed<Rule[]>(() => [
  {
    // 校验规则跟后端共用 shared 的 checkPassword，不再硬编码 6 位
    validator: (_rule: Rule, value: string) => {
      const reason = validatePassword(value)
      return reason ? Promise.reject(reason) : Promise.resolve()
    },
  },
])

const confirmPwdRules = computed<Rule[]>(() => [
  {
    validator: (_rule: Rule, value: string) => {
      if (!value) return Promise.reject('请确认新密码')
      if (value !== changePwdForm.value.newPwd) return Promise.reject('两次密码不一致')
      return Promise.resolve()
    },
  },
])

async function handleLogin() {
  loading.value = true
  try {
    const data = await auth.login(form.value.username, form.value.password)

    if (data.admin.mustChangePassword) {
      loginPassword = form.value.password
      showChangePwd.value = true
      message.info('首次登录，请修改密码')
    } else {
      message.success('登录成功')
      router.push(landingPath())
    }
  } catch (e: any) {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    loading.value = false
  }
}

/** 登录落地页：优先回跳原地址，否则取该角色第一个有权访问的页面 */
function landingPath(): string {
  const redirect = route.query.redirect as string | undefined
  if (redirect) return redirect
  return firstAvailablePath((codes) => auth.hasAny(codes))
}

async function handleFirstChangePwd() {
  const reason = validatePassword(changePwdForm.value.newPwd)
  if (reason) {
    message.error(reason)
    return
  }
  if (changePwdForm.value.newPwd !== changePwdForm.value.confirmPwd) {
    message.error('两次密码不一致')
    return
  }
  changingPwd.value = true
  try {
    await adminChangePassword(loginPassword, changePwdForm.value.newPwd)
    message.success('密码修改成功')
    showChangePwd.value = false
    router.push(landingPath())
  } catch (e: any) {
    // 拦截器已提示
  } finally {
    changingPwd.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #F5E8D8 0%, #FFF3E0 100%);
}

.login-card {
  width: 400px;
  max-width: calc(100vw - 32px);
  padding: 48px 40px;
  background: #FFFFFF;
  border-radius: 16px;
  box-shadow: 0px 8px 24px rgba(107, 70, 60, 0.12);
  box-sizing: border-box;
}

/* 移动端断点：窄屏收窄内边距 */
@media (max-width: 767px) {
  .login-card {
    padding: 32px 20px;
    border-radius: 12px;
  }
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.brand-logo {
  display: block;
  height: 56px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  margin: 0 auto 8px;
}

.subtitle {
  font-size: 14px;
  color: #A08A72;
  margin: 0;
}
</style>
