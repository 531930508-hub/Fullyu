import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma.service'
import { WechatService } from '../wechat/wechat.service'

/**
 * 订阅消息通知服务：
 * 统一封装模板 id 读取、openid 解析与下发，失败不阻断主业务流程。
 * 模板字段需与小程序后台申请的模板保持一致（thing/date/amount 等）。
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService')

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly wechat: WechatService,
  ) {}

  private async getOpenid(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { openId: true },
    })
    return user?.openId ?? null
  }

  private async send(
    userId: string,
    templateKey: string,
    data: Record<string, { value: string }>,
    page?: string,
  ) {
    const templateId = this.config.get<string>(templateKey)
    if (!templateId) {
      this.logger.warn(`模板未配置: ${templateKey}，跳过下发`)
      return
    }
    const openid = await this.getOpenid(userId)
    if (!openid) {
      this.logger.warn(`用户 ${userId} 无 openid，跳过订阅消息`)
      return
    }
    try {
      await this.wechat.sendSubscribeMessage({ openid, templateId, data, page })
    } catch (e) {
      this.logger.warn(`订阅消息下发异常: ${(e as Error).message}`)
    }
  }

  /** 开课提醒 */
  async courseReminder(userId: string, params: { courseName: string; startTime: string; venue: string; courseId: string }) {
    await this.send(
      userId,
      'WECHAT_TMPL_COURSE_REMINDER',
      {
        thing1: { value: params.courseName },
        time2: { value: params.startTime },
        thing3: { value: params.venue },
      },
      `/pages/course/detail?id=${params.courseId}`,
    )
  }

  /** 候补递补成功提醒 */
  async waitlistPromoted(userId: string, params: { courseName: string; orderId: string; deadline: string }) {
    await this.send(
      userId,
      'WECHAT_TMPL_WAITLIST_PROMOTED',
      {
        thing1: { value: params.courseName },
        thing2: { value: '候补递补成功，请及时确认' },
        time3: { value: params.deadline },
      },
      `/pages/order/detail?id=${params.orderId}`,
    )
  }

  /** 支付成功通知 */
  async paymentSuccess(userId: string, params: { courseName: string; amount: string; orderNo: string; orderId: string }) {
    await this.send(
      userId,
      'WECHAT_TMPL_PAYMENT_SUCCESS',
      {
        character_string1: { value: params.orderNo },
        thing2: { value: params.courseName },
        amount3: { value: params.amount },
      },
      `/pages/order/detail?id=${params.orderId}`,
    )
  }

  /** 退款到账通知 */
  async refundSuccess(userId: string, params: { courseName: string; amount: string; orderId: string }) {
    await this.send(
      userId,
      'WECHAT_TMPL_REFUND_SUCCESS',
      {
        thing1: { value: params.courseName },
        amount2: { value: params.amount },
        phrase3: { value: '退款成功' },
      },
      `/pages/order/detail?id=${params.orderId}`,
    )
  }
}
