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
        { name: 'shop', perm: 'teamCenter:shop', label: '门店列表', component: () => import('@/views/shop/shopList/index') },
        { name: 'rooms', perm: 'teamCenter:rooms', label: '房间管理', component: () => import('@/views/shop/room/index') },
        { name: 'beds', perm: 'teamCenter:beds', label: '床位管理', component: () => import('@/views/shop/bed/index') }
      ]
    }
  }
}
</script>