<template>
  <a-layout class="main-layout">
    <!-- 侧边栏 -->
    <a-layout-sider v-model:collapsed="collapsed" :trigger="null" collapsible theme="light" width="240">
      <div class="logo">
        <img class="logo-img" src="/logo.png" alt="Full愈" />
      </div>
      <a-menu v-model:selectedKeys="selectedKeys" v-model:openKeys="openKeys" mode="inline" theme="light">
        <a-menu-item key="dashboard" @click="$router.push('/dashboard')">
          <template #icon><DashboardOutlined /></template>
          <span>工作台</span>
        </a-menu-item>

        <a-sub-menu key="education">
          <template #icon><ReadOutlined /></template>
          <template #title>教务管理</template>
          <a-menu-item key="trainers" @click="$router.push('/education/trainers')">导师管理</a-menu-item>
          <a-menu-item key="courses" @click="$router.push('/education/courses')">课程管理</a-menu-item>
          <a-menu-item key="checkin" @click="$router.push('/education/checkin')">课程签到</a-menu-item>
          <a-menu-item key="reviews" @click="$router.push('/education/reviews')">课程评价</a-menu-item>
          <a-menu-item key="tasks" @click="$router.push('/education/tasks')">任务管理</a-menu-item>
          <a-menu-item key="materials" @click="$router.push('/education/materials')">物料管理</a-menu-item>
          <a-menu-item key="venues" @click="$router.push('/education/venues')">场地管理</a-menu-item>
        </a-sub-menu>

        <a-sub-menu key="sales">
          <template #icon><ShopOutlined /></template>
          <template #title>销售管理</template>
          <a-menu-item key="users" @click="$router.push('/sales/users')">用户管理</a-menu-item>
          <a-menu-item key="membercards" @click="$router.push('/sales/membercards')">会员卡管理</a-menu-item>
          <a-menu-item key="membercard-products" @click="$router.push('/sales/membercard-products')">会员卡商品</a-menu-item>
          <a-menu-item key="vouchers" @click="$router.push('/sales/vouchers')">代金券管理</a-menu-item>
          <a-menu-item key="orders" @click="$router.push('/sales/orders')">订单管理</a-menu-item>
        </a-sub-menu>

        <a-sub-menu key="system">
          <template #icon><SettingOutlined /></template>
          <template #title>系统管理</template>
          <a-menu-item key="settlement" @click="$router.push('/system/settlement')">结算管理</a-menu-item>
          <a-menu-item key="analytics" @click="$router.push('/system/analytics')">数据分析</a-menu-item>
          <a-menu-item key="rbac" @click="$router.push('/system/rbac')">权限管理</a-menu-item>
          <a-menu-item key="dict" @click="$router.push('/system/dict')">值集管理</a-menu-item>
        </a-sub-menu>
      </a-menu>
    </a-layout-sider>

    <!-- 主内容区 -->
    <a-layout>
      <!-- 顶部栏 -->
      <a-layout-header class="header">
        <div class="header-left">
          <MenuFoldOutlined v-if="!collapsed" class="trigger" @click="collapsed = true" />
          <MenuUnfoldOutlined v-else class="trigger" @click="collapsed = false" />
          <a-breadcrumb class="breadcrumb">
            <a-breadcrumb-item>Full愈</a-breadcrumb-item>
            <a-breadcrumb-item>{{ currentRoute?.meta?.title }}</a-breadcrumb-item>
          </a-breadcrumb>
        </div>
        <div class="header-right">
          <a-dropdown>
            <span class="user-info">
              <a-avatar size="small" style="background-color: #6B463C">{{ adminName?.charAt(0) }}</a-avatar>
              <span class="user-name">{{ adminName }}</span>
            </span>
            <template #overlay>
              <a-menu>
                <a-menu-item @click="handleLogout">退出登录</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </a-layout-header>

      <!-- 内容区 -->
      <a-layout-content class="content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  DashboardOutlined,
  ReadOutlined,
  ShopOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons-vue'

const router = useRouter()
const currentRoute = useRoute()
const collapsed = ref(false)
const selectedKeys = ref(['dashboard'])
const openKeys = ref(['education'])
const adminName = ref(localStorage.getItem('admin_name') || '管理员')

function handleLogout() {
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin_name')
  router.push('/login')
}
</script>

<style scoped>
.main-layout {
  min-height: 100vh;
}

.logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #EDE5DB;
}

.logo-img {
  height: 40px;
  max-width: 100%;
  object-fit: contain;
}

.header {
  background: #FFFFFF;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(107, 70, 60, 0.06);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.trigger {
  font-size: 18px;
  cursor: pointer;
  color: #6B463C;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.user-name {
  font-size: 14px;
  color: #4B3621;
}

.content {
  margin: 24px;
  background: transparent;
}
</style>
