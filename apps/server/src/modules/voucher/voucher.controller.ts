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

  @Get()
  @AdminAuth('voucher:view')
  @ApiOperation({ summary: '代金券列表（后台）' })
  async list(@Query('userId') userId?: string, @Query('status') status?: string) {
    return this.voucherService.adminList({ userId, status })
  }

  @Post('grant')
  @AdminAuth('voucher:create')
  @ApiOperation({ summary: '发放代金券' })
  async grant(@Body() body: any) {
    return this.voucherService.grant(body)
  }

  @Post(':id/revoke')
  @AdminAuth('voucher:update')
  @ApiOperation({ summary: '作废代金券' })
  async revoke(@Param('id') id: string) {
    return this.voucherService.revoke(id)
  }
}
