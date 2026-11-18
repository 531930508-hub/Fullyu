/**
 * 菜单与权限的装配逻辑。
 *
 * 菜单完全由各模块 manifest 推导，壳里不写死任何业务条目；
 * 新增模块只需要在 registry 里注册，菜单、路由、权限声明同时生效。
 */
import type { ConsoleRoute, ModuleManifest } from './types'

export interface MenuItem {
  key: string
  label: string
  path: string
}

export interface MenuGroup {
  key: string
  label: string
  items: MenuItem[]
}

type CanFn = (perm: string) => boolean

export function allowed(route: ConsoleRoute, can: CanFn, canAll: (list: string[]) => boolean): boolean {
  const perm = route.meta.perm
  if (!perm) return true
  const list = Array.isArray(perm) ? perm : [perm]
  return route.meta.permAll ? canAll(list) : list.some(can)
}

export function buildMenu(manifests: ModuleManifest[], can: CanFn, canAll: (list: string[]) => boolean): MenuGroup[] {
  const groups: MenuGroup[] = []
  const index = new Map<string, MenuGroup>()
  for (const manifest of manifests) {
    for (const route of manifest.routes) {
      if (!route.meta.group) continue
      if (!allowed(route, can, canAll)) continue
      let group = index.get(route.meta.group)
      if (!group) {
        group = { key: route.meta.group, label: route.meta.group, items: [] }
        index.set(route.meta.group, group)
        groups.push(group)
      }
      group.items.push({ key: route.name, label: route.meta.title, path: `/${route.path}` })
    }
  }
  return groups.filter((group) => group.items.length > 0)
}

export function firstAllowedPath(manifests: ModuleManifest[], can: CanFn, canAll: (list: string[]) => boolean): string {
  for (const manifest of manifests) {
    for (const route of manifest.routes) {
      if (allowed(route, can, canAll)) return `/${route.path}`
    }
  }
  return '/403'
}
