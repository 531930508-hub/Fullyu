<template>
  <el-select v-model.number="roomId" @change="change"
             :placeholder="placeholder" filterable :clearable="clearable">
    <el-option
      v-for="item in (filterStatus?roomList.filter(e=>shopId?e.shopId==shopId && e.status== constant.shopStatusMap.available:
      e.status== constant.shopStatusMap.available):
      roomList.filter(e=>shopId?e.shopId==shopId:true))"
      :value="item.id"
      :label="`${item.name}`" :key="item.id">
      <span>{{ item.name }}-<span style="color: #9E9E9E">{{ item.status | shopStatusFilter }}</span></span>
    </el-option>
  </el-select>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  name: 'RoomSelector',
  props: {
    placeholder: {type: String, default: '请选择门店'},
    clearable: {type: Boolean, default: false},
    filterStatus: {type: Boolean, default: false},
    value: null,
    shopId: null,
  },
  data() {
    return {
      roomId: ''
    }
  },
  watch: {
    value: {
      handler(newVal, oldVal) {
        console.log(newVal)
        this.roomId = newVal
      },
      immediate: true
    }
  },
  computed: {
    ...mapGetters(['roomList'])
  },
  created() {
    this.$store.dispatch('setRoomList')
  },
  methods: {
    change(id) {
      this.$emit('input', id)
      this.$emit('change', id)
      let find = this.roomList.find(e => e.id == id);
      console.log(find)
      this.$emit('selected', find)
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.RoomSelector {
}
</style>
