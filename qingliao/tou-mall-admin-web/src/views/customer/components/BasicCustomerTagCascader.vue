<template>
  <el-cascader v-model="id" :options="selectOptions" :placeholder="placeholder"
               :props="{ multiple: multiple, checkStrictly: checkStrictly,emitPath: emitPath, label:'title',value: 'id' }"
               :show-all-levels="!multiple"
               :style="{width: width}" clearable filterable @change="onChange"></el-cascader>
</template>

<script>
import basicCustomerTagApi from '../../../api/customer/basicCustomerTag'
export default {
  name: 'BasicCustomerTagCascader',
  props: {
    // eslint-disable-next-line vue/require-prop-type-constructor
    value: '',
    placeholder: {
      type: String,
      default: '选择标签'
    },
    width: {
      type: String,
      default: '215px'
    },
    // 是否多选
    multiple: {
      type: Boolean,
      default: false,
    },
    // 是否可选任意一级选项
    checkStrictly: {
      type: Boolean,
      default: false,
    },
    emitPath: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      id: null,
      selectOptions: []
    }
  },
  created() {
    this.fetchData()
  },
  watch: {
    value: {
      handler(newVal, oldVal) {
        this.id = newVal
        if (newVal && newVal != oldVal) {
          let entity = this.findEntityById(this.selectOptions, newVal);
          this.$emit('change', entity)
        }
      },
      immediate: true
    },
    // multiple: {
    //   handler(newVal, oldVal) {
    //     this.selectProps.multiple = newVal
    //   },
    //   immediate: true
    // },
    // checkStrictly: {
    //   handler(newVal, oldVal) {
    //     this.selectProps.checkStrictly = newVal
    //   },
    //   immediate: true
    // },
  },
  methods: {
    onChange(value) {
      this.$emit('input', value)
      if (this.selectOptions) {
        let entity = this.findEntityById(this.selectOptions, value)
        this.$emit('change', entity)
      }
    },
    findEntityById(data, id) {
      for (let i = 0; i < data.length; i++) {
        if (data[i].id == id) {
          return data[i]
        } else if (data[i].children && data[i].children.length > 0) {
          let findEntityById = this.findEntityById(data[i].children, id)
          if (findEntityById) {
            return findEntityById
          }
        }
      }
      return null;
    },
    async fetchData(){
      const res = await basicCustomerTagApi.all() || {}
      this.selectOptions = res.data || []
    }
  }
}
</script>

<style lang="less" rel="stylesheet/less" scoped>
.BasicCustomerTagCascader {
}
</style>
