<template>
  <tabbed-page :tabs="tabs" default-tab="board"/>
</template>

<script>
import TabbedPage from '@/views/common/TabbedPage'

export default {
  name: 'IncentiveCenter',
  components: { TabbedPage },
  data() {
    return {
      tabs: [
        { name: 'board', perm: 'incentiveCenter:board', label: '激励看板', component: () => import('@/views/incentive/dashboard/index') },
        { name: 'training', perm: 'incentiveCenter:training', label: '培训考核', component: () => import('@/views/incentive/training/index') },
        { name: 'settings', perm: 'incentiveCenter:settings', label: '奖励参数', component: () => import('@/views/incentive/settings/index') }
      ]
    }
  }
}
</script>