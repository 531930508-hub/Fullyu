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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { adminLogin } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const form = ref({ username: '', password: '' })

async function handleLogin() {
  loading.value = true
  try {
    const data = await adminLogin(form.value.username, form.value.password)
    localStorage.setItem('admin_token', data.token)
    localStorage.setItem('admin_name', data.admin.name)
    localStorage.setItem('admin_permissions', JSON.stringify(data.admin.permissions))
    message.success('登录成功')
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } catch (e: any) {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    loading.value = false
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
  padding: 48px 40px;
  background: #FFFFFF;
  border-radius: 16px;
  box-shadow: 0px 8px 24px rgba(107, 70, 60, 0.12);
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
