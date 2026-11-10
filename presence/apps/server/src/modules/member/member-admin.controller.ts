import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MemberService } from './member.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('会员卡（后台）')
@Controller('member-admin')
export class MemberAdminController {
  constructor(private readonly memberService: MemberService) {}

  // ===== 会员卡商品 =====

  @Get('products')
  @AdminAuth('membercard:view')
  @ApiOperation({ summary: '会员卡商品列表（全部状态）' })
  async products() {
    return this.memberService.adminListProducts()
  }

  @Post('products')
  @AdminAuth('membercard:create')
  @ApiOperation({ summary: '创建会员卡商品' })
  async createProduct(@Body() body: any) {
    return this.memberService.createProduct(body)
  }

  @Put('products/:id')
  @AdminAuth('membercard:update')
  @ApiOperation({ summary: '更新会员卡商品' })
  async updateProduct(@Param('id') id: string, @Body() body: any) {
    return this.memberService.updateProduct(id, body)
  }

  @Post('products/:id/status')
  @AdminAuth('membercard:update')
  @ApiOperation({ summary: '上架/下架会员卡商品' })
  async setProductStatus(
    @Param('id') id: string,
    @Body() body: { status: 'ON_SHELF' | 'OFF_SHELF' },
  ) {
    return this.memberService.setProductStatus(id, body.status)
  }

  // ===== 会员卡实例 =====

  @Get('cards')
  @AdminAuth('membercard:view')
  @ApiOperation({ summary: '会员卡列表（后台）' })
  async cards(@Query('userId') userId?: string, @Query('status') status?: string) {
    return this.memberService.adminListCards({ userId, status })
  }

  @Post('cards/:id/freeze')
  @AdminAuth('membercard:update')
  @ApiOperation({ summary: '冻结会员卡' })
  async freeze(@Param('id') id: string) {
    return this.memberService.freeze(id)
  }

  @Post('cards/:id/unfreeze')
  @AdminAuth('membercard:update')
  @ApiOperation({ summary: '解冻会员卡' })
  async unfreeze(@Param('id') id: string) {
    return this.memberService.unfreeze(id)
  }
}
