import { Controller, Get, Post, Body, Query } from '@nestjs/common'
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
  async list(@Query('trainerId') trainerId?: string) {
    return this.settlementService.list({ trainerId })
  }

  @Post()
  @AdminAuth('settlement:create')
  @ApiOperation({ summary: '生成课程结算' })
  async settle(@Body() body: { courseId: string; hours: number; rate?: number }) {
    return this.settlementService.settle(body)
  }
}
