<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <shop-selector v-model="searchForm.shopId" style="width: 180px" @change="searchData"
                       placeholder="请选择所属门店"
                       clearable class="m-r-10"></shop-selector>

        <el-input placeholder="请输入活动标题" v-model.trim="searchForm.title" clearable @clear="searchData"
                  @keyup.enter.native="searchData" style="width: 220px;" class="m-r-10">

        </el-input>
        <el-select v-model="searchForm.status" @change="searchData" placeholder="请选择活动状态" clearable class="m-r-10">
          <el-option
            v-for="item in constant.activityStatus"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-input placeholder="请输入活动编码（code）" v-model.trim="searchForm.code" clearable @clear="searchData"
                  @keyup.enter.native="searchData" style="width: 260px;">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
      </div>
      <div>
<!--        <el-button @click="openBasicCustomerTag" icon="el-icon-files">基础标签</el-button>-->
        <el-button icon="el-icon-plus" @click="handleAdd" style="margin-left: 20px">添加</el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;" border>
        <el-table-column label="所属门店" prop="shopId" width="220">
          <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
        </el-table-column>
        <el-table-column label="活动标题" prop="title"></el-table-column>
        <el-table-column label="活动编码" prop="code"></el-table-column>
        <el-table-column label="开始日期" prop="startDate" show-overflow-tooltip></el-table-column>
        <el-table-column label="结束日期" prop="endDate" show-overflow-tooltip></el-table-column>
        <el-table-column label="活动状态" prop="status">
          <template slot-scope="scope">{{ scope.row.status | activityStatusFilter }}</template>
        </el-table-column>
        <el-table-column label="基础标签" header-align="center" align="center" min-width="100">
          <template slot-scope="scope">
            <span v-if="scope.row.activityTagList && scope.row.activityTagList.length" style="cursor: pointer"
                  @click="openActivityTag(scope.row)">
              <el-tag size="mini">{{ scope.row.activityTagList.length }}个标签</el-tag>
            </span>
            <span v-else style="cursor: pointer" @click="openActivityTag(scope.row)">点击添加</span>
          </template>
        </el-table-column>
        <el-table-column label="小程序活动码">
          <template slot-scope="scope">
            <div style="display: flex;align-items: center">
              <el-image v-if="scope.row.miniProgramQrCodeUrl" :preview-src-list="[scope.row.miniProgramQrCodeUrl]"
                        :src="scope.row.miniProgramQrCodeUrl"
                        style="height: 40px;width: 40px;margin-right: 4px" fit="full"></el-image>
              <span v-else style="cursor: pointer;color: #409EFF" @click="onHandleBuildQrCode(scope.row)"><i
                class="el-icon-plus"></i>点击生成</span>
              <span v-if="scope.row.miniProgramQrCodeUrl" style="cursor: pointer;color: #409EFF"
                    @click="onHandleBuildQrCode(scope.row)"><i class="el-icon-edit"></i>点击修改</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template slot-scope="scope">
            <el-row>
              <el-button
                type="text"
                @click="handleEdit(scope.row,scope.$index)">
                编辑
              </el-button>
              <el-button
                type="text" v-if="scope.row.status==0"
                @click="handleEnable(scope.row,scope.$index)">启用
              </el-button>
              <el-button
                type="text" v-if="scope.row.status==1"
                @click="handleDisable(scope.row,scope.$index)">禁用
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
    <basic-customer-tag-drawer ref="refBasicCustomerTagDrawer"></basic-customer-tag-drawer>
    <activity-tag-drawer ref="refActivityTagDrawer"></activity-tag-drawer>
    <activity-form ref="refActivityForm" @submit-success="fetchData"></activity-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import activityApi from "@/api/promotion/activity";
import ActivityForm from "@/views/promotion/activity/ActivityForm";
import BasicCustomerTagDrawer from "../../customer/components/BasicCustomerTagDrawer";
import ActivityTagDrawer from "../../customer/components/ActivityTagDrawer";
import ShopSelector from "@/views/shop/shopList/ShopSelector";

export default {
  name: 'index',
  components: {ActivityTagDrawer, BasicCustomerTagDrawer, ActivityForm,ShopSelector},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        status: 1,
        order:'-create_time',
      },
      dataList: [],
      total: 0,
    }
  },
  computed: {
    ...mapGetters(['shopId','shopListAll'])
  },
  created() {
    this.searchForm.shopId = this.shopId;
    this.$store.dispatch('setShopList')
    this.$store.dispatch('setShopAllList')
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
      this.showFullLoading()
      let res = await activityApi.page(this.searchForm)
      this.hideFullLoading()
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
      this.$refs.refActivityForm.open()
    },
    async onHandleBuildQrCode(row) {
      const path = await this.getInputText('生成小程序活动码', '小程序页面地址(不能以/开头)', row.miniProgramPagePath)
      if (!path) {
        this.notifyWarning('请输入小程序页面地址')
        return
      }
      this.showFullLoading()
      const res = await activityApi.buildMiniProgramQrCode(row.id, path)
      this.hideFullLoading()
      this.notifySuccess()
      row.miniProgramQrCodeUrl = res.data
    },
    handleEdit(row, index) {
      this.$refs.refActivityForm.open(row)
    },
    async handleEnable(row, index) {
      await this.notifyDelete("此操作将此活动状态改为启用，是否继续？")
      await activityApi.enable(row.id)
      this.fetchData()
      this.$store.dispatch("setActivityDoingList", true)
      this.notifySuccess()
    },
    async handleDisable(row, index) {
      await this.notifyDelete("此操作将此活动状态改为禁用，是否继续？")
      await activityApi.disable(row.id)
      this.fetchData()
      this.$store.dispatch("setActivityDoingList", true)
      this.notifySuccess()
    },
    openBasicCustomerTag() {
      this.$refs.refBasicCustomerTagDrawer.open()
    },
    openActivityTag(row) {
      this.$refs.refActivityTagDrawer.open(row)
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 20px;
}
</style>
