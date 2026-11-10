<template>
  <div class="index">
    <order-list :type="1"></order-list>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import OrderList from "@/views/order/OrderList";

export default {
  name: 'index',
  components: {OrderList},
  props: {},
  data() {
    return {}
  },
  computed: {
    ...mapGetters([])
  },
  created() {
  },
  methods: {}
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
}
</style>
