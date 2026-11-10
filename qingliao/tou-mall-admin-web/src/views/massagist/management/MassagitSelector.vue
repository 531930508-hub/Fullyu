<template>
  <el-select v-model.number="massagistId" @change="change" :disabled="disabled"  :multiple="multiple"
             :placeholder="placeholder" filterable :clearable="clearable">
    <el-option v-for="item in finalList"
               :value="item.id"
               :label="`${item.name}`" :key="item.id">
      <span>{{ item.name }}-<span style="color: #9E9E9E">{{ item.status | jobStatusFilter }}</span></span>
    </el-option>
  </el-select>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  name: 'MassagistSelector',
  props: {
    placeholder: {type: String, default: '请选择疗愈师'},
    clearable: {type: Boolean, default: false},
    filterStatus: {type: Number, default: null},
    disabled: {type: Boolean, default: false},
    value: null,
    shopId: null,
    multiple: {
      type: Boolean,
      default: false
    },
  },
  data() {
    return {
      massagistId: ''
    }
  },
  watch: {
    value: {
      handler(newVal, oldVal) {
        if (newVal) {
          if (this.multiple) {
            this.massagistId = newVal
          } else {
            this.massagistId = parseInt(newVal)
          }
        } else {
          this.massagistId = null
        }
      },
      immediate: true
    }
  },
  computed: {
    ...mapGetters(['massagistList']),
    finalList() {
      return this.massagistList.filter(m => {
        let shopFilter = true
        if (this.shopId) {
          shopFilter = m.shopId == this.shopId
        }
        let statusFilter = true
        if (this.filterStatus != null && this.filterStatus >= 0) {
          statusFilter = m.status == this.filterStatus
        }
        return shopFilter && statusFilter
      })
    }
  },
  created() {
    this.$store.dispatch('setMassagistList')
  },
  methods: {
    change(id) {
      this.$emit('input', id)
      this.$emit('change', id)
      if (!this.multiple) {
        let find = this.finalList.find(e => e.id == id);
        this.$emit('selected', find)
      }
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.MassagistSelector {
}
</style>
