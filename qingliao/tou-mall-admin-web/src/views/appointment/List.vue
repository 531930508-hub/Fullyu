<template>
  <div class="appointment-list-page">
    <order-list :type="0"></order-list>
  </div>
</template>

<script>
import OrderList from '@/views/order/OrderList'

export default {
  name: 'appointmentList',
  components: { OrderList }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.appointment-list-page {
  min-height: calc(100vh - 124px);
}
</style>