import router from './router'
import store from './store'
import NProgress from 'nprogress' // Progress 进度条
import 'nprogress/nprogress.css'// Progress 进度条样式
import { Message } from 'element-ui'
import { getToken } from '@/utils/auth' // 验权

const whiteList = ['/login'] // 不重定向白名单
router.beforeEach((to, from, next) => {
  NProgress.start()
  if (getToken()) {
    if (to.path === '/login') {
      next({ path: '/' })
      NProgress.done() // if current page is dashboard will not trigger	afterEach hook, so manually handle it
    } else {
      if (store.getters.roles.length === 0) {
        store.dispatch('GetInfo').then(res => { // 拉取用户信息
          let menus=res.data.menus;
          let username=res.data.username;
          store.dispatch('GenerateRoutes', { menus,username,roles: res.data.roles }).then(() => { // 生成可访问的路由表
            router.addRoutes(store.getters.addRouters); // 动态添加可访问路由表
            next({ ...to, replace: true })
          }).catch((err) => {
            store.dispatch('FedLogOut').then(() => {
              Message.error((err && err.message) || '权限加载失败，请重新登录')
              next({ path: '/login' })
            })
          })
        }).catch((err) => {
          store.dispatch('FedLogOut').then(() => {
            Message.error(err || 'Verification failed, please login again')
            next({ path: '/login' })
          })
        })
      } else {
        next()
      }
    }
  } else {
    if (whiteList.indexOf(to.path) !== -1) {
      next()
    } else {
      next('/login')
      NProgress.done()
    }
  }
})

router.afterEach(() => {
  NProgress.done() // 结束Progress
})

// 发版后旧 chunk 被替换时，刷新一次拿到新资源，避免点击菜单出现空白页
router.onError((error) => {
  const pattern = /Loading (CSS )?chunk .* failed/
  if (pattern.test(error.message || '')) {
    const key = 'chunk-reload'
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      window.location.reload()
    }
  }
})

router.afterEach(() => {
  sessionStorage.removeItem('chunk-reload')
})
