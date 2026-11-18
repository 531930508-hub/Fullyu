import App from './App'
import globalComponents from './components/index.js'
import cache from './utils/cache'
// 两个分支都要用，放在条件编译外面
import { trackPageEnter, trackPageLeave } from './utils/tracking'

// #ifndef VUE3
import Vue from 'vue'

Vue.use(globalComponents)
import './uni.promisify.adaptor'
import { img } from './utils/imageLocale'
Vue.mixin({ methods: { img }, onShow() { trackPageEnter() }, onHide() { trackPageLeave() } })
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
import { t, syncNavTitle, localeClass } from './utils/locale'
import { img } from './utils/imageLocale'

export function createApp() {
    const app = createSSRApp(App)
    // 注册全局组件
    app.use(globalComponents)
    app.config.globalProperties.$Cache = cache
    // 全局界面翻译：模板里直接写 {{ t('中文') }}，选项式页面也可用 this.t
    app.config.globalProperties.t = t
    // 图片地址优化：模板里直接写 :src="img(url, 750)"
    app.config.globalProperties.img = img
    // 全局 mixin：导航标题跟随语言；页面停留时长埋点（静默、不阻塞）
    app.mixin({
        methods: { t, img, localeClass },
        onShow() { syncNavTitle(); trackPageEnter() },
        onHide() { trackPageLeave() },
        onUnload() { trackPageLeave() }
    })

    installFilter(app)
    return {
        app
    }
}

// #endif
