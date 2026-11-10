import { Controller, Post, Get, Param, Req, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { WaitlistService } from './waitlist.service'

@ApiTags('候补')
@Controller('waitlist')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get('quote/:courseId')
  @ApiOperation({ summary: '候补询价（队列类型/位置/锁定价）' })
  async quote(@Req() req: any, @Param('courseId') courseId: string) {
    return this.waitlistService.quote(courseId, req.user.userId)
  }

  @Post('join/:courseId')
  @ApiOperation({ summary: '加入候补（生成待支付候补订单）' })
  async join(@Req() req: any, @Param('courseId') courseId: string) {
    return this.waitlistService.join(courseId, req.user.userId)
  }

  @Get('mine')
  @ApiOperation({ summary: '我的候补列表' })
  async mine(@Req() req: any) {
    return this.waitlistService.findByUser(req.user.userId)
  }
}
