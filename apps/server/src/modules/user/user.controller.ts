import { Controller, Get, Put, Body, UseGuards, Request } from '@nestjs/common'
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
    return this.userService.findById(req.user.userId)
  }

  @Put('profile')
  @ApiOperation({ summary: '更新用户信息' })
  async updateProfile(
    @Request() req: any,
    @Body() body: { nickname?: string; avatar?: string; language?: string },
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
