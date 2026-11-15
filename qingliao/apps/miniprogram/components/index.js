import EmptyData from './empty-data.vue'

// 全局组件注册函数
const install = (app) => {
  // 注册Empty组件为全局组件
  app.component('EmptyData', EmptyData)
}

// 支持按需引入
export { EmptyData }

// 支持全局引入
export default {
  install
}