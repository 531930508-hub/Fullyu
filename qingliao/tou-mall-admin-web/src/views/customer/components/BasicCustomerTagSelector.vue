<template>
  <el-select v-model.number="id" @change="change" :disabled="disabled" :multiple="multiple"
             :placeholder="placeholder" filterable :clearable="clearable">
    <el-option v-for="item in customerTagList" :value="item.id" :label="`${item.title}`" :key="item.id">
      <span>{{ item.title }}</span>
    </el-option>
  </el-select>
</template>

<script>
import basicCustomerTagApi from "../../../api/customer/basicCustomerTag"

export default {
  name: 'BasicCustomerTagSelector',
  props: {
    placeholder: {type: String, default: '请选择客户标签'},
    clearable: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    multiple: {type: Boolean, default: false},
    value: null,
  },
  watch: {
    value: {
      handler(newVal, oldVal) {
        this.id = newVal
      },
      immediate: true
    }
  },
  data() {
    return {
      id: '',
      customerTagList: []
    }
  },
  created() {
    this.fetchData()
  },
  methods: {
    async fetchData() {
      const {data} = await basicCustomerTagApi.list() || {}
      this.customerTagList = data || []
    },
    change(id) {
      this.$emit('input', id)
      this.$emit('change', id)
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ProductSelector {
}
</style>
