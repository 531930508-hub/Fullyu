<template>
  <tabbed-page :tabs="tabs" default-tab="schedules"/>
</template>

<script>
import TabbedPage from '@/views/common/TabbedPage'

export default {
  name: 'ShiftCenter',
  components: { TabbedPage },
  data() {
    return {
      tabs: [
        { name: 'schedules', perm: 'shiftCenter:schedules', label: '疗愈师排班', component: () => import('@/views/massagist/schedules/index') },
        { name: 'leave', perm: 'shiftCenter:leave', label: '疗愈师请假', component: () => import('@/views/massagist/leave/index') }
      ]
    }
  }
}
</script>