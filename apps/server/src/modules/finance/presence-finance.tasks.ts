import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PresenceLedgerService } from './presence-ledger.service'

/**
 * 在场财务自动关账。
 *
 * 每天 00:10（北京时间）补齐并关闭所有早于当前月的台账月份，
 * 同时刷新当前月。首次运行会把历史月份一次性补关。
 */
@Injectable()
export class PresenceFinanceTasks {
  private readonly logger = new Logger(PresenceFinanceTasks.name)

  constructor(private readonly ledger: PresenceLedgerService) {}

  @Cron('10 0 * * *', { timeZone: 'Asia/Shanghai' })
  async autoClose(): Promise<void> {
    try {
      const result = await this.ledger.autoCloseDueMonths()
      if (result.closed.length) {
        this.logger.log(
          `在场财务自动关账完成：${result.closed.join('、')}；当前月 ${result.refreshed} 已刷新`,
        )
      }
    } catch (err) {
      this.logger.error(`在场财务自动关账失败：${(err as Error).message}`, (err as Error).stack)
    }
  }
}
