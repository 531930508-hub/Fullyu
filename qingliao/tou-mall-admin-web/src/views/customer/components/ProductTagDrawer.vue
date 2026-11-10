<template>
  <el-drawer :visible.sync="showDrawer" :title="`${product.title}标签`" size="40%">
    <div class="ProductTagDrawer">
      <div style="margin-bottom: 20px">
        <div v-if="showForm">
          <basic-customer-tag-cascader v-model="form.basicCustomerTagId" width="60%" :emit-path="false"
                                       @change="onChangeTag"></basic-customer-tag-cascader>
          <el-button type="primary" icon="el-icon-check" style="margin-left: 10px" @click="submitForm">提交</el-button>
          <el-button @click="showForm = false" type="info" plain icon="el-icon-close">取消</el-button>
        </div>
        <el-button v-else @click="showForm = true" type="primary" icon="el-icon-plus">添加标签</el-button>
      </div>
      <el-table :data="tableData" size="medium">
        <el-table-column prop="title" label="标签内容" min-width="180" show-overflow-tooltip></el-table-column>
        <el-table-column prop="createTime" label="添加时间" width="155" show-overflow-tooltip></el-table-column>
        <el-table-column label="操作" show-overflow-tooltip>
          <template v-slot="scope">
            <span style="cursor: pointer;padding: 0 6px" class="c-primary"
                  @click="handleDeleteTag(scope.row,scope.$index)"><i
              class="el-icon-delete m-r-4"/>删除</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-drawer>
</template>

<script>
import BasicCustomerTagCascader from './BasicCustomerTagCascader.vue'
import productTagApi from "../../../api/goods/productTag";

export default {
  name: 'ProductTagDrawer',
  components: {BasicCustomerTagCascader},
  props: {},
  data() {
    return {
      showDrawer: false,
      form: {},
      showForm: false,
      searchForm: {
        order: '-id'
      },
      tableData: [],
      product: {}
    }
  },
  methods: {
    open(product = {}) {
      this.product = product
      this.form.productId = product.id
      this.form.shopId = 1
      this.searchForm.productId = product.id
      this.showDrawer = true
      this.fetchData()
    },
    async fetchData() {
      const res = await productTagApi.list(this.searchForm)
      this.tableData = res.data || []
    },
    async submitForm() {
      if (!this.form.basicCustomerTagId) {
        this.notifyWarning('请选择标签')
        return
      }
      this.showFullLoading()
      const res = await productTagApi.save(this.form)
      this.hideFullLoading()
      this.notifySuccess()
      this.showForm = false
      this.form = {productId: this.product.id, shopId: 1}
      this.tableData.unshift(res.data)
      this.product.productTagList.push(res.data)
    },
    async handleDeleteTag(row, index) {
      await this.notifyDelete()
      productTagApi.removeById(row.id)
      this.notifySuccess()
      this.tableData.splice(index, 1)
      this.product.productTagList.splice(0, 1)
    },
    onChangeTag(tag) {
      if (tag) {
        this.form.title = tag.title
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ProductTagDrawer {
  padding: 20px;
}
</style>
