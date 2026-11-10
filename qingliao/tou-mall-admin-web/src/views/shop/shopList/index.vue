<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <el-select v-model="searchForm.status" @change="searchData" placeholder="门店状态" clearable class="m-r-10" style="width:120px">
          <el-option
            v-for="item in constant.shopStatus"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-input placeholder="请输入门店名称查询" v-model="searchForm.name" clearable  @keyup.enter.native="searchData"  @clear="searchData" style="width:240px">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
      </div>
      <div>
        <el-button icon="el-icon-plus" type="primary" @click="handleAdd">添加</el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="roleTable" :data="dataList" style="width: 100%;" v-loading="listLoading" border>
        <el-table-column label="门店名称" header-align="center" align="left" prop="name"
                         min-width="200" show-overflow-tooltip></el-table-column>
        <el-table-column label="门店地址" header-align="center" align="left" prop="address"
                         min-width="240" show-overflow-tooltip></el-table-column>
        <el-table-column label="商户号" header-align="center" align="left" prop="busSysId"
                         min-width="100" show-overflow-tooltip></el-table-column>
        <el-table-column label="设备编号" header-align="center" align="left" prop="printSn"
                         min-width="100" show-overflow-tooltip></el-table-column>
        <el-table-column label="最早到店" header-align="center" align="center" prop="clockInTime"
                         width="140"></el-table-column>
        <el-table-column label="最晚到店" header-align="center" align="center" prop="clockOutTime"
                         width="140"></el-table-column>
        <el-table-column label="预约间隔" header-align="center" align="center" prop="intervalMinute" width="100">
          <template slot-scope="scope">
            {{ scope.row.intervalMinute }}分钟
          </template>
        </el-table-column>
        <el-table-column label="推荐状态" header-align="center" align="center" prop="status" width="140">
          <template slot-scope="scope">
            <el-tag type="primary" v-if="scope.row.shopRecommend">是</el-tag>
            <el-tag type="info" v-else>否</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="门店状态" header-align="center" align="center" prop="status" width="140">
          <template slot-scope="scope">
            <el-tag type="primary" v-if="scope.row.status">正常</el-tag>
            <el-tag type="info" v-else>已停用</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" header-align="center" align="center">
          <template slot-scope="scope">
            <el-row>
              <el-button type="text" icon="el-icon-edit" @click="handleUpdate(scope.row,scope.$index)">编辑
              </el-button>
              <el-button type="text" icon="el-icon-delete"
                         @click="handleDelete(scope.row,scope.$index)">删除
              </el-button>
            </el-row>
          </template>
        </el-table-column>
      </el-table>
    </div>
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
    <shop-form ref="refShopForm" @submit-success="searchData"></shop-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import shopApi from '@/api/shop/shop';
import ShopForm from '@/views/shop/shopList/ShopForm';

export default {
  name: 'index',
  components: {ShopForm},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        status: 1
      },
      dataList: [],
      listLoading: false,
      total: 0,
    }
  },
  computed: {
    ...mapGetters(['shopListAll'])
  },
  created() {
    this.searchData()
    this.$store.dispatch('setShopList')
    this.$store.dispatch('setShopAllList')
  },
  methods: {
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.listLoading = true
      let res = await shopApi.page(this.searchForm)
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
    handleAdd() {
      this.$refs.refShopForm.open()
    },
    handleUpdate(row, index) {
      this.$refs.refShopForm.open(row)
    },
    async handleDelete(row, index) {
      await this.notifyDelete('此操作将永久删除门店及其房间和床位，是否继续？')
      await shopApi.remove(row.id)
      this.searchData()
      this.notifySuccess()
      this.$store.dispatch('setShopList', true)
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 0 20px;
}
</style>
