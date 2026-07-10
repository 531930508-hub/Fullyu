import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisService } from '../redis.service'
import { BusinessException } from '../exceptions/business.exception'

/** code2session 返回 */
export interface WxSession {
  openid: string
  sessionKey: string
  unionid?: string
}

const ACCESS_TOKEN_CACHE_KEY = 'wechat:access_token'

/**
 * 微信小程序服务端 API 封装：
 * - access_token 获取与缓存（Redis，提前 5 分钟过期）
 * - code2Session：用登录 code 换 openid/unionid
 * - getPhoneNumber：用手机号授权 code 换手机号
 * - sendSubscribeMessage：下发订阅消息
 * 使用 Node 18+ 全局 fetch。
 */
@Injectable()
export class WechatService {
  private readonly logger = new Logger('WechatService')

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private get appId() {
    return this.config.get<string>('WECHAT_APP_ID')
  }

  private get appSecret() {
    return this.config.get<string>('WECHAT_APP_SECRET')
  }

  /** 获取（并缓存）接口调用凭证 access_token */
  async getAccessToken(): Promise<string> {
    const cached = await this.redis.get(ACCESS_TOKEN_CACHE_KEY)
    if (cached) return cached

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`
    const res = await fetch(url)
    const data: any = await res.json()
    if (!data.access_token) {
      this.logger.error(`获取 access_token 失败: ${JSON.stringify(data)}`)
      throw new BusinessException('微信 access_token 获取失败', 5001)
    }
    // 提前 5 分钟过期，避免边界失效
    await this.redis.set(
      ACCESS_TOKEN_CACHE_KEY,
      data.access_token,
      Math.max(60, (data.expires_in ?? 7200) - 300),
    )
    return data.access_token
  }

  /** 用小程序登录 code 换取 openid / session_key / unionid */
  async code2Session(code: string): Promise<WxSession> {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${this.appId}&secret=${this.appSecret}&js_code=${code}&grant_type=authorization_code`
    const res = await fetch(url)
    const data: any = await res.json()
    if (data.errcode || !data.openid) {
      this.logger.error(`code2Session 失败: ${JSON.stringify(data)}`)
      throw new BusinessException('微信登录失败，请重试', 5002)
    }
    return {
      openid: data.openid,
      sessionKey: data.session_key,
      unionid: data.unionid,
    }
  }

  /** 用手机号授权 code 换取手机号（getPhoneNumber 新版接口） */
  async getPhoneNumber(code: string): Promise<string> {
    const token = await this.getAccessToken()
    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${token}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data: any = await res.json()
    if (data.errcode !== 0 || !data.phone_info?.purePhoneNumber) {
      this.logger.error(`getPhoneNumber 失败: ${JSON.stringify(data)}`)
      throw new BusinessException('获取手机号失败，请重试', 5003)
    }
    return data.phone_info.purePhoneNumber
  }

  /** 下发订阅消息 */
  async sendSubscribeMessage(params: {
    openid: string
    templateId: string
    data: Record<string, { value: string }>
    page?: string
  }): Promise<void> {
    const token = await this.getAccessToken()
    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: params.openid,
        template_id: params.templateId,
        page: params.page,
        data: params.data,
        miniprogram_state: this.config.get('WECHAT_MP_STATE', 'formal'),
      }),
    })
    const result: any = await res.json()
    if (result.errcode !== 0) {
      // 订阅消息失败不阻断主流程，仅记录
      this.logger.warn(`订阅消息下发失败: ${JSON.stringify(result)}`)
    }
  }
}
