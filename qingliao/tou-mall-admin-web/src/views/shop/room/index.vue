<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <shop-selector v-model="searchForm.shopId" style="width: 280px" @change="searchData"
                       placeholder="请选择所属门店"
                       clearable class="m-r-10"></shop-selector>
        <el-select v-model="searchForm.status" @change="searchData" placeholder="请选择房间状态" clearable class="m-r-10">
          <el-option
            v-for="item in constant.shopStatus"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-input placeholder="请输入房间名称" v-model="searchForm.name" clearable @clear="searchData">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
      </div>
      <div>
        <el-button size="mini" @click="handleAdd" style="margin-left: 20px">添加</el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column label="所属门店" prop="shopId">
          <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
        </el-table-column>
        <el-table-column label="房间名称" prop="name"></el-table-column>
        <el-table-column label="房间序号" prop="serialNumber" width="300"></el-table-column>
        <el-table-column label="房间类型" prop="type">
          <template slot-scope="scope">{{ scope.row.type | roomTypeFilter }}</template>
        </el-table-column>
        <el-table-column label="房间状态" prop="status">
          <template slot-scope="scope">{{ scope.row.status | shopStatusFilter }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template slot-scope="scope">
            <el-row>
              <el-button size="mini"
                         type="text"
                         @click="handleUpdate(scope.row,scope.$index)">
                配置
              </el-button>
              <el-button size="mini"
                         type="text"
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
        :current-page.sync="searchForm.page"
        :total="total">
      </el-pagination>
    </div>
    <room-form ref="refRoomForm" @submit-success="searchData"></room-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import roomApi from "@/api/shop/room";
import RoomForm from "@/views/shop/room/RoomForm";
import ShopSelector from "@/views/shop/shopList/ShopSelector";

export default {
  name: 'index',
  components: {ShopSelector, RoomForm},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        status: 1,
        shopId: null
      },
      dataList: [],
      listLoading: false,
      total: 0,
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
    this.$store.dispatch('setShopList')
    this.initData()
  },
  mounted() {

  },
  methods: {
    initData() {
      if (this.$route.query.shopId) {
        this.searchForm.shopId = parseInt(this.$route.query.shopId)
      }
      this.searchData()
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.listLoading = true
      let res = await roomApi.page(this.searchForm)
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
      this.$refs.refRoomForm.open()
    },
    handleUpdate(row, index) {
      this.$refs.refRoomForm.open(row)
    },
    async handleDelete(row, index) {
      await this.notifyDelete("此操作将永久删除房间及其床位，是否继续？")
      await roomApi.remove(row.id)
      this.searchData()
      this.notifySuccess()
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 20px;
}
</style>
