<template>
  <tabbed-page :tabs="tabs" default-tab="ordinary"/>
</template>

<script>
import TabbedPage from '@/views/common/TabbedPage'

export default {
  name: 'OrderCenter',
  components: { TabbedPage },
  data() {
    return {
      tabs: [
        { name: 'ordinary', perm: 'orderCenter:ordinary', label: '普通订单', component: () => import('@/views/order/ordinary/index') },
        { name: 'coupons', perm: 'orderCenter:coupons', label: '卡券订单', component: () => import('@/views/order/coupons/index') }
      ]
    }
  }
}
</script>