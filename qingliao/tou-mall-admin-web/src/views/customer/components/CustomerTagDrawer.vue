<template>
  <el-drawer :visible.sync="showDrawer" :title="`${nickname}-客户标签`" size="40%">
    <div class="CustomerTagDrawer">
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
import customerTagApi from '../../../api/customer/customerTag'
import basicCustomerTagApi from '../../../api/customer/basicCustomerTag'

export default {
  name: 'CustomerTagDrawer',
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
      customer: {},
      nickname: '',
      basicTagTitleMap: {}
    }
  },
  methods: {
    open(customer = {}, nickname) {
      this.customer = customer
      this.nickname = nickname
      this.showForm = false
      this.form = {customerId: customer.id}
      this.searchForm.customerId = customer.id
      this.showDrawer = true
      this.fetchData()
    },
    async loadBasicTagTitles() {
      if (Object.keys(this.basicTagTitleMap).length) return
      try {
        const res = await basicCustomerTagApi.all()
        const map = {}
        const walk = (list) => {
          (list || []).forEach(item => {
            if (!item) return
            if (item.id != null && item.title) {
              map[item.id] = item.title
            }
            walk(item.children)
          })
        }
        walk(res.data)
        this.basicTagTitleMap = map
      } catch (e) {
        this.basicTagTitleMap = {}
      }
    },
    tagTitle(tag) {
      if (!tag) return ''
      const title = tag.title || tag.name
      if (title && !/^\d+$/.test(String(title).trim())) {
        return String(title).trim()
      }
      const name = this.basicTagTitleMap[tag.basicCustomerTagId]
      return name || ''
    },
    async fetchData() {
      await this.loadBasicTagTitles()
      const res = await customerTagApi.list(this.searchForm)
      this.tableData = (res.data || []).map(tag => ({
        ...tag,
        title: this.tagTitle(tag) || '基础标签已删除'
      }))
    },
    async submitForm() {
      if (!this.form.basicCustomerTagId) {
        this.notifyWarning('请选择标签')
        return
      }
      this.showFullLoading()
      const res = await customerTagApi.save(this.form)
      this.hideFullLoading()
      const saved = res.data || {}
      const tag = {
        ...saved,
        title: this.tagTitle(saved) || this.form.title || ''
      }
      this.notifySuccess()
      this.showForm = false
      this.form = {customerId: this.customer.id}
      this.tableData.unshift(tag)
      if (!Array.isArray(this.customer.customerTagList)) {
        this.$set(this.customer, 'customerTagList', [])
      }
      this.customer.customerTagList.push(tag)
      this.$emit('change')
    },
    async handleDeleteTag(row, index) {
      await this.notifyDelete()
      await customerTagApi.removeById(row.id)
      this.notifySuccess()
      this.tableData.splice(index, 1)
      const list = this.customer.customerTagList
      if (Array.isArray(list)) {
        const targetIndex = list.findIndex(item => item && item.id === row.id)
        if (targetIndex > -1) {
          list.splice(targetIndex, 1)
        }
      }
      this.$emit('change')
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
.CustomerTagDrawer {
  padding: 20px;
}
</style>
