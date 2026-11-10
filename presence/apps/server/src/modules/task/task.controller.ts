import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { TaskService } from './task.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('任务')
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  @AdminAuth('task:view')
  @ApiOperation({ summary: '任务列表（后台）' })
  async list(@Query('status') status?: string) {
    return this.taskService.adminList(status)
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '导师可见任务列表' })
  async mine(@Request() req: any) {
    return this.taskService.listForTrainer(req.user.trainerId ?? req.user.userId)
  }

  @Post()
  @AdminAuth('task:create')
  @ApiOperation({ summary: '发布任务' })
  async create(@Body() body: any) {
    return this.taskService.create(body)
  }

  @Put(':id')
  @AdminAuth('task:update')
  @ApiOperation({ summary: '更新任务' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.taskService.update(id, body)
  }

  @Post(':id/cancel')
  @AdminAuth('task:update')
  @ApiOperation({ summary: '取消任务' })
  async cancel(@Param('id') id: string) {
    return this.taskService.cancel(id)
  }

  @Post(':id/claim')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '领取任务' })
  async claim(@Param('id') id: string, @Request() req: any) {
    return this.taskService.claim(id, req.user.userId)
  }

  @Post('claims/:claimId/complete')
  @AdminAuth('task:update')
  @ApiOperation({ summary: '审核完成任务（发放积分）' })
  async complete(@Param('claimId') claimId: string) {
    return this.taskService.complete(claimId)
  }
}
