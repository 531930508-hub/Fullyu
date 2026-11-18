/**
 * 模块注册表：新增模块只改这里一行。
 * 顺序由 manifest.order 决定，不要在这里写业务的排序例外。
 */
import type { ModuleManifest } from '@/shell/types'
import crm from './crm/manifest'

const manifests: ModuleManifest[] = [crm].sort((a, b) => a.order - b.order)

export function getManifests(): ModuleManifest[] {
  return manifests
}

/** 全平台权限码清单（模块 manifest 声明的并集），供角色勾选树使用。 */
export function allPermissions() {
  return manifests.flatMap((manifest) =>
    manifest.permissions.map((permission) => ({ ...permission, module: manifest.id }))
  )
}
