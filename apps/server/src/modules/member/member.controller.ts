import { Controller, Get, Post, Body, UseGuards, Request, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { MemberService } from './member.service'

@ApiTags('会员卡')
@Controller('member')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get('products')
  @ApiOperation({ summary: '会员卡商品列表' })
  async products() {
    return this.memberService.listProducts()
  }

  @Get('cards')
  @ApiOperation({ summary: '我的会员卡' })
  async myCards(@Request() req: any) {
    return this.memberService.myCards(req.user.userId)
  }

  @Get('active')
  @ApiOperation({ summary: '我的当前有效会员卡' })
  async active(@Request() req: any, @Query('stats') stats?: string) {
    // stats=1 时返回本期用卡节省（分）与报课次数，仅供畅练卡页做临期复购提示
    return this.memberService.activeCard(req.user.userId, { withStats: stats === '1' })
  }

  @Post('purchase')
  @ApiOperation({ summary: '购买/续费会员卡（生成待支付订单，首次开卡需上传个人照片）' })
  async purchase(@Request() req: any, @Body() body: { productId: string; photo?: string }) {
    return this.memberService.purchase(req.user.userId, body.productId, body.photo)
  }
}
