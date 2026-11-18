import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { getManifests } from '@/modules/registry'
import { allowed, firstAllowedPath } from '@/shell/menu'
import { useSessionStore } from '@/shell/session'

const manifests = getManifests()

/** 路由由模块 manifest 生成，壳里不写业务路由。 */
const moduleRoutes: RouteRecordRaw[] = manifests.flatMap((manifest) =>
  manifest.routes.map(
    (route): RouteRecordRaw => ({
      path: route.path,
      name: route.name,
      component: route.component,
      meta: route.meta
    })
  )
)

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/shell/views/LoginView.vue'),
      meta: { title: '登录', public: true }
    },
    {
      path: '/403',
      name: 'Forbidden',
      component: () => import('@/shell/views/ForbiddenView.vue'),
      meta: { title: '无访问权限' }
    },
    {
      path: '/',
      component: () => import('@/shell/layout/MainLayout.vue'),
      children: moduleRoutes
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach((to) => {
  const session = useSessionStore()
  const can = (perm: string) => session.can(perm)
  const canAll = (list: string[]) => session.canAll(list)

  if (to.meta.public) {
    return session.isAuthed ? firstAllowedPath(manifests, can, canAll) : true
  }
  if (!session.isAuthed) {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.path === '/') {
    return firstAllowedPath(manifests, can, canAll)
  }
  const hit = manifests
    .flatMap((manifest) => manifest.routes)
    .find((route) => to.path === `/${route.path}` || to.path.startsWith(`/${route.path}/`))
  if (hit && !allowed(hit, can, canAll)) return '/403'
  return true
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || ''
  document.title = title ? `${title} · Full愈 中后台` : 'Full愈 中后台'
})

export default router
