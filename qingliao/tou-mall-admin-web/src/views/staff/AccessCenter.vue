<template>
  <tabbed-page :tabs="tabs" default-tab="accounts"/>
</template>

<script>
import TabbedPage from '@/views/common/TabbedPage'

export default {
  name: 'AccessCenter',
  components: { TabbedPage },
  data() {
    return {
      tabs: [
        { name: 'accounts', perm: 'accessCenter:accounts', label: '账号列表', component: () => import('@/views/ums/admin/index') },
        { name: 'roles', perm: 'accessCenter:roles', label: '角色权限', component: () => import('@/views/ums/role/index') },
        { name: 'menu', perm: 'accessCenter:menu', label: '菜单管理', component: () => import('@/views/ums/menu/index') },
        { name: 'resource', perm: 'accessCenter:resource', label: '资源列表', component: () => import('@/views/ums/resource/index') }
      ]
    }
  }
}
</script>