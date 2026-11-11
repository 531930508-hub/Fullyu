import { Injectable, Logger } from '@nestjs/common'

/**
 * 告警出口：把「必须有人看」的事件推到群机器人。
 *
 * 为什么需要：2026-11-10 的候补退款无限重试刷了 48 小时，日志里每天上千条 ERROR，
 * 但没有任何人被告知——因为日志只有人主动去看才有用。定时任务的失败必须能主动出圈。
 *
 * 配置：ALERT_WEBHOOK_URL（群机器人地址）。未配置时降级为只打日志，不影响业务流程。
 * ALERT_WEBHOOK_TYPE：wecom（默认，企业微信）| dingtalk | feishu
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger('AlertService')
  private readonly webhook = (process.env.ALERT_WEBHOOK_URL || '').trim()
  private readonly type = (process.env.ALERT_WEBHOOK_TYPE || 'wecom').trim().toLowerCase()
  /** 同一标题的最短提醒间隔，避免同一个死循环把群刷爆（这个错误本身就是刷屏引发的） */
  private readonly minIntervalMs = 10 * 60 * 1000
  private readonly sentAt = new Map<string, number>()

  get enabled(): boolean {
    return !!this.webhook
  }

  /**
   * 发送告警。永不抛错、永不阻塞调用方：告警通道坏了不能反过来影响业务。
   * @param title 去重键，同一 title 10 分钟内只推一次
   * @param detail 明细（订单号、金额、笔数等），排查时第一眼要看的信息
   */
  async notify(title: string, detail: string): Promise<void> {
    const last = this.sentAt.get(title) ?? 0
    if (Date.now() - last < this.minIntervalMs) return
    this.sentAt.set(title, Date.now())

    const text = `【Full愈·在场】${title}\n${detail}\n时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
    if (!this.enabled) {
      this.logger.warn(`未配置 ALERT_WEBHOOK_URL，告警仅落日志：${title} | ${detail}`)
      return
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      await fetch(this.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildPayload(text)),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer))
    } catch (e) {
      // 告警发送失败只记一条日志，不能因为告警挂了把业务逻辑带崩
      this.logger.warn(`告警发送失败：${(e as Error)?.message ?? String(e)}`)
    }
  }

  private buildPayload(text: string) {
    if (this.type === 'feishu') {
      return { msg_type: 'text', content: { text } }
    }
    // 企业微信与钉钉都接受 msgtype=text；钉钉额外要求 at 字段才不报参数错误
    return {
      msgtype: 'text',
      text: { content: text },
      at: { isAtAll: false },
    }
  }
}