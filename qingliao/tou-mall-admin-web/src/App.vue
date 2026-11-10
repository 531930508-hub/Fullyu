<template>
  <div id="app">
    <router-view/>
    <loader :show="loadingFull" :text="loadingText" :show-cancel="showCancelLoading"
            @cancel="loadingFull = false"></loader>
  </div>
</template>

<script>
import Loader from './components/Loader.vue'

export default {
  name: 'App',
  components: {Loader},
  data() {
    return {
      loadingFull: false,
      // 是否显示加载框的取消加赞
      showCancelLoading: false,
      loadingText: '正在努力处理'
    }
  },
  mounted() {
    const vm = this
    this.$bus.$on('showFullLoading', (loadingText, isShowCancel = false) => {
      vm.loadingFull = true
      vm.showCancelLoading = isShowCancel
      vm.loadingText = loadingText
    })
    this.$bus.$on('hideFullLoading', () => {
      vm.loadingFull = false
    })
  }
}
</script>

<style>
@import "./assets/iconfonts/style.css";
</style>
