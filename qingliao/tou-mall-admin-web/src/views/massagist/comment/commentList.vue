<template>
  <div>
  <el-drawer :visible.sync="showDrawer" :title="`${title}-评价明细`" size="60%"
  z-index="900"
  >
    <el-select v-model="searchForm.rating" @change="searchData" placeholder="请选择评分" clearable class="m-r-10">
      <el-option value="5" label="5分"></el-option>
      <el-option value="4" label="5分以下"></el-option>
    </el-select>
    <div class="CustomerIntegrationDrawer">
      <el-table :data="tableData" size="medium">
        <el-table-column prop="createTime" label="评价时间" width="155"></el-table-column>
        <el-table-column prop="massagistName" label="评价人" min-width="50"></el-table-column>
        <el-table-column prop="rating" label="评分" min-width="40"></el-table-column>
        <el-table-column prop="serviceScore" label="本次服务的印象" min-width="80" >
          <template slot-scope="scope">
            <span v-if="scope.row.serviceScore == 1">很不错</span>
            <span v-if="scope.row.serviceScore == 2">一般般</span>
            <span v-if="scope.row.serviceScore == 3">比较差</span>
          </template>
        </el-table-column>
        <el-table-column prop="peopleScore" label="理疗师的印象" width="110">
          <template slot-scope="scope">
            <span v-if="scope.row.peopleScore == 1">很不错</span>
            <span v-if="scope.row.peopleScore == 2">一般般</span>
            <span v-if="scope.row.peopleScore == 3">比较差</span>
          </template>
        </el-table-column>
        <el-table-column prop="comment" label="建议" width="300"></el-table-column>
        <el-table-column label="关联的订单" header-align="center" width="100" fixed="right">
          <template slot-scope="scope">
            <el-row justify="center" align="middle">
              <el-button size="mini"
                         type="text"
                         @click="openDetail(scope.row,scope.$index)">查看订单
              </el-button>
            </el-row>
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
  <order-detail ref="refDetail"></order-detail>
  </div>
</template>

<script>
import massagistApi from "../../../api/massagist"
import OrderDetail from "@/views/order/OrderDetail";

export default {
  name: 'CustomerIntegrationDrawer',
  components: {OrderDetail},
  props: {},
  data() {
    return {
      showDrawer: false,
      searchForm: {
        order: '-id',
      },
      tableData: [],
      total: 0,
      title: ''
    }
  },
  methods: {
    open(massagistId, title) {
      this.searchForm.rating=null;
      this.searchForm.massagistId = massagistId
      this.title = title
      this.showDrawer = true
      this.searchData()
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.showFullLoading()
      console.log(this.searchForm)
      const res = await massagistApi.pageMassagistRating(this.searchForm)
      this.hideFullLoading()
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
    openDetail(row, index) {
      row.id=row.orderId
      console.log(row)
      this.$refs.refDetail.open(row)
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.CustomerIntegrationDrawer {
  padding: 20px;
}
</style>
