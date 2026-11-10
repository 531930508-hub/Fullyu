/**
 * 密码安全策略（前后端共用一份规则）
 *
 * 后端从环境变量读出策略，通过 GET /auth/password-policy 暴露给前端；
 * 两边都调用这里的 checkPassword，规则只有一处定义，不会出现
 * 「前端放过、后端拒绝」或反之的错位。
 *
 * 测试阶段把 PASSWORD_POLICY_ENABLED 设为 false 即可整体关闭：
 * 不限长度、不校验字符构成、也不再强制首次登录改密。
 */

export interface PasswordPolicy {
  /** 总开关。关闭后下面所有规则都不生效（仍然不允许空密码） */
  enabled: boolean
  /** 最小长度 */
  minLength: number
  /** 必须含字母 */
  requireLetter: boolean
  /** 必须含数字 */
  requireNumber: boolean
  /** 必须含符号 */
  requireSymbol: boolean
  /** 新账号首次登录、以及管理员代改密码后，是否强制本人修改密码 */
  forceChangeOnFirstLogin: boolean
}

/** 策略默认值：与历史行为保持一致（6 位、无字符构成要求、首次登录要改密） */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  enabled: true,
  minLength: 6,
  requireLetter: false,
  requireNumber: false,
  requireSymbol: false,
  forceChangeOnFirstLogin: true,
}

/** 策略全关时也要守住的底线：密码不能为空 */
const EMPTY_MESSAGE = '请输入新密码'

/**
 * 校验密码。返回第一条不满足的规则文案，全部通过返回 null。
 * 返回文案而不是布尔，是为了让前端能直接把原因显示在输入框下面。
 */
export function checkPassword(password: string, policy: PasswordPolicy): string | null {
  const value = password ?? ''
  if (!value) return EMPTY_MESSAGE
  if (!policy.enabled) return null

  if (policy.minLength > 0 && value.length < policy.minLength) {
    return `密码至少 ${policy.minLength} 位`
  }
  if (policy.requireLetter && !/[A-Za-z]/.test(value)) return '密码必须包含字母'
  if (policy.requireNumber && !/\d/.test(value)) return '密码必须包含数字'
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(value)) return '密码必须包含符号'
  return null
}

/** 输入框的提示文案，如「至少 6 位，需含字母、数字」 */
export function passwordHint(policy: PasswordPolicy): string {
  if (!policy.enabled) return '测试阶段未启用密码强度校验'
  const parts: string[] = []
  if (policy.minLength > 0) parts.push(`至少 ${policy.minLength} 位`)
  const chars: string[] = []
  if (policy.requireLetter) chars.push('字母')
  if (policy.requireNumber) chars.push('数字')
  if (policy.requireSymbol) chars.push('符号')
  if (chars.length) parts.push(`需含${chars.join('、')}`)
  return parts.join('，') || '无强度要求'
}
