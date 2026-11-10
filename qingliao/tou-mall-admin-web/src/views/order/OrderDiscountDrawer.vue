<template>
  <el-drawer :visible.sync="showDrawer" title="小程序首单折扣配置" size="40%">
    <div style="padding:20px" class="OrderDiscountDrawer">
      <el-button v-show="!tableData.length" type="primary" @click="saveOrUpdateDiscount" icon="el-icon-plus"
                 style="margin-bottom:16px;">
        添加
      </el-button>
      <el-table :data="tableData" style="width: 100%">
        <el-table-column prop="discount" label="折扣">
          <template v-slot="scope">
            {{ (scope.row.discount / 10).toFixed(1) }} 折
          </template>
        </el-table-column>
        <el-table-column label="操作" show-overflow-tooltip>
          <template v-slot="scope">
            <span style="cursor: pointer;padding: 0 6px" class="c-primary"
                  @click="saveOrUpdateDiscount(scope.row)"><i
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
    </div>
  </el-drawer>
</template>

<script>
import OrderDiscountApi from "@/api/orderDiscount"

export default {
  name: 'OrderDiscountDrawer',
  props: {},
  data() {
    return {
      showDrawer: false,
      searchForm: {
        page: 1,
        size: 10,
        state: 1,
        order: 'sequence'
      },
      tableData: [],
      total: 0,
    }
  },
  methods: {
    open() {
      this.searchData()
      this.showDrawer = true
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      const res = await OrderDiscountApi.page(this.searchForm)
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
    saveOrUpdateDiscount(row) {
      this.$prompt('请输入首单折扣(0.1-9.9折)', '配置首单折扣', {
        inputErrorMessage: '折扣必须为0.1-9.9折',
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputType: 'number',
        inputPattern: /^(0\.[1-9]|[1-9])(\.[0-9])?$/,
        inputValue: (row.discount / 10).toFixed(1)
      }).then(async ({value}) => {
        await OrderDiscountApi.saveOrUpd({...row, discount: value * 10})
        this.searchData()
      })
    },
    async handleInvalid(id) {
      await this.notifyConfirm('此操作将删除订单折扣，是否继续？')
      await OrderDiscountApi.removeById(id)
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
