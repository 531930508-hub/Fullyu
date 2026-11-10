<template>
  <el-select v-model.number="shopId" @change="change" :disabled="disabled"  :style="{...selectStyle,width: itemWidth}"
             :placeholder="placeholder" filterable  :class="selectClass" :clearable="clearable">
    <el-option v-for="item in (filterStatus?shopList.filter(e=>e.status== constant.shopStatusMap.available):shopList)"
               :value="item.id"
               :label="`${item.name}`" :key="item.id">
      <span>{{ item.name }}-<span style="color: #9E9E9E">{{ item.status | shopStatusFilter }}</span></span>
    </el-option>
  </el-select>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  name: 'ShopSelector',
  props: {
    placeholder: {type: String, default: '请选择门店'},
    clearable: {type: Boolean, default: false},
    filterStatus: {type: Boolean, default: false},
    disabled: {type: Boolean, default: false},
    value: null,
    width: {
      type: [Number, String],
      default: '235px'
    },
    selectStyle: {
      type: Object,
      default() {
        return {}
      }
    },
    selectClass: {
      type: String,
      default: ''
    },
    forceUpdate: {type: Boolean, default: true},
  },
  data() {
    return {
      shopId: '',
    }
  },
  watch: {
    value: {
      handler(newVal, oldVal) {
        if (newVal){
          this.shopId = parseInt(newVal)
        } else {
          this.shopId = ''
        }
      },
      immediate: true
    }
  },
  computed: {
    ...mapGetters(['shopList']),
    itemWidth() {
      return typeof this.width == 'number' ? this.width + 'px' : this.width
    }
  },
  created() {
    this.$store.dispatch('setShopList',true)
  },
  methods: {
    change(id) {
      this.$emit('input', id)
      this.$emit('change', id)
      let selected = null;
      if (id) {
        selected = this.shopList.find(e => e.id == id)
      }
      if (this.forceUpdate && id  ) {
        this.$store.dispatch('changeShopId', id)
      }
      this.$emit('selected', selected)
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ShopSelector {
}
</style>
