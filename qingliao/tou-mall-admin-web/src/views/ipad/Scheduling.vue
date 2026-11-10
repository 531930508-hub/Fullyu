<template>
  <div class="Scheduling">
    <div class="flex justify-between">
      <div>
        <el-radio-group v-model="searchForm.type">
          <el-radio-button :label="1">座位</el-radio-button>
          <el-radio-button :label="2">疗愈师</el-radio-button>
        </el-radio-group>
      </div>
      <div>
        <span>今天</span>
        <span><</span>
        <span>></span>
        <span>2025年06月30日</span>
        <span>周一</span>
      </div>
    </div>
    <div class="flex">
      <div v-for="(row,index) in dataList" :key="index"  class="flex1">
        <div>{{row.name}}</div>
        <div>{{row}}</div>
      </div>
    </div>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import dateUtil from "@/utils/dateUtil";
import orderDetailApi from "@/api/order/orderDetail";

export default {
  name: 'Scheduling',
  props: {},
  data() {
    return {
      searchForm: {
        shopId: '',
        startDateTime: '',
        endDateTime: '',
        type: 1
      },
      dataList: []
    }
  },
  computed: {
    ...mapGetters(['shopId'])
  },
  created() {
    this.initData()
  },
  methods: {
    initData() {
      this.searchForm.shopId = this.shopId
      this.searchForm.startDateTime = dateUtil.getCurrentDateCode() + ' 00:00:00'
      this.searchForm.endDateTime = dateUtil.getCurrentDateCode() + ' 23:59:59'
      this.searchForm.type = 1
      this.fetchData()
    },
    async fetchData() {
      let res = await orderDetailApi.schedulingMap(this.searchForm)
      this.dataList = res.data || []
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.Scheduling {
}
</style>
