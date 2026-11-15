import { Controller, Get, Put, Body, UseGuards, Request, UnauthorizedException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { UserService } from './user.service'

@ApiTags('用户')
@Controller('user')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @ApiOperation({ summary: '获取用户个人信息' })
  async getProfile(@Request() req: any) {
    const profile = await this.userService.findById(req.user.userId)
    // 这个接口绝不下发 data:null：客户端只会把它当成「资料加载失败」，重试也永远拿不到。
    if (!profile) throw new UnauthorizedException('登录状态已失效，请重新登录')
    return profile
  }

  @Put('profile')
  @ApiOperation({ summary: '更新用户信息' })
  async updateProfile(
    @Request() req: any,
    @Body()
    body: {
      nickname?: string
      avatar?: string
      language?: string
      gender?: number | null
      birthday?: string | null
    },
  ) {
    return this.userService.updateProfile(req.user.userId, body)
  }

  @Get('points')
  @ApiOperation({ summary: '获取积分余额' })
  async getPoints(@Request() req: any) {
    const balance = await this.userService.getPointsBalance(req.user.userId)
    return { balance }
  }

  @Get('points/history')
  @ApiOperation({ summary: '获取积分明细' })
  async getPointsHistory(@Request() req: any) {
    return this.userService.getPointsHistory(req.user.userId, 1, 20)
  }
}
