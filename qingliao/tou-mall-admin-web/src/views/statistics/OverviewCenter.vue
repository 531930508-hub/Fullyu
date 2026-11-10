<template>
  <tabbed-page :tabs="tabs" default-tab="revenue"/>
</template>

<script>
import TabbedPage from '@/views/common/TabbedPage'

export default {
  name: 'StatisticsOverview',
  components: { TabbedPage },
  data() {
    return {
      tabs: [
        { name: 'revenue', perm: 'statisticsOverview:revenue', label: '经营流水', component: () => import('@/views/statistics/revenue/index') },
        { name: 'serviceDuration', perm: 'statisticsOverview:serviceDuration', label: '服务时长', component: () => import('@/views/statistics/serviceDuration/index') },
        { name: 'therapistStats', perm: 'statisticsOverview:therapistStats', label: '疗愈师统计', component: () => import('@/views/statistics/therapistStats/index') },
        { name: 'monthly', perm: 'statisticsOverview:monthly', label: '月度统计', component: () => import('@/views/statistics/monthly/index') }
      ]
    }
  }
}
</script>