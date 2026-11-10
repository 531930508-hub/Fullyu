<template>
  <el-select v-model.number="id" @change="change"
             :placeholder="placeholder" filterable :clearable="clearable">
    <el-option
      v-for="item in approvalCategoryListShop"
      :value="item.id"
      :label="`${item.title}`" :key="item.id">
      <span>{{ item.title }}</span>
    </el-option>
  </el-select>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  name: 'ApprovalCategorySelector',
  props: {
    placeholder: {type: String, default: '请选择审批类型'},
    clearable: {type: Boolean, default: true},
    value: null,
    shopId: null,
  },
  data() {
    return {
      id: ''
    }
  },
  watch: {
    value: {
      handler(newVal, oldVal) {
        console.log(newVal)
        this.id = newVal
      },
      immediate: true
    }
  },
  computed: {
    ...mapGetters(['approvalCategoryListShop'])
  },
  created() {
    this.$store.dispatch('setApprovalCategoryList',[true,this.shopId])
  },
  methods: {
    change(id) {
      this.$emit('input', id)
      this.$emit('change', id)
    },
    changeShopId(shopid) {
      this.id = '';
      this.$store.dispatch('setApprovalCategoryList',[true,shopid])
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ApprovalCategorySelector {
}
</style>
