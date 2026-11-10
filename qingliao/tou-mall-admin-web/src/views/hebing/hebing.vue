<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex justify-between">
        <el-input placeholder="请输入客户Id" v-model.trim="searchForm.customerId" clearable @clear="searchData"
                  @keyup.enter.native="searchData" style="width: 160px;">
        </el-input>
      </div>
      <div>
        <el-button icon="el-icon-plus" type="primary" @click="handleExce">合并</el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>

        <el-table-column label="客户Id" prop="customerId"></el-table-column>
        <el-table-column label="订单ID" prop="orderId"></el-table-column>
        <el-table-column label="0标识卷，标识会员卡" prop="useType"></el-table-column>
        <el-table-column label="卷状态" prop="type"></el-table-column>
        <el-table-column label="使用状态" prop="state"></el-table-column>
        <el-table-column label="开始时间" prop="startTime" ></el-table-column>
        <el-table-column label="结束时间" prop="endTime" ></el-table-column>
        <el-table-column label="创建时间" prop="createTime" ></el-table-column>
        <el-table-column label="使用Order" prop="userOrder"></el-table-column>
        <el-table-column label="价值" prop="amount" ></el-table-column>
        <el-table-column label="标识1旧数据" prop="oldData"></el-table-column>
        <el-table-column label="合并状态1已合并，2未合并，3无需合并" prop="hebingStatus" ></el-table-column>


      </el-table>
    </div>
    <div class="pagination-container">
      <el-pagination
        background
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
        layout="total, sizes,prev, pager, next,jumper"
        :page-size="searchForm.size"
        :page-sizes="[5,10,15,30,100,300,500]"
        hide-on-single-page
        :current-page.sync="searchForm.page"
        :total="total">
      </el-pagination>
    </div>
  </div>
</template>
<script>
import {mapGetters} from 'vuex'
import bedApi from "@/api/shop/bed";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import BedForm from "@/views/shop/bed/BedForm";

export default {
  name: 'index',
  components: {BedForm, ShopSelector},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 30,
        status: 1,
        shopId: null,
        customerId: null,
      },
      dataList: [],
      listLoading: false,
      total: 0,
    }
  },
  computed: {
    ...mapGetters(['shopId'])
  },
  created() {
    this.$store.dispatch('setShopList')
    this.initData()
  },
  mounted() {

  },
  methods: {
    initData() {
      this.searchData()
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.listLoading = true
      let res = await bedApi.pagelist(this.searchForm)
      this.listLoading = false
      let {list, total} = res.data
      this.dataList = list || []
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
    async handleExce() {
      this.listLoading = true
      await bedApi.getListDataExce(this.searchForm)
      this.listLoading = false
      this.fetchData();
    },
    handleUpdate(row, index) {
      this.$refs.refBedForm.open(row)
    },

  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 0 20px;
}
</style>

