<template>
  <tabbed-page :tabs="tabs" default-tab="approval"/>
</template>

<script>
import TabbedPage from '@/views/common/TabbedPage'

export default {
  name: 'SystemConfigCenter',
  components: { TabbedPage },
  data() {
    return {
      tabs: [
        { name: 'approval', perm: 'systemConfig:approval', label: '审批设置', component: () => import('@/views/ums/approvalCategory/index') },
        { name: 'image', perm: 'systemConfig:image', label: '图片管理', component: () => import('@/views/ums/miniImage/index') },
        { name: 'home', perm: 'systemConfig:home', label: '首页配置', component: () => import('@/views/system/homeConfig/index') }
      ]
    }
  }
}
</script>