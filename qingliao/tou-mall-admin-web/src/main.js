import Vue from 'vue'

import 'normalize.css/normalize.css'// A modern alternative to CSS resets

import ElementUI from 'element-ui'
import '@/styles/element-variables.scss'
import locale from 'element-ui/lib/locale/lang/zh-CN' // lang i18n
import VCharts from 'v-charts'

import '@/styles/index.scss' // global css

import App from './App'
import router from './router'
import store from './store'

import '@/icons' // icon
import '@/permission' // permission control
import constant from "@/consts/constant";
import * as filters from './filter'
import Bus from "@/utils/Bus";

Vue.use(ElementUI, {locale})
Vue.use(VCharts)
Vue.prototype.$bus = Bus
Vue.config.productionTip = false

new Vue({
  el: '#app',
  router,
  store,
  template: '<App/>',
  components: {App}
})

Object.keys(filters).forEach(key => {
  Vue.filter(key, filters[key])
})

Vue.mixin({
  data() {
    return {
      constant
    }
  },
  methods: {
    /**
     * 显示全页面加载框
     * @param loadingText 加载文字
     * @param isShowCancel 是否显示取消加载：对于超长耗时的操作，可以取消加载以免阻塞其他操作
     */
    showFullLoading(loadingText = '正在努力处理中', isShowCancel = false) {
      this.$bus.$emit('showFullLoading', loadingText, isShowCancel)
    },
    hideFullLoading() {
      this.$bus.$emit('hideFullLoading')
    },
    notifySuccess(msg = '操作成功', title = '成功') {
      this.notify(title, msg, 'success')
    },
    notifyWarning(msg = '警告', title = '警告') {
      this.notify(title, msg, 'warning')
    },
    notifyError(msg = '操作错误') {
      this.notify('警告', msg, 'error')
    },
    async notifyDelete(msg = '此操作将永久删除, 是否继续?') {
      await this.notifyConfirm(msg, '删除提醒')
    },
    async notifyConfirm(msg = '确定要操作吗', title = '提示', sureText = '确定', cancelText = '取消', callback) {
      await this.$confirm(msg, title, {
        confirmButtonText: sureText,
        cancelButtonText: cancelText,
        closeOnClickModal: false,
        closeOnPressEscape: false,
        distinguishCancelAndClose: true,
        type: 'warning',
        beforeClose: callback
      })
    },
    notify(title, msg, type) {
      this.$notify({
        title,
        message: msg,
        type: type,
        duration: 2000
      })
    },
    async getInputText(title = '提示', tipText, inputValue = '', type = '', isNumber = false) {
      const {value: valueText} = await this.$prompt(tipText, title, {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: type,
        inputPattern: isNumber ? /^([1-9]\d*|[0]{1,1})$/ : /^[\s\S]*.*[^\s][\s\S]*$/,
        inputErrorMessage: isNumber ? '只能输入数字' : '内容不能为空',
        inputValue: inputValue
      })
      return valueText
    },
    isNotEmpty(obj) {
      if (obj instanceof Array) {
        return obj && obj.length > 0
      }
      if (typeof obj === 'string') {
        return obj && obj.trim().length > 0
      }
      if (typeof obj === 'number') {
        return obj >= 0
      }
      if (typeof obj === 'object') {
        const str = JSON.stringify(obj)
        return str !== '{}' && str !== 'null'
      }
      return !!obj // 如果obj为数值型且值为0, 返回false
    },
  }
})
