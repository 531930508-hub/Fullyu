import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { TrainerService } from './trainer.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('导师')
@Controller('trainers')
export class TrainerController {
  constructor(private readonly trainerService: TrainerService) {}

  @Get()
  @ApiOperation({ summary: '导师列表' })
  async list(@Query('keyword') keyword?: string, @Query('level') level?: number, @Query('status') status?: string) {
    return this.trainerService.list({ keyword, level, status })
  }

  @Get('me/workspace')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '导师工作台' })
  async workspace(@Request() req: any) {
    return this.trainerService.workspace(req.user.userId)
  }

  @Get(':id')
  @ApiOperation({ summary: '导师详情' })
  async detail(@Param('id') id: string) {
    return this.trainerService.detail(id)
  }

  @Post()
  @AdminAuth('trainer:create')
  @ApiOperation({ summary: '创建导师档案' })
  async create(@Body() body: any) {
    return this.trainerService.create(body)
  }

  @Put(':id')
  @AdminAuth('trainer:update')
  @ApiOperation({ summary: '更新导师档案' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.trainerService.update(id, body)
  }

  @Post(':id/seeds')
  @AdminAuth('trainer:update')
  @ApiOperation({ summary: '调整导师积分' })
  async adjustSeeds(
    @Param('id') id: string,
    @Body() body: { amount: number; reason: string },
  ) {
    return this.trainerService.adjustSeeds(id, body.amount, body.reason)
  }
}
