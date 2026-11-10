<template>
  <el-drawer :visible.sync="showDrawer" :title="`${title}-Full愈券列表`" size="50%">
    <div class="CustomerCouponDrawer">
      <el-select v-model="searchForm.state" @change="searchData" placeholder="状态" clearable>
        <el-option v-for="item in sortedCustomerCouponState" :key="item.value" :label="item.label"
                   :value="item.value"></el-option>
      </el-select>
      <el-table :data="tableData" size="medium">
        <el-table-column prop="couponTitle" label="卡券名称" min-width="100" show-overflow-tooltip></el-table-column>
        <el-table-column prop="code" label="code"></el-table-column>
        <el-table-column prop="typeLabel" label="类型" min-width="100" show-overflow-tooltip></el-table-column>
        <el-table-column prop="state" label="状态" width="80">
          <template v-slot="scope">
            {{ scope.row.state | customerCouponStateFilter }}
          </template>
        </el-table-column>
        <el-table-column prop="startTime" label="有效期起"></el-table-column>
        <el-table-column prop="endTime" label="有效期止">
          <template v-slot="scope">
            {{ !scope.row.endTime || (scope.row.endTime && scope.row.endTime.startsWith('2')) ? scope.row.endTime : '永久有效' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" show-overflow-tooltip>
          <template v-slot="scope">
            <span v-if="scope.row.state == 1" style="cursor: pointer;padding: 0 6px" class="c-primary"
                  @click="handleInvalid(scope.row,scope.$index)"><i
              class="el-icon-refresh-left m-r-4"/>回收</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-container">
        <el-pagination
          background
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          layout="total, sizes,prev, pager, next,jumper"
          :page-size="searchForm.size"
          :page-sizes="[5,10,15]"
          hide-on-single-page
          :current-page.sync="searchForm.page"
          :total="total">
        </el-pagination>
      </div>
    </div>
  </el-drawer>
</template>

<script>
import customerCouponApi from "../../../api/customer/customerCoupon"
import constant from "../../../consts/constant"

export default {
  name: 'CustomerCouponDrawer',
  props: {},
  data() {
    return {
      showDrawer: false,
      searchForm: {
        page: 1,
        size: 10,
        order: '-id',
        useType: 0
      },
      tableData: [],
      total: 0,
      title: ''
    }
  },
  computed: {
    sortedCustomerCouponState() {
      return constant.customerCouponState.sort((a, b) => {
        if (a.value === 1) return -1
        if (b.value === 1) return 1
        return a.value - b.value
      })
    },
  },
  methods: {
    open(customerId, title) {
      this.searchForm.customerId = customerId
      this.searchForm.state = 1
      this.title = title
      this.showDrawer = true
      this.searchData()
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      const res = await customerCouponApi.page(this.searchForm)
      let {list, total} = res.data
      this.tableData = list || []
      this.total = total || 0
    },
    handleSizeChange(val) {
      this.searchForm.size = val;
      this.searchData();
    },
    handleCurrentChange(val) {
      this.searchForm.page = val;
      this.fetchData();
    },
    async handleInvalid(row, index) {
      await this.notifyConfirm('此操作将回收客户的Full愈券，是否继续？')
      await customerCouponApi.invalid(row.id)
      this.searchData()
      this.notifySuccess()
      this.$emit('submit-success')
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.CustomerCouponDrawer {
  padding: 0 20px;
}
</style>
