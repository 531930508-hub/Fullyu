<template>
  <el-select v-model.number="adminId" @change="change" :disabled="disabled"
             :placeholder="placeholder" filterable :clearable="clearable">
    <el-option v-for="item in adminUserList"
               :value="item.id"
               :label="`${item.nickName}`" :key="item.id">
      <span>{{item.nickName}}</span>
    </el-option>
  </el-select>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  name: 'AdminUserSelector',
  props: {
    placeholder: {type: String, default: '请选择用户'},
    clearable: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    value: null
  },
  data() {
    return {
      adminId: ''
    }
  },
  watch: {
    value: {
      handler(newVal, oldVal) {
        this.adminId = newVal
      },
      immediate: true
    }
  },
  computed: {
    ...mapGetters(['adminUserList'])
  },
  created() {
    this.$store.dispatch('setAdminUserList')
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
.AdminUserSelector {
}
</style>
