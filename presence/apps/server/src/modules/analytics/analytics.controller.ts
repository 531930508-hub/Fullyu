import { Controller, Get, Query, Request } from '@nestjs/common'
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

  /**
   * 首页工作台。只要登录就能调 —— 首页是所有角色的落地页，
   * 挂 analytics:view 会把没这个权限的采购、店长、店员全部拦在首页报错。
   * 数据裁剪由 service 逐块判权限完成。
   */
  @Get('workbench')
  @AdminAuth()
  @ApiOperation({ summary: '首页工作台（按权限裁剪）' })
  async workbench(@Request() req: any, @Query('date') date?: string) {
    return this.analyticsService.workbench(req.user, date)
  }

  @Get('revenue-trend')
  @AdminAuth('analytics:view')
  @ApiOperation({ summary: '营收趋势' })
  async revenueTrend(@Query('days') days?: number) {
    return this.analyticsService.revenueTrend(days ? Number(days) : 30)
  }

  @Get('charts')
  @AdminAuth('analytics:view')
  @ApiOperation({ summary: '扩展图表（课程热度/导师评分/用户增长/会员分布）' })
  async charts() {
    return this.analyticsService.charts()
  }
}
