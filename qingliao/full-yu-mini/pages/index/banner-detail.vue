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
  nature: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0718/natureDetail.jpg',
  plant: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/content-jingyou.jpg',
  mindfulness: 'https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/icon0718/mindfulnessDetail.jpg'
}
onLoad((options) => {
  let {url, keyl} = options
  if (url) {
    src.value = decodeURIComponent(url)
  } else {
    src.value = decodeURIComponent(urlMap[keyl])
  }
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
