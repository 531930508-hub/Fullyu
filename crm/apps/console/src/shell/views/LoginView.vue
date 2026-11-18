<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { crmApi } from '@/modules/crm/api'
import { ApiError } from '@/shell/api'
import { useSessionStore } from '@/shell/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const form = reactive({ username: '', password: '' })
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (!form.username.trim() || !form.password) {
    error.value = '请输入用户名与密码'
    return
  }
  loading.value = true
  try {
    const data = await crmApi.login(form.username.trim(), form.password)
    session.set({ token: data.token, staff: data.staff })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <div class="brand-name">Full愈</div>
        <div class="brand-sub">中后台 · 会员与积分</div>
      </div>
      <a-form layout="vertical" @submit.prevent="submit">
        <a-form-item label="用户名">
          <a-input v-model:value="form.username" autocomplete="username" size="large" />
        </a-form-item>
        <a-form-item label="密码">
          <a-input
            v-model:value="form.password"
            type="password"
            autocomplete="current-password"
            size="large"
            @press-enter="submit"
          />
        </a-form-item>
        <a-alert v-if="error" type="error" :message="error" show-icon class="login-error" />
        <a-button type="primary" size="large" block :loading="loading" @click="submit">登录</a-button>
      </a-form>
      <p class="hint">账号由管理员在「用户与角色」中开通，权限以服务端校验为准。</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #faf7f2;
}

.login-card {
  width: 360px;
  padding: 32px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e6ded2;
  box-shadow: 0 8px 24px rgb(107 70 60 / 8%);
}

.brand {
  margin-bottom: 24px;
  text-align: center;
}

.brand-name {
  font-size: 22px;
  font-weight: 700;
  color: #6b463c;
  letter-spacing: 2px;
}

.brand-sub {
  font-size: 12px;
  color: #8a776c;
  margin-top: 4px;
}

.login-error {
  margin-bottom: 16px;
}

.hint {
  margin-top: 16px;
  font-size: 12px;
  color: #8a776c;
  line-height: 1.6;
}
</style>
