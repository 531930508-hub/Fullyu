import { Global, Injectable, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DEFAULT_PASSWORD_POLICY,
  checkPassword,
  passwordHint,
  type PasswordPolicy,
} from '@fullyu/shared'
import { BusinessException } from './exceptions/business.exception'

/**
 * 密码策略的唯一读取入口。
 *
 * 所有规则来自环境变量，改配置不用改代码；校验逻辑复用 @fullyu/shared 的
 * checkPassword，与前端表单同一份规则。测试阶段在 .env.local 里设
 * PASSWORD_POLICY_ENABLED=false 就能整体关掉强度校验与强制改密。
 */
@Injectable()
export class PasswordPolicyService {
  constructor(private readonly configService: ConfigService) {}

  /** 当前生效的策略；每次读取实时反映配置，便于改完 env 重启即生效 */
  get(): PasswordPolicy {
    return {
      enabled: this.bool('PASSWORD_POLICY_ENABLED', DEFAULT_PASSWORD_POLICY.enabled),
      minLength: this.int('PASSWORD_MIN_LENGTH', DEFAULT_PASSWORD_POLICY.minLength),
      requireLetter: this.bool('PASSWORD_REQUIRE_LETTER', DEFAULT_PASSWORD_POLICY.requireLetter),
      requireNumber: this.bool('PASSWORD_REQUIRE_NUMBER', DEFAULT_PASSWORD_POLICY.requireNumber),
      requireSymbol: this.bool('PASSWORD_REQUIRE_SYMBOL', DEFAULT_PASSWORD_POLICY.requireSymbol),
      forceChangeOnFirstLogin: this.bool(
        'PASSWORD_FORCE_CHANGE_ON_FIRST_LOGIN',
        DEFAULT_PASSWORD_POLICY.forceChangeOnFirstLogin,
      ),
    }
  }

  /** 不合规就抛业务异常，错误文案直接来自共享规则，前后端口径一致 */
  assertValid(password: string) {
    const reason = checkPassword(password, this.get())
    if (reason) throw new BusinessException(reason, 4002)
  }

  /**
   * 是否要求本人下次登录改密。
   * 策略关闭时恒为 false —— 测试阶段谁都不该被改密弹窗挡住。
   */
  shouldForceChange(): boolean {
    const policy = this.get()
    return policy.enabled && policy.forceChangeOnFirstLogin
  }

  /** 给前端展示的策略（附带一句人话提示） */
  describe() {
    const policy = this.get()
    return { ...policy, hint: passwordHint(policy) }
  }

  private bool(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string>(key)
    if (raw === undefined || raw === null || raw === '') return fallback
    return String(raw).toLowerCase() === 'true'
  }

  private int(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key)
    const parsed = Number.parseInt(String(raw ?? ''), 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }
}

/** 认证与账号管理两个模块都要用，做成全局模块省去各自 import */
@Global()
@Module({
  providers: [PasswordPolicyService],
  exports: [PasswordPolicyService],
})
export class PasswordPolicyModule {}
