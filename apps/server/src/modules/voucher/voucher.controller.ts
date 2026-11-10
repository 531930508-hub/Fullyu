import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { VoucherService } from './voucher.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('代金券')
@Controller('vouchers')
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的代金券' })
  async mine(@Request() req: any, @Query('usable') usable?: string) {
    return this.voucherService.myVouchers(req.user.userId, usable === 'true')
  }

  @Post('redeem')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '兑换代金券（输入兑换码）' })
  async redeem(@Request() req: any, @Body() body: { code?: string }) {
    return this.voucherService.redeem(req.user.userId, body?.code)
  }

  @Get('batches')
  @AdminAuth('voucher:view')
  @ApiOperation({ summary: '兑换码批次列表（后台）' })
  async batches() {
    return this.voucherService.batches()
  }

  @Get('batches/:batchNo')
  @AdminAuth('voucher:view')
  @ApiOperation({ summary: '兑换码批次明细（后台）' })
  async batchDetail(@Param('batchNo') batchNo: string) {
    return this.voucherService.batchDetail(batchNo)
  }

  @Get()
  @AdminAuth('voucher:view')
  @ApiOperation({ summary: '代金券列表（后台）' })
  async list(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('batchNo') batchNo?: string,
  ) {
    return this.voucherService.adminList({ userId, status, batchNo })
  }

  @Post('grant')
  @AdminAuth('voucher:create')
  @ApiOperation({ summary: '发放代金券' })
  async grant(@Request() req: any, @Body() body: any) {
    return this.voucherService.grant(body, req.user.adminId)
  }

  @Post('batch')
  @AdminAuth('voucher:create')
  @ApiOperation({ summary: '兑换码批量发券（每批 N 张，各带唯一兑换码）' })
  async grantBatch(@Request() req: any, @Body() body: any) {
    return this.voucherService.grantBatch(body, req.user.adminId)
  }

  @Post(':id/revoke')
  @AdminAuth('voucher:update')
  @ApiOperation({ summary: '作废代金券' })
  async revoke(@Param('id') id: string) {
    return this.voucherService.revoke(id)
  }
}
