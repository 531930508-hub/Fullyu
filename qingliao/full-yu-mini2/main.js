import App from './App'
import globalComponents from './components/index.js'
import cache from './utils/cache'

// #ifndef VUE3
import Vue from 'vue'

Vue.use(globalComponents)
import './uni.promisify.adaptor'
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({
  ...App
})
app.$Cache = cache
app.$mount()
// #endif

// #ifdef VUE3
import {createSSRApp} from 'vue'
import installFilter from '@/filters'

export function createApp() {
    const app = createSSRApp(App)
    // 注册全局组件
    app.use(globalComponents)
    app.config.globalProperties.$Cache = cache

    installFilter(app)
    return {
        app
    }
}

// #endif
