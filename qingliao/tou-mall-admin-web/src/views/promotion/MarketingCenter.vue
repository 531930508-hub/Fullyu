<template>
  <tabbed-page :tabs="tabs" default-tab="activity"/>
</template>

<script>
import TabbedPage from '@/views/common/TabbedPage'

export default {
  name: 'MarketingCenter',
  components: { TabbedPage },
  data() {
    return {
      tabs: [
        { name: 'activity', perm: 'marketingCenter:activity', label: '活动列表', component: () => import('@/views/promotion/activity/index') },
        { name: 'discount', perm: 'marketingCenter:discount', label: '折扣配置', component: () => import('@/views/promotion/discount/index') }
      ]
    }
  }
}
</script>