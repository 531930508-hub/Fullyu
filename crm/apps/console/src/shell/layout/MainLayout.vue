<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LogoutOutlined } from '@ant-design/icons-vue'
import { getManifests } from '@/modules/registry'
import { buildMenu } from '@/shell/menu'
import { useSessionStore } from '@/shell/session'

const manifests = getManifests()
const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const groups = computed(() =>
  buildMenu(
    manifests,
    (perm) => session.can(perm),
    (list) => session.canAll(list)
  )
)

const menuItems = computed(() =>
  groups.value.map((group) => ({
    key: group.key,
    type: 'group' as const,
    label: group.label,
    children: group.items.map((item) => ({ key: item.key, label: item.label }))
  }))
)

const openKeys = ref<string[]>(groups.value.map((group) => group.key))
const selectedKeys = computed(() => (route.name ? [String(route.name)] : []))

const pathByKey = computed(() => {
  const map = new Map<string, string>()
  for (const group of groups.value) {
    for (const item of group.items) map.set(item.key, item.path)
  }
  return map
})

function onMenuClick(info: { key: string }) {
  const path = pathByKey.value.get(info.key)
  if (path) router.push(path)
}

function logout() {
  session.logout()
  router.push('/login')
}
</script>

<template>
  <a-layout class="shell">
    <a-layout-sider width="228" class="shell-sider">
      <div class="brand">
        <div class="brand-name">Full愈</div>
        <div class="brand-sub">中后台</div>
      </div>
      <a-menu
        mode="inline"
        theme="light"
        :items="menuItems"
        :selected-keys="selectedKeys"
        v-model:open-keys="openKeys"
        @click="onMenuClick"
      />
    </a-layout-sider>

    <a-layout>
      <a-layout-header class="shell-header">
        <div class="who">
          <b>{{ session.staff?.name || '—' }}</b>
          <span class="username">{{ session.staff?.username }}</span>
          <span class="perm-count">
            {{ session.perms.includes('*') ? '全部权限' : `${session.perms.length} 项权限` }}
          </span>
        </div>
        <a-button type="text" size="small" @click="logout">
          <template #icon><LogoutOutlined /></template>
          退出
        </a-button>
      </a-layout-header>

      <a-layout-content class="shell-content">
        <div class="page-title">{{ route.meta.title }}</div>
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}

.shell-sider {
  background: #fff;
  border-right: 1px solid #e6ded2;
  overflow: auto;
}

.brand {
  padding: 18px 20px 12px;
  border-bottom: 1px solid #f0e9de;
}

.brand-name {
  font-size: 18px;
  font-weight: 700;
  color: #6b463c;
  letter-spacing: 1px;
}

.brand-sub {
  font-size: 12px;
  color: #8a776c;
}

.shell-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e6ded2;
  padding: 0 24px;
  height: 56px;
  line-height: 56px;
}

.who {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #4b3621;
}

.username {
  color: #8a776c;
  font-size: 13px;
}

.perm-count {
  font-size: 12px;
  color: #8a776c;
  border: 1px solid #e6ded2;
  border-radius: 10px;
  padding: 0 8px;
  line-height: 20px;
}

.shell-content {
  padding: 20px 24px 40px;
  background: #faf7f2;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #4b3621;
  margin-bottom: 16px;
}
</style>
