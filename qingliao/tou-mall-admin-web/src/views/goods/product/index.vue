<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <el-select v-model="searchForm.type" @change="searchData" placeholder="请选择品类" clearable style="width: 120px"
                   class="m-r-10">
          <el-option
            v-for="item in constant.productType"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-select v-model="searchForm.state" @change="searchData" placeholder="请选择商品状态" clearable style="width: 120px"
                   class="m-r-10">
          <el-option
            v-for="item in constant.productState"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-input placeholder="请输入商品名称" v-model="searchForm.title" @keyup.enter.native="searchData" clearable
                  style="width: 260px;"
                  @clear="searchData">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
      </div>
      <div>
<!--        <el-button @click="openBasicCustomerTag" icon="el-icon-files">基础标签</el-button>-->
<!--        <el-button @click="handleShowOrderDiscount" style="margin-left: 20px">小程序首单折扣</el-button>-->
        <el-button @click="showProjectDrawer">项目列表</el-button>
        <el-button @click="showCouponDrawer">卡券列表</el-button>
        <el-button icon="el-icon-plus" @click="showForm" type="primary">添加商品</el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="loading" border>
        <el-table-column label="商品名称" prop="title" width="190" show-overflow-tooltip></el-table-column>
        <el-table-column label="商品类型" prop="type" width="80">
          <template slot-scope="scope">{{ scope.row.type | productTypeFilter }}</template>
        </el-table-column>
        <el-table-column label="商品价格" prop="amount" width="100">
          <template slot-scope="scope">{{ scope.row.amount }}元</template>
        </el-table-column>
        <el-table-column label="商品原价" prop="originalAmount" width="100">
          <template slot-scope="scope">{{ scope.row.originalAmount }}元</template>
        </el-table-column>
        <el-table-column label="商品内容（项目/卡券）" min-width="140" show-overflow-tooltip>
          <template slot-scope="scope">
            <div v-for=" (content,index) in getContent(scope.row) || []" :key="index">
              {{ content }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="限购" prop="buyLimit" width="120">
          <template slot-scope="scope">
            <span v-if="scope.row.buyLimit">单客限购:{{ scope.row.buyLimit }}次</span>
            <span v-else-if="scope.row.allLimit">库存:{{ scope.row.allLimit }}个</span>
            <span v-else>无限购</span>
          </template>
        </el-table-column>
        <el-table-column label="商品状态" prop="state" width="80">
          <template slot-scope="scope">
            <el-tag v-if="scope.row.limitState">售罄</el-tag>
            <el-tag v-else-if=" scope.row.state==1">{{ scope.row.state | productStateFilter }}</el-tag>
            <el-tag type="info" v-else-if=" scope.row.state==0">{{ scope.row.state | productStateFilter }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="说明" prop="explainArray" min-width="120" show-overflow-tooltip>
          <template slot-scope="scope">
            <div v-for=" (explain,index) in scope.row.explainArray" :key="index">
              {{ explain }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="comment" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column label="销量" prop="sale" min-width="80" show-overflow-tooltip></el-table-column>
        <el-table-column label="顺序" prop="sequence" width="50" show-overflow-tooltip>
          <template slot-scope="scope">{{ scope.row.sequence }}</template>
        </el-table-column>
        <el-table-column label="基础标签" header-align="center" align="center" min-width="100">
          <template slot-scope="scope">
            <span v-if="scope.row.productTagList && scope.row.productTagList.length" class="hover-click"
                  @click="openProductTag(scope.row)">
              <el-tag size="mini">{{ scope.row.productTagList.length }}个标签</el-tag>
            </span>
            <span v-else class="hover-click" @click="openProductTag(scope.row)">点击添加</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" prop="createTime" width="120" show-overflow-tooltip></el-table-column>
        <el-table-column label="操作" prop="createTime" width="180">
          <template slot-scope="scope">
            <el-button icon="el-icon-edit"
                       type="text"
                       @click="handleUpdate(scope.row,scope.$index)">
              编辑
            </el-button>
            <el-button icon="el-icon-remove-outline"
                       type="text" v-if="scope.row.state==1"
                       @click="handleRemove(scope.row,scope.$index)">
              下架
            </el-button>
            <el-button icon="el-icon-circle-plus-outline"
                       type="text" v-if="scope.row.state==0"
                       @click="handleList(scope.row,scope.$index)">
              上架
            </el-button>
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
        hide-on-single-page
        :page-sizes="[5,10,15]"
        :current-page.sync="searchForm.page"
        :total="total">
      </el-pagination>
    </div>
    <project-drawer ref="refProjectDrawer"></project-drawer>
    <coupon-drawer ref="refCouponDrawer"></coupon-drawer>
    <product-form ref="refProductForm" @submit-success="fetchData"></product-form>
    <basic-customer-tag-drawer ref="refBasicCustomerTagDrawer"></basic-customer-tag-drawer>
    <product-tag-drawer ref="refProductTagDrawer"></product-tag-drawer>
    <order-discount-drawer ref="refOrderDiscountDrawer"></order-discount-drawer>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import productApi from "@/api/goods/product";
import ProjectDrawer from "@/views/goods/product/ProjectDrawer";
import CouponDrawer from "@/views/goods/product/CouponDrawer";
import ProductForm from "@/views/goods/product/ProductForm";
import BasicCustomerTagDrawer from "../../customer/components/BasicCustomerTagDrawer";
import ProductTagDrawer from "../../customer/components/ProductTagDrawer";
import OrderDiscountDrawer from "../../order/OrderDiscountDrawer";

export default {
  name: 'index',
  components: {OrderDiscountDrawer, ProductTagDrawer, BasicCustomerTagDrawer, ProductForm, CouponDrawer, ProjectDrawer},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        state: 1,
        order: 'type,sequence'
      },
      dataList: [],
      loading: false,
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
      this.loading = true
      let res = await productApi.page(this.searchForm)
      this.loading = false
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
    showProjectDrawer() {
      this.$refs.refProjectDrawer.open()
    },
    showCouponDrawer() {
      this.$refs.refCouponDrawer.open()
    },
    showForm() {
      this.$refs.refProductForm.open()
    },
    handleUpdate(row, index) {
      this.$refs.refProductForm.open(row)
    },
    getContent(row) {
      let returnStr = []
      for (let i = 0; i < row.content.length; i++) {
        let content = row.content[i]
        if (content.couponId) {
          for (let coupon of row.couponList) {
            if (coupon.id == content.couponId) {//找到当前行对应卡券数据
              if (coupon.useType == 0 || coupon.useType == 1) {
                let couponStr = coupon.title + content.size + '张'
                returnStr.push(couponStr)
              } else if (coupon.useType == 2) {
                let couponStr = coupon.title
                returnStr.push(couponStr)
              }
            }
          }
        } else if (content.projectId) {
          let projectTitle = row.projectList.find(e => e.id == content.projectId).title
          returnStr.push(projectTitle)
        }
      }
      return returnStr;
    },
    async handleRemove(row) {
      await this.notifyConfirm("确定要下架吗？")
      let data = {...row, state: 0}
      this.showFullLoading()
      await productApi.upd(data)
      this.hideFullLoading()
      this.notifySuccess()
      this.fetchData()
    },
    async handleList(row) {
      await this.notifyConfirm("确定要上架吗？")
      let data = {...row, state: 1}
      this.showFullLoading()
      await productApi.upd(data)
      this.hideFullLoading()
      this.notifySuccess()
      this.fetchData()
    },
    openBasicCustomerTag() {
      this.$refs.refBasicCustomerTagDrawer.open()
    },
    openProductTag(row) {
      this.$refs.refProductTagDrawer.open(row)
    },
    handleShowOrderDiscount() {
      this.$refs.refOrderDiscountDrawer.open()
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 0 20px;
}
</style>
