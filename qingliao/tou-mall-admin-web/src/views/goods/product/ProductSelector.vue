<template>
  <el-select v-model.number="id" @change="change" :disabled="disabled"
             :placeholder="placeholder" filterable :clearable="clearable">
    <el-option v-for="item in productList.filter(e=>e.state== 1)"
               :value="item.id"
               :label="`${item.title}`" :key="item.id">
      <span>{{ item.title }}</span>
    </el-option>
  </el-select>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  name: 'ProductSelector',
  props: {
    placeholder: {type: String, default: '请选择项目类型'},
    clearable: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    value: null,
    first: false
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
      id: ''
    }
  },
  computed: {
    ...mapGetters(['productList'])
  },
  created() {
    this.$store.dispatch('setProductList')
  },
  methods: {
    change(id) {
      this.$emit('input', id)
      this.$emit('change', id)
      let findIndex = this.productList.findIndex(e => e.id == id);
      this.$emit('selected', this.productList[findIndex])
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ProductSelector {
}
</style>
