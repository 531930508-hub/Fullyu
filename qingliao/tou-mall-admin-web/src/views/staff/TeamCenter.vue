<template>
  <tabbed-page :tabs="tabs" default-tab="therapist"/>
</template>

<script>
import TabbedPage from '@/views/common/TabbedPage'

export default {
  name: 'TeamCenter',
  components: { TabbedPage },
  data() {
    return {
      tabs: [
        { name: 'therapist', perm: 'teamCenter:therapist', label: '疗愈师管理', component: () => import('@/views/massagist/management/index') },
        { name: 'reviews', perm: 'teamCenter:reviews', label: '疗愈师评价', component: () => import('@/views/massagist/comment/index') },
        // 门店列表含门店基础资料与配置，仅超级管理员可见
        { name: 'shop', perm: 'teamCenter:shop', roles: ['超级管理员'], label: '门店列表', component: () => import('@/views/shop/shopList/index') },
        { name: 'beds', perm: 'teamCenter:beds', label: '床位管理', component: () => import('@/views/shop/bed/index') }
      ]
    }
  }
}
</script>