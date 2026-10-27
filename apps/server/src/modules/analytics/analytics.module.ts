import { Module } from '@nestjs/common'
import { AnalyticsService } from './analytics.service'
import { AnalyticsController } from './analytics.controller'
import { TodoModule } from '../todo/todo.module'

/** 首页工作台的待办直接复用待办中心的聚合与权限裁剪，避免再写一份又走差 */
@Module({
  imports: [TodoModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
