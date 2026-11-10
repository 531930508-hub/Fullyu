<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <shop-selector v-model="searchForm.shopId" style="width: 180px"
                       placeholder="请选择所属门店" @change="searchData"
                       clearable class="m-r-10"></shop-selector>

        <el-input placeholder="请输入疗愈师姓名" v-model="searchForm.name" clearable @clear="searchData" style="width: 260px; margin-right: 10px">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
        <el-select v-model="searchForm.status" style="width: 130px" @change="searchData">
          <el-option label="在职" :value="1"/>
          <el-option label="暂挂" :value="2"/>
          <el-option label="离职" :value="0"/>
          <el-option label="全部状态" :value="''"/>
        </el-select>
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
        <el-table-column label="疗愈师姓名" prop="name"></el-table-column>
        <el-table-column label="综合评分" prop="sex">
          <template slot-scope="scope">{{ scope.row.averageScore }}</template>
        </el-table-column>
        <el-table-column label="参与人数" prop="sex">
          <template slot-scope="scope">{{ scope.row.peopleCount }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template slot-scope="scope">
            <el-row >
              <el-button
                type="text"
                @click="lookdetail(scope.row,scope.$index)">
                查看详情
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
    <Comment-List ref="refCommentList" ></Comment-List>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import massagistApi from "@/api/massagist";
import MassagistForm from "@/views/massagist/management/MassagistForm";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import CommentList from "@/views/massagist/comment/commentList";

export default {
  name: 'index',
  components: {CommentList, ShopSelector, MassagistForm},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        status: 1,
        order:'-status'
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
    this.searchForm.shopId = this.shopId
    this.searchData()
  },
  methods: {
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.listLoading = true
      let res = await massagistApi.pageComment(this.searchForm)
      console.log(res.data)
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

    lookdetail(row, index) {
      this.$refs.refCommentList.open(row.id,row.name)
    },
    async handleDelete(row, index) {
      await this.notifyDelete()
      await massagistApi.remove(row.id)
      this.searchData()
      this.notifySuccess()
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding:0 20px;
}
</style>
