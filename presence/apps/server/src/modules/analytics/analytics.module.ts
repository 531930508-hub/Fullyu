import { Module } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'
import { AnalyticsController } from './analytics.controller'
import { ApprovalModule } from '../approval/approval.module'

/** 首页工作台的「待我审批」直接复用审批引擎的待办判定，避开再写一份又走差 */
@Module({
  imports: [ApprovalModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
