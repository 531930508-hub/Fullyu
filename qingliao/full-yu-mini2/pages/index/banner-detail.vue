<template>
  <view class="banner-detail">
    <image :src="src" mode="widthFix"></image>
  </view>
</template>

<script setup>
import {ref} from 'vue'
import {onShow, onLoad} from '@dcloudio/uni-app'

const src = ref('https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/header-bg.png')

const urlMap = {
  head: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/headdetail.jpg',
  body: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/v2.0/bodydetail.jpg',
}
onLoad((options) => {
  let {keyl} = options
    src.value = decodeURIComponent(urlMap[keyl])
})

</script>

<style lang="scss" scoped>
.banner-detail {
  height: 100vh;
  width: 100%;

  image {
    width: 100%;
  }
}
</style>
