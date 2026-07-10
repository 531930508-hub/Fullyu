import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Core from '@alicloud/pop-core'

/**
 * 阿里云短信服务封装（关键兜底通知/验证码）。
 * 未配置 AccessKey 时静默跳过，不阻断主流程。
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('SmsService')
  private _client?: Core

  constructor(private readonly config: ConfigService) {}

  private get client(): Core | null {
    const accessKeyId = this.config.get<string>('ALIYUN_SMS_ACCESS_KEY_ID')
    const accessKeySecret = this.config.get<string>('ALIYUN_SMS_ACCESS_KEY_SECRET')
    if (!accessKeyId || !accessKeySecret) return null
    if (!this._client) {
      this._client = new Core({
        accessKeyId,
        accessKeySecret,
        endpoint: 'https://dysmsapi.aliyuncs.com',
        apiVersion: '2017-05-25',
      })
    }
    return this._client
  }

  /**
   * 发送短信。
   * @param phone 手机号
   * @param templateCode 模板 CODE
   * @param params 模板参数对象
   */
  async send(phone: string, templateCode: string, params: Record<string, string>): Promise<boolean> {
    const client = this.client
    if (!client) {
      this.logger.warn('短信服务未配置，跳过发送')
      return false
    }
    const signName = this.config.get<string>('ALIYUN_SMS_SIGN_NAME', '')
    try {
      const res: any = await client.request(
        'SendSms',
        {
          PhoneNumbers: phone,
          SignName: signName,
          TemplateCode: templateCode,
          TemplateParam: JSON.stringify(params),
        },
        { method: 'POST' },
      )
      if (res.Code !== 'OK') {
        this.logger.warn(`短信发送失败: ${res.Code} ${res.Message}`)
        return false
      }
      return true
    } catch (e) {
      this.logger.warn(`短信发送异常: ${(e as Error).message}`)
      return false
    }
  }
}
