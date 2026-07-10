import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AnalyticsService } from './analytics.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('数据分析')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @AdminAuth('analytics:view')
  @ApiOperation({ summary: '仪表盘概览' })
  async overview() {
    return this.analyticsService.overview()
  }

  @Get('revenue-trend')
  @AdminAuth('analytics:view')
  @ApiOperation({ summary: '营收趋势' })
  async revenueTrend(@Query('days') days?: number) {
    return this.analyticsService.revenueTrend(days ? Number(days) : 30)
  }
}
