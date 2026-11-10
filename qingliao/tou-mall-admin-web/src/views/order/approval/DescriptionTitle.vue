<template>
  <div class="DescriptionTitle" style="display: flex;align-items: center"
       :style="`background:${descBg};padding:${descPd}`">
    <div style="width: 3px;height: 15px;display: inline-block;margin-right: 8px"
         :style="`background:${iBg}`" v-show="enableI"></div>
    <slot></slot>
    <div style="margin-left:auto;">
      <slot name="extra"></slot>
    </div>    
  </div>
</template>

<script>
export default {
  name: "DescriptionTitle",
  props: {
    descBg: {
      default: '#F7F8FA',
      type: String
    },
    iBg: {
      default: '#1678FF',
      type: String
    },
    descPd: {
      default: '9px',
      type: String
    },
    enableI:{
      default: false,
      type: Boolean
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.DescriptionTitle {
  background-color: #F7F8FA;
  font-weight: 500;
}
</style>
