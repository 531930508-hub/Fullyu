<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <el-select v-model="searchForm.status" @change="searchData" placeholder="请选择图片状态" clearable class="m-r-10">
          <el-option
            v-for="item in constant.shopStatus"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-select v-model="searchForm.type" @change="searchData" placeholder="请选择图片类型" clearable class="m-r-10">
          <el-option
            v-for="item in constant.miniImageType"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
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
        <el-table-column label="图片类型" prop="type">
          <template slot-scope="scope">{{ scope.row.type | miniImageTypeFilter }}</template>
        </el-table-column>
        <el-table-column label="图片预览" prop="url">
          <template slot-scope="scope">
            <el-image v-if="scope.row.url"
                      style="width: 100px; height: 100px"
                      :src="scope.row.url"
                      fit="fill"></el-image>
            <span v-else>无</span>
          </template>
        </el-table-column>
        <el-table-column label="跳转地址"  prop="goUrl" min-width="200"></el-table-column>
        <el-table-column label="图片状态" prop="status">
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
    <mini-image-form ref="refMiniImageForm" @submit-success="searchData"></mini-image-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import miniImageApi from "@/api/miniImage";
import ShopForm from "@/views/shop/shopList/ShopForm";
import MiniImageForm from "@/views/ums/miniImage/MiniImageForm";

export default {
  name: 'index',
  components: {MiniImageForm, ShopForm},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        status: 1,
        order:'-id'
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
    this.searchData()
  },
  methods: {
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.listLoading = true
      let res = await miniImageApi.page(this.searchForm)
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
      this.$refs.refMiniImageForm.open()
    },
    handleUpdate(row, index) {
      this.$refs.refMiniImageForm.open(row)
    },
    async handleDelete(row, index) {
      await this.notifyDelete()
      await miniImageApi.remove(row.id)
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
