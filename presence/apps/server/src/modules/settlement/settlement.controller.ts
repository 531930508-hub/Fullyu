import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { SettlementService } from './settlement.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('结算')
@Controller('settlements')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Get()
  @AdminAuth('settlement:view')
  @ApiOperation({ summary: '结算列表' })
  async list(@Query('trainerId') trainerId?: string, @Query('courseId') courseId?: string) {
    return this.settlementService.list({ trainerId, courseId })
  }

  @Post()
  @AdminAuth('settlement:create')
  @ApiOperation({ summary: '生成课程结算' })
  async settle(@Body() body: { courseId: string; hours: number; rate?: number }) {
    return this.settlementService.settle(body)
  }

  @Put(':id/adjust')
  @AdminAuth('settlement:create')
  @ApiOperation({ summary: '人工调整结算' })
  async adjust(@Param('id') id: string, @Body() body: { adjustedAmount: number; adjustNote: string }) {
    return this.settlementService.adjust(id, body)
  }

  @Post('batch-adjust')
  @AdminAuth('settlement:create')
  @ApiOperation({ summary: '批量调整结算' })
  async batchAdjust(@Body() body: { items: Array<{ id: string; adjustedAmount: number; adjustNote: string }> }) {
    return this.settlementService.batchAdjust(body.items)
  }
}
