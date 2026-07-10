import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { CheckinService } from './checkin.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('签到')
@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Get('course/:courseId')
  @AdminAuth('checkin:view')
  @ApiOperation({ summary: '课程签到名单' })
  async roster(@Param('courseId') courseId: string) {
    return this.checkinService.courseRoster(courseId)
  }

  @Post()
  @AdminAuth('checkin:create')
  @ApiOperation({ summary: '手工签到' })
  async checkIn(@Body() body: { courseId: string; userId: string }) {
    return this.checkinService.manualCheckIn(body.courseId, body.userId)
  }

  @Post('cancel')
  @AdminAuth('checkin:create')
  @ApiOperation({ summary: '取消签到' })
  async cancel(@Body() body: { courseId: string; userId: string }) {
    return this.checkinService.cancelCheckIn(body.courseId, body.userId)
  }
}
