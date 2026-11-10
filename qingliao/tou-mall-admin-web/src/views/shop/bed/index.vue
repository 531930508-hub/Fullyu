<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <shop-selector v-model="searchForm.shopId" style="width: 180px" @change="searchData"
                       placeholder="请选择所属门店"
                       clearable class="m-r-10"></shop-selector>
        <el-select v-model="searchForm.status" @change="searchData" placeholder="请选择床位状态" clearable class="m-r-10"
                   style="width: 120px">
          <el-option
            v-for="item in constant.shopStatus"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-input placeholder="请输入床位名称" v-model="searchForm.name" clearable @keyup.enter.native="searchData"
                  @clear="searchData" style="width: 260px;">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
      </div>
      <div>
        <el-button icon="el-icon-plus" type="primary" @click="handleAdd">添加</el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column label="所属门店" prop="shopId" width="220">
          <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
        </el-table-column>
        <!--        <el-table-column label="所属房间" prop="shopId">
                  <template slot-scope="scope">{{ scope.row.roomId | roomNameFilter }}</template>
                </el-table-column>-->
        <el-table-column label="床位名称" prop="name"></el-table-column>
        <el-table-column label="床位序号" prop="serialNumber" width="300"></el-table-column>
        <el-table-column label="床位属性" prop="type">
          <template slot-scope="scope">{{ scope.row.type | bedTypeFilter }}</template>
        </el-table-column>
        <el-table-column label="床位状态" prop="status">
          <template slot-scope="scope">
            <el-tag :type="scope.row.status==0?'info':scope.row.status==1?'primary':''">
              {{ scope.row.status | shopStatusFilter }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template slot-scope="scope">
            <el-row>
              <el-button
                type="text" icon="el-icon-edit"
                @click="handleUpdate(scope.row,scope.$index)">编辑
              </el-button>
              <el-button v-if="scope.row.status==1"
                type="text" icon="el-icon-delete"
                @click="handleDelete(scope.row,scope.$index)">停用
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
    <bed-form ref="refBedForm" @submit-success="searchData"></bed-form>
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
    ...mapGetters(['shopId','shopListAll'])
  },
  created() {
    this.$store.dispatch('setShopList')
    this.$store.dispatch('setShopAllList')
    this.initData()
  },
  mounted() {

  },
  methods: {
    initData() {
      if (this.$route.query.shopId) {
        this.searchForm.shopId = parseInt(this.$route.query.shopId)
      } else {
        this.searchForm.shopId = this.shopId
      }
      this.searchData()
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.listLoading = true
      let res = await bedApi.page(this.searchForm)
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
      this.$refs.refBedForm.open()
    },
    handleUpdate(row, index) {
      this.$refs.refBedForm.open(row)
    },
    async handleDelete(row, index) {
      await this.notifyDelete("此操作将永久删除床位，是否继续？")
      await bedApi.remove(row.id)
      this.searchData()
      this.notifySuccess()
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 0 20px;
}
</style>
