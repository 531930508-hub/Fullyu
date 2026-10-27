<template>
  <a-layout class="main-layout">
    <!-- PC 侧边栏：>=768px 显示 -->
    <a-layout-sider
      v-if="!isMobile"
      v-model:collapsed="collapsed"
      :trigger="null"
      collapsible
      theme="light"
      width="240"
    >
      <div class="logo">
        <img class="logo-img" src="/logo.png" alt="Full愈" />
      </div>
      <a-menu v-model:selectedKeys="selectedKeys" v-model:openKeys="openKeys" mode="inline" theme="light">
        <template v-for="item in menuItems" :key="item.key">
          <a-sub-menu v-if="isGroup(item)" :key="item.key">
            <template #icon><component :is="iconOf(item.icon)" /></template>
            <template #title>
              {{ item.title }}
              <a-tag v-if="item.demo" color="orange" style="margin-left: 4px">Demo</a-tag>
            </template>
            <a-menu-item v-for="leaf in item.children" :key="leaf.key" @click="go(leaf.path)">
              {{ leaf.title }}
              <a-badge
                v-if="leaf.badge === 'approvalPending' && pendingCount"
                :count="pendingCount"
                :offset="[6, -2]"
              />
            </a-menu-item>
          </a-sub-menu>
          <a-menu-item v-else :key="item.key" @click="go(item.path)">
            <template #icon><component :is="iconOf(item.icon)" /></template>
            <span>{{ item.title }}</span>
            <a-badge
              v-if="item.badge === 'todoPending' && todoPendingCount"
              :count="todoPendingCount"
              :offset="[6, -2]"
            />
          </a-menu-item>
        </template>
      </a-menu>
    </a-layout-sider>

    <!-- 移动端抽屉：<768px 显示 -->
    <a-drawer
      v-model:open="mobileDrawerOpen"
      placement="left"
      :closable="false"
      :body-style="{ padding: 0 }"
      :width="drawerWidth"
      class="mobile-side-drawer"
    >
      <div class="logo">
        <img class="logo-img" src="/logo.png" alt="Full愈" />
      </div>
      <a-menu v-model:selectedKeys="selectedKeys" v-model:openKeys="openKeys" mode="inline" theme="light">
        <template v-for="item in menuItems" :key="`m-${item.key}`">
          <a-sub-menu v-if="isGroup(item)" :key="item.key">
            <template #icon><component :is="iconOf(item.icon)" /></template>
            <template #title>
              {{ item.title }}
              <a-tag v-if="item.demo" color="orange" style="margin-left: 4px">Demo</a-tag>
            </template>
            <a-menu-item v-for="leaf in item.children" :key="leaf.key" @click="goMobile(leaf.path)">
              {{ leaf.title }}
              <a-badge
                v-if="leaf.badge === 'approvalPending' && pendingCount"
                :count="pendingCount"
                :offset="[6, -2]"
              />
            </a-menu-item>
          </a-sub-menu>
          <a-menu-item v-else :key="item.key" @click="goMobile(item.path)">
            <template #icon><component :is="iconOf(item.icon)" /></template>
            <span>{{ item.title }}</span>
            <a-badge
              v-if="item.badge === 'todoPending' && todoPendingCount"
              :count="todoPendingCount"
              :offset="[6, -2]"
            />
          </a-menu-item>
        </template>
      </a-menu>
    </a-drawer>

    <!-- 主内容区 -->
    <a-layout>
      <!-- 顶部栏 -->
      <a-layout-header class="header">
        <div class="header-left">
          <template v-if="!isMobile">
            <MenuFoldOutlined v-if="!collapsed" class="trigger" @click="collapsed = true" />
            <MenuUnfoldOutlined v-else class="trigger" @click="collapsed = false" />
          </template>
          <MenuUnfoldOutlined v-else class="trigger" @click="mobileDrawerOpen = true" />
          <a-breadcrumb class="breadcrumb">
            <a-breadcrumb-item v-if="!isMobile">Full愈</a-breadcrumb-item>
            <a-breadcrumb-item>{{ currentRoute?.meta?.title }}</a-breadcrumb-item>
          </a-breadcrumb>
        </div>
        <div class="header-right">
          <a-tag v-if="!isMobile && auth.org" color="default" class="org-tag">
            {{ auth.org.shortName }} · {{ scopeLabel }}
          </a-tag>
          <a-dropdown>
            <span class="user-info">
              <a-avatar size="small" style="background-color: #6B463C">{{ auth.name?.charAt(0) }}</a-avatar>
              <span v-if="!isMobile" class="user-name">{{ auth.name }}</span>
            </span>
            <template #overlay>
              <a-menu>
                <a-menu-item disabled>
                  <span style="color: #A08A72; font-size: 12px">
                    {{ auth.roleLabels.join('、') || auth.roles.join('、') || '未分配角色' }}
                  </span>
                </a-menu-item>
                <a-menu-divider />
                <a-menu-item @click="showChangePwdModal = true">修改密码</a-menu-item>
                <a-menu-divider />
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
      <!-- 修改密码弹窗 -->
      <a-modal v-model:open="showChangePwdModal" title="修改密码" @ok="handleChangePwd" :confirm-loading="changingPwd">
        <a-form layout="vertical">
          <a-form-item label="原密码" required>
            <a-input-password v-model:value="pwdForm.oldPassword" placeholder="输入当前密码" />
          </a-form-item>
          <a-form-item label="新密码" required>
            <a-input-password v-model:value="pwdForm.newPassword" placeholder="至少6位新密码" />
          </a-form-item>
          <a-form-item label="确认新密码" required>
            <a-input-password v-model:value="pwdForm.confirmPassword" placeholder="再次输入新密码" />
          </a-form-item>
        </a-form>
      </a-modal>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  DashboardOutlined,
  ReadOutlined,
  ShopOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  FundOutlined,
  ApartmentOutlined,
  CheckSquareOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons-vue'
import { DATA_SCOPES } from '@fullyu/shared'
import { adminChangePassword } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { MENU_CONFIG, filterMenu, isGroup, type MenuItem } from '@/config/menu'
import { getTodoCounts } from '@/api/todo'

const router = useRouter()
const currentRoute = useRoute()
const auth = useAuthStore()
const collapsed = ref(false)
const mobileDrawerOpen = ref(false)
const selectedKeys = ref<string[]>([])
const openKeys = ref<string[]>([])

/** 按权限过滤后的菜单，PC 与移动端共用 */
const menuItems = computed<MenuItem[]>(() =>
  filterMenu(MENU_CONFIG, (codes) => auth.hasAny(codes ?? [])),
)

const scopeLabel = computed(
  () => DATA_SCOPES.find((s) => s.value === auth.dataScope)?.name ?? auth.dataScope,
)

/**
 * 待办红点。
 * 权限画像是首屏之后才到的，所以监听权限而不是只在 onMounted 拉一次；
 * 拉取失败静默处理，红点不重要，不能因为它挡住整个布局。
 *
 * pendingCount：审批中心「待我审批」数
 * todoPendingCount：待办中心全部待办数（审批 + 退款跟进 + 入群审核 + 库存预警）
 */
const pendingCount = ref(0)
const todoPendingCount = ref(0)
const hasTodoAccess = computed(() =>
  auth.hasAny(['flow:todo:view', 'order:view', 'community:view', 'scm:stock:view']),
)
async function loadPendingCount() {
  if (!hasTodoAccess.value) {
    pendingCount.value = 0
    todoPendingCount.value = 0
    return
  }
  try {
    const res = await getTodoCounts()
    pendingCount.value = res.approval
    todoPendingCount.value = res.all
  } catch {
    pendingCount.value = 0
    todoPendingCount.value = 0
  }
}
watch(hasTodoAccess, loadPendingCount, { immediate: true })

/** 待办中心内处理完单据会派发事件，侧边栏立即扣数 */
function onTodoUpdated() {
  loadPendingCount()
}
onMounted(() => window.addEventListener('todo-updated', onTodoUpdated))
onBeforeUnmount(() => window.removeEventListener('todo-updated', onTodoUpdated))

const iconMap: Record<string, any> = {
  DashboardOutlined,
  ReadOutlined,
  ShopOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  FundOutlined,
  ApartmentOutlined,
  CheckSquareOutlined,
}
function iconOf(name?: string) {
  return name ? iconMap[name] ?? SettingOutlined : SettingOutlined
}

/** 依据当前路由高亮菜单并展开所属分组 */
function syncMenuState(path: string) {
  for (const item of menuItems.value) {
    if (isGroup(item)) {
      const hit = item.children.find((leaf) => leaf.path === path)
      if (hit) {
        selectedKeys.value = [hit.key]
        if (!openKeys.value.includes(item.key)) openKeys.value = [...openKeys.value, item.key]
        return
      }
    } else if (item.path === path) {
      selectedKeys.value = [item.key]
      return
    }
  }
}
watch(
  () => currentRoute.path,
  (path, from) => {
    syncMenuState(path)
    // 离开待办/审批页时刷一次，刚批完的单要立刻从红点里扣掉
    if (from === '/todos' || from === '/system/approval-flow') loadPendingCount()
  },
  { immediate: true },
)
// 首屏权限画像后到，菜单重建时补一次高亮
watch(menuItems, () => syncMenuState(currentRoute.path))

// 响应式断点：<768px 视为移动端
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
const isMobile = computed(() => windowWidth.value < 768)
const drawerWidth = computed(() => Math.min(260, windowWidth.value - 60))
function onResize() {
  windowWidth.value = window.innerWidth
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

// 导航
function go(path: string) {
  router.push(path)
}
function goMobile(path: string) {
  router.push(path)
  mobileDrawerOpen.value = false
}

// 修改密码
const showChangePwdModal = ref(false)
const changingPwd = ref(false)
const pwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })

async function handleChangePwd() {
  if (!pwdForm.value.oldPassword) { message.warning('请输入原密码'); return }
  if (pwdForm.value.newPassword.length < 6) { message.warning('新密码至少6位'); return }
  if (pwdForm.value.newPassword !== pwdForm.value.confirmPassword) { message.warning('两次密码不一致'); return }
  changingPwd.value = true
  try {
    await adminChangePassword(pwdForm.value.oldPassword, pwdForm.value.newPassword)
    message.success('密码修改成功')
    showChangePwdModal.value = false
    pwdForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  } catch (e: any) {
    // 拦截器已提示
  } finally {
    changingPwd.value = false
  }
}

function handleLogout() {
  auth.logout()
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
  min-width: 0;
  flex: 1;
}

.trigger {
  font-size: 18px;
  cursor: pointer;
  color: #6B463C;
  flex-shrink: 0;
}

.breadcrumb {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.org-tag {
  margin: 0;
  color: #7D665C;
  background: #F7F1E8;
  border-color: #EDE5DB;
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

/* 移动端断点：<768px 收窄 header 与 content padding */
@media (max-width: 767px) {
  .header {
    padding: 0 12px;
  }
  .header-left {
    gap: 8px;
  }
  .content {
    margin: 12px;
  }
}
</style>
