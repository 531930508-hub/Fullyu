import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { brandShareTimeline, resolveBrandShareMessage } from '@/utils/share'

export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.mixin({
    // #ifdef MP-WEIXIN
    onShareAppMessage(res: any) {
      return resolveBrandShareMessage(res)
    },
    onShareTimeline() {
      return brandShareTimeline()
    },
    // #endif
  })
  return { app }
}
