<template>
  <el-select v-model.number="id" @change="change" :disabled="disabled"
             :placeholder="placeholder" filterable :clearable="clearable">
    <el-option v-for="item in projectList.filter(e=>e.state== 1)"
               :value="item.id"
               :label="`${item.title}`" :key="item.id">
      <span>{{ item.title }}</span>
    </el-option>
  </el-select>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  name: 'ProjectSelector',
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
    ...mapGetters(['projectList'])
  },
  created() {
    this.$store.dispatch('setProjectList')
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
.ProjectSelector {
}
</style>
