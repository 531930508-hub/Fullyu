/** 模块自描述：壳只认这个接口，不认任何模块内部文件。 */
import type { RouteRecordSingleView } from 'vue-router'

export interface ConsoleRouteMeta extends Record<PropertyKey, unknown> {
  /** 页面标题 */
  title: string
  /** 侧栏分组；不填则该路由不进菜单（如详情页） */
  group?: string
  /** 所需权限码；数组表示任一命中 */
  perm?: string | string[]
  /** 需要全部命中（配合 perm 数组使用） */
  permAll?: boolean
}

export interface ConsoleRoute {
  path: string
  name: string
  component: NonNullable<RouteRecordSingleView['component']>
  meta: ConsoleRouteMeta
}

export interface PermissionDecl {
  code: string
  name: string
}

export interface ModuleManifest {
  id: string
  name: string
  /** 侧栏模块顺序 */
  order: number
  routes: ConsoleRoute[]
  permissions: PermissionDecl[]
}
