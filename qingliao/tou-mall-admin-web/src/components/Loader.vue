<template>
  <div class='preloader' v-show="show">
    <div class="loader"></div>
    <div class="text">{{ text }}<span v-if="showCancel" class="pointer c-warning" @click="handleCancel">取消</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Loader',
  props: {
    show: {
      type: Boolean,
      default: false
    },
    text: {
      type: String,
      default: '正在努力处理'
    },
    // 是否显示取消
    showCancel: {
      type: Boolean,
      default: false
    },
  },
  data() {
    return {}
  },
  methods: {
    handleCancel() {
      this.$emit('cancel')
      this.$bus.$emit('cancel-loading')
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>

.preloader {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(200, 200, 200, 0.6);
  z-index: 9999;
}

.text {
  position: relative;
  text-align: center;
  top: 52%;
  color: #3ba6ec;
}

.loader {
  display: block;
  position: relative;
  left: 50%;
  top: 50%;
  width: 150px;
  height: 150px;
  margin: -75px 0 0 -75px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: #efbf77;
  -webkit-animation: spin 2s linear infinite;
  animation: spin 2s linear infinite;
}

.loader:before {
  content: "";
  position: absolute;
  top: 5px;
  left: 5px;
  right: 5px;
  bottom: 5px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: #60ccec;
  -webkit-animation: spin 3s linear infinite;
  animation: spin 3s linear infinite;
}

.loader:after {
  content: "";
  position: absolute;
  top: 15px;
  left: 15px;
  right: 15px;
  bottom: 15px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: #ef6293;
  -webkit-animation: spin 1.5s linear infinite;
  animation: spin 1.5s linear infinite;
}

@-webkit-keyframes spin {
  0% {
    -webkit-transform: rotate(0deg);
    -ms-transform: rotate(0deg);
    transform: rotate(0deg);
  }
  100% {
    -webkit-transform: rotate(360deg);
    -ms-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}

@keyframes spin {
  0% {
    -webkit-transform: rotate(0deg);
    -ms-transform: rotate(0deg);
    transform: rotate(0deg);
  }
  100% {
    -webkit-transform: rotate(360deg);
    -ms-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}
</style>
