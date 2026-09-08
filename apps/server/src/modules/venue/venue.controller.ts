import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { VenueService } from './venue.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('场地')
@Controller('venues')
export class VenueController {
  constructor(private readonly venueService: VenueService) {}

  @Get()
  @ApiOperation({ summary: '场地列表' })
  async list() {
    return this.venueService.list()
  }

  @Get('reservations')
  @AdminAuth('venue:view')
  @ApiOperation({ summary: '场地预约列表' })
  async listReservations(@Query('venueId') venueId?: string, @Query('date') date?: string) {
    return this.venueService.listReservations(venueId, date)
  }

  @Get('reservation-logs')
  @AdminAuth('venue:view')
  @ApiOperation({ summary: '场地预约操作日志' })
  async listReservationLogs(
    @Query('venueId') venueId?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.venueService.listReservationLogs({
      venueId,
      limit: limit ? Number(limit) : undefined,
      from,
      to,
    })
  }

  // ===== 合同管理 =====

  @Get('contracts')
  @AdminAuth('venue:view')
  @ApiOperation({ summary: '合同管理列表（默认返回所有租赁预约）' })
  async listContracts(
    @Query('contractStatus') contractStatus?: string,
    @Query('venueId') venueId?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.venueService.listContractReservations({ contractStatus, venueId, keyword })
  }

  // ===== 收款码配置 =====

  @Get('payment-qr')
  @AdminAuth('venue:view')
  @ApiOperation({ summary: '获取场地收款码配置' })
  async getQrConfig() {
    return this.venueService.getQrConfig()
  }

  @Put('payment-qr')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '更新场地收款码配置' })
  async setQrConfig(@Body() body: { alipay?: string | null; wechat?: string | null }) {
    return this.venueService.setQrConfig(body)
  }

  @Get(':id')
  @ApiOperation({ summary: '场地详情' })
  async detail(@Param('id') id: string) {
    return this.venueService.detail(id)
  }

  @Post()
  @AdminAuth('venue:create')
  @ApiOperation({ summary: '创建场地' })
  async create(@Body() body: any) {
    return this.venueService.create(body)
  }

  @Put(':id')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '更新场地' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.venueService.update(id, body)
  }

  @Delete(':id')
  @AdminAuth('venue:delete')
  @ApiOperation({ summary: '删除场地' })
  async remove(@Param('id') id: string) {
    return this.venueService.remove(id)
  }

  @Post('reservations')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '创建场地预约' })
  async createReservation(@Request() req: any, @Body() body: any) {
    return this.venueService.createReservation(body, {
      operatorId: req.user?.adminId,
      operatorName: req.user?.username,
    })
  }

  @Put('reservations/:id')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '编辑场地预约元信息（使用类型/合同状态/销售/金额等）' })
  async updateReservation(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.venueService.updateReservation(id, body, {
      operatorId: req.user?.adminId,
      operatorName: req.user?.username,
    })
  }

  @Post('reservations/:id/contract')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '上传合同（可选同步标记为已签约）' })
  async uploadContract(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { contractUrl: string; contractName?: string; markSigned?: boolean },
  ) {
    return this.venueService.uploadContract(id, body, {
      operatorId: req.user?.adminId,
      operatorName: req.user?.username,
    })
  }

  @Delete('reservations/:id')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '取消场地预约（区分租赁与课程占用）' })
  async removeReservation(@Request() req: any, @Param('id') id: string) {
    return this.venueService.removeReservation(id, {
      operatorId: req.user?.adminId,
      operatorName: req.user?.username,
    })
  }

  // ===== 收款流水 =====

  @Get('reservations/:id/payments')
  @AdminAuth('venue:view')
  @ApiOperation({ summary: '预约收款流水' })
  async listPayments(@Param('id') id: string) {
    return this.venueService.listPayments(id)
  }

  @Post('reservations/:id/payments')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '记录一笔收款' })
  async createPayment(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.venueService.createPayment(id, body, {
      operatorId: req.user?.adminId,
      operatorName: req.user?.username,
    })
  }

  @Put('payments/:paymentId/status')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '确认/取消 待确认收款' })
  async confirmPayment(
    @Request() req: any,
    @Param('paymentId') paymentId: string,
    @Body() body: { status: 'CONFIRMED' | 'CANCELLED' },
  ) {
    return this.venueService.confirmPayment(paymentId, body?.status, {
      operatorId: req.user?.adminId,
      operatorName: req.user?.username,
    })
  }
}
