<template>
  <div style="padding:20px" class="OrderDiscountDrawer">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <shop-selector v-model="searchForm.shopId" style="width: 180px" @change="searchData"
                       placeholder="请选择所属门店"
                       clearable class="m-r-10"></shop-selector>
      </div>
      <div>
        <el-button icon="el-icon-plus" type="primary" @click="handleAddDiscountForm">添加</el-button>
      </div>
    </div>
    <div class="table-container">
    <el-table :data="tableData" style="width: 100%" border>
      <el-table-column label="所属门店" prop="shopId" width="220">
        <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
      </el-table-column>
      <el-table-column prop="discount" label="折扣">
        <template v-slot="scope">
          <span v-if="scope.row.type == 1">{{ scope.row.discount }} 折</span>
          <span v-else>{{ scope.row.discount / 100 }} 元 / {{ scope.row.duration }} 分钟</span>
        </template>
      </el-table-column>
      <el-table-column prop="useType" label="使用限制">
        <template v-slot="scope">
          {{ scope.row.useType | discountUseTypeFilter }}
        </template>
      </el-table-column>
      <el-table-column prop="comment" label="备注"></el-table-column>
      <el-table-column prop="startTime" label="开始时间"></el-table-column>
      <el-table-column prop="endTime" label="结束时间"></el-table-column>
      <el-table-column prop="createTime" label="创建时间"></el-table-column>
      <el-table-column label="操作" show-overflow-tooltip>
        <template v-slot="scope">
            <span style="cursor: pointer;padding: 0 6px" class="c-primary"
                  @click="handleUpdDiscountForm(scope.row)"><i
              class="el-icon-edit m-r-4"/>修改</span>
          <span style="cursor: pointer;padding: 0 6px" class="c-primary"
                @click="handleInvalid(scope.row.id)"><i
            class="el-icon-delete m-r-4"/>删除</span>
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
    <discount-form ref="refDiscountForm" @submit-success="saveOrUpdateDiscount"></discount-form>
    </div>
  </div>
</template>

<script>
import orderDiscountApi from "../../../api/orderDiscount"
import DiscountForm from "./DiscountForm";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import {mapGetters} from "vuex";

export default {
  name: 'index',
  components: {DiscountForm,ShopSelector},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        state: 1,
        order: 'sequence',
        shopId: null
      },
      tableData: [],
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
    this.searchData()
  },
  methods: {
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      const res = await orderDiscountApi.page(this.searchForm)
      let {list, total} = res.data
      this.tableData = list || []
      this.total = total || 0
    },
    handleSizeChange(val) {
      this.searchForm.size = val
      this.searchData()
    },
    handleCurrentChange(val) {
      this.searchForm.page = val
      this.fetchData()
    },
    handleAddDiscountForm() {
      this.$refs.refDiscountForm.open({shopId: 1, sequence: 1})
    },
    handleUpdDiscountForm(row) {
      this.$refs.refDiscountForm.open({
        ...row,
        discount: row.type == 1 ? row.discount : row.discount / 100
      })
    },
    async saveOrUpdateDiscount(row) {
      await orderDiscountApi.saveOrUpd({
        ...row,
        discount: row.type == 1 ? row.discount : row.discount * 100
      })
      this.searchData()
      this.notifySuccess()
    },
    async handleInvalid(id) {
      await this.notifyConfirm('此操作将删除订单折扣，是否继续？')
      await orderDiscountApi.removeById(id)
      this.searchData()
      this.notifySuccess()
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less">
.OrderDiscountDrawer {
  padding: 20px;

  .el-tree-node__content {
    height: 40px !important;
  }
}
</style>
