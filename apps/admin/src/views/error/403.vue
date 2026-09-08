<template>
  <a-result status="403" title="403" sub-title="你没有访问该页面的权限">
    <template #extra>
      <a-space direction="vertical" align="center">
        <a-typography-text type="secondary">
          当前角色：{{ auth.roleLabels.join('、') || auth.roles.join('、') || '未分配角色' }}
          · 归属组织：{{ auth.orgLabel }}
        </a-typography-text>
        <a-space>
          <a-button type="primary" @click="goHome">回到可用页面</a-button>
          <a-button @click="refresh">刷新权限</a-button>
        </a-space>
      </a-space>
    </template>
  </a-result>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'
import { MENU_CONFIG, filterMenu, flattenPaths } from '@/config/menu'

const router = useRouter()
const auth = useAuthStore()

function firstAvailablePath(): string {
  const visible = filterMenu(MENU_CONFIG, (codes) => auth.hasAny(codes ?? []))
  return flattenPaths(visible)[0] || '/dashboard'
}

function goHome() {
  router.replace(firstAvailablePath())
}

/** 管理员刚给我加了权限时，不必重新登录 */
async function refresh() {
  try {
    await auth.fetchProfile()
    message.success('权限已刷新')
    router.replace(firstAvailablePath())
  } catch {
    // 拦截器已提示
  }
}
</script>
