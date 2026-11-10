<template>
  <el-select v-model.number="id" @change="change" :disabled="disabled"
             :placeholder="placeholder" filterable :clearable="clearable">
    <el-option v-for="item in couponList"
               :value="item.id" :disabled="item.state== 0"
               :label="`${item.title}`" :key="item.id">
      <span>{{ item.title }}</span>
      <span v-if="item.state== 0" style="font-size: 12px" class="c-info"> - 已下架</span>
      <span v-else>
        <span v-if="item.useType" style="font-size: 12px" class="c-info"> - {{ item.useType | couponUseTypeFilter }}</span>
        <span v-if="item.comment" style="font-size: 12px" class="c-info"> - {{ item.comment }}</span>
      </span>
    </el-option>
  </el-select>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  name: 'CouponSelector',
  props: {
    placeholder: {type: String, default: '请选择项目'},
    clearable: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    value: null
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
  data() {
    return {
      id: ''
    }
  },

  computed: {
    ...mapGetters(['couponList'])
  },
  created() {
    this.$store.dispatch('setCouponList')
  },
  methods: {
    change(id) {
      this.$emit('input', id)
      this.$emit('change', id)
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.CouponSelector {
}
</style>
