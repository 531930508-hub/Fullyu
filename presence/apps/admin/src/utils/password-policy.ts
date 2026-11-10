import {
  DEFAULT_PASSWORD_POLICY,
  checkPassword,
  passwordHint,
  type PasswordPolicy,
} from '@fullyu/shared'
import { getPasswordPolicy } from '@/api/auth'

/**
 * 前端侧的密码策略缓存。
 *
 * 规则本身由 @fullyu/shared 定义，前端只负责把后端当前生效的配置拉下来，
 * 保证表单校验文案和后端拒绝的理由完全一致。拉取失败时退回默认策略，
 * 最终仍以后端校验为准，不会因为一次网络抖动就把用户挡在门外。
 */
let cached: PasswordPolicy = { ...DEFAULT_PASSWORD_POLICY }
let loading: Promise<PasswordPolicy> | null = null

/** 同步取当前已知策略（未拉取过时是默认值） */
export function currentPasswordPolicy(): PasswordPolicy {
  return cached
}

/** 拉取一次并缓存；并发调用共用同一个请求 */
export function loadPasswordPolicy(): Promise<PasswordPolicy> {
  if (loading) return loading
  loading = getPasswordPolicy()
    .then((data) => {
      if (data) cached = { ...DEFAULT_PASSWORD_POLICY, ...data }
      return cached
    })
    .catch(() => cached)
    .finally(() => {
      loading = null
    })
  return loading
}

/** 按当前策略校验，返回错误文案或 null */
export function validatePassword(password: string): string | null {
  return checkPassword(password, cached)
}

/** 当前策略对应的输入框提示 */
export function currentPasswordHint(): string {
  return passwordHint(cached)
}
