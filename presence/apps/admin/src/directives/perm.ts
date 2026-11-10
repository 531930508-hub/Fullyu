/**
 * 权限指令
 *
 * v-perm="'scm:po:create'"                 单个权限码
 * v-perm="['scm:po:create','scm:po:update']"  任一命中即可
 * v-perm:all="['a','b']"                   必须全部命中
 * v-perm.disable="'scm:po:create'"         无权限时禁用而非移除
 *
 * 无权限时默认从 DOM 移除元素；.disable 修饰符改为置灰禁用，
 * 适合「让用户知道有这个操作但不能点」的场景。
 */
import type { App, Directive, DirectiveBinding } from 'vue'
import { useAuthStore } from '@/stores/auth'

function allowed(binding: DirectiveBinding): boolean {
  const auth = useAuthStore()
  const value = binding.value
  const codes = Array.isArray(value) ? value : [value]
  const valid = codes.filter((c): c is string => typeof c === 'string' && c.length > 0)
  if (!valid.length) return true
  return binding.arg === 'all' ? auth.hasAll(valid) : auth.hasAny(valid)
}

function apply(el: HTMLElement, binding: DirectiveBinding) {
  if (allowed(binding)) {
    if (binding.modifiers.disable) {
      el.removeAttribute('disabled')
      el.classList.remove('perm-disabled')
    }
    return
  }
  if (binding.modifiers.disable) {
    el.setAttribute('disabled', 'disabled')
    el.classList.add('perm-disabled')
    return
  }
  el.remove()
}

export const permDirective: Directive = {
  mounted: apply,
  updated: apply,
}

export function setupPermDirective(app: App) {
  app.directive('perm', permDirective)
}
