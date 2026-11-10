import { createHash, createHmac } from 'node:crypto'
import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BusinessException } from '../exceptions/business.exception'
import { crmConfigFrom, type PresenceCrmConfig } from './crm.config'

/**
 * CRM 对外签名客户端（契约见 CRM 设计 §18）：
 * - 头：x-crm-key / x-crm-timestamp / x-crm-signature；
 * - 签名串：`timestamp\nMETHOD\n/api/...完整路径\nsha256hex(rawBody)`；
 * - 业务归属由密钥决定，客户端不发送业务标识；
 * - 本文件只做身份解析与余额读取，积分写入仍在各业务自己的链路，待阶段二切换。
 */

export interface CrmIdentity {
  localUserId: string
  phone?: string | null
  name?: string | null
  unionId?: string | null
  openId?: string | null
  gender?: number | null
  birthday?: string | null
  avatarUrl?: string | null
}

export interface CrmMember {
  memberId: string
  memberNo: string
  name: string
  balance: number
  status?: string
  created?: boolean
  bound?: boolean
}

export class CrmResponseError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`CRM 返回 ${status}`)
    this.name = 'CrmResponseError'
  }
}

export const signCrmRequest = (
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  rawBody: string,
): string => {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex')
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${method.toUpperCase()}\n${path}\n${bodyHash}`, 'utf8')
    .digest('hex')
}

const unavailable = () =>
  new BusinessException(
    '会员服务暂时不可用，请稍后重试',
    5030,
    HttpStatus.SERVICE_UNAVAILABLE,
  )

@Injectable()
export class CrmClient {
  private readonly logger = new Logger('CrmClient')
  private readonly config: PresenceCrmConfig | null

  constructor(config: ConfigService) {
    // 配置错误直接拒绝启动：不允许「看似开启、实际不可用」。
    this.config = crmConfigFrom(config)
  }

  get enabled(): boolean {
    return this.config !== null
  }

  /** 解析本地用户到 CRM 会员：同一个人跨业务复用同一会员与积分账本。 */
  async resolve(identity: CrmIdentity): Promise<CrmMember> {
    try {
      const member = await this.request<CrmMember>(
        'POST',
        '/api/external/members/resolve',
        identity,
      )
      return this.normalize(member)
    } catch (error) {
      throw this.mapError(error)
    }
  }

  /** 只读查询；尚未同步到 CRM 时返回 null，由调用方决定是否补一次 resolve。 */
  async getByLocalUser(localUserId: string): Promise<CrmMember | null> {
    try {
      const member = await this.request<CrmMember>(
        'GET',
        `/api/external/members/${encodeURIComponent(localUserId)}`,
      )
      return this.normalize(member)
    } catch (error) {
      if (error instanceof CrmResponseError && error.status === 404) return null
      throw this.mapError(error)
    }
  }

  private normalize(member: CrmMember): CrmMember {
    if (!member || typeof member.memberId !== 'string' || !Number.isFinite(member.balance)) {
      throw unavailable()
    }
    return member
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
  ): Promise<T> {
    const config = this.config
    if (!config) throw unavailable()

    const rawBody = payload === undefined ? '' : JSON.stringify(payload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = signCrmRequest(config.secret, timestamp, method, path, rawBody)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    let response: Response
    try {
      response = await fetch(`${config.baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          'x-crm-key': config.keyId,
          'x-crm-timestamp': timestamp,
          'x-crm-signature': signature,
          ...(rawBody ? { 'content-type': 'application/json' } : {}),
        },
        body: rawBody || undefined,
        signal: controller.signal,
      })
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError' ? '超时' : '网络异常'
      this.logger.warn(`会员中心${reason}：${method} ${path}`)
      throw unavailable()
    } finally {
      clearTimeout(timer)
    }

    let text: string
    try {
      text = await response.text()
    } catch {
      this.logger.warn(`会员中心响应读取失败：${method} ${path}`)
      throw unavailable()
    }
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text.slice(0, 200)
      }
    }
    if (!response.ok) throw new CrmResponseError(response.status, body)
    return body as T
  }

  /**
   * 不把 CRM 内部报错原样抛给顾客；身份冲突是唯一需要顾客感知的情况。
   */
  private mapError(error: unknown): BusinessException {
    if (error instanceof BusinessException) return error
    if (error instanceof CrmResponseError) {
      if (error.status === 409) {
        this.logger.warn('会员中心身份冲突：需要人工合并档案')
        return new BusinessException(
          '该账号在会员中心存在需要人工合并的档案，请联系客服处理',
          4090,
          HttpStatus.CONFLICT,
        )
      }
      this.logger.warn(`会员中心调用失败：HTTP ${error.status}`)
      return unavailable()
    }
    this.logger.warn(
      `会员中心调用失败：${error instanceof Error ? error.message : '未知错误'}`,
    )
    return unavailable()
  }
}
