import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { CheckinService } from './checkin.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('签到')
@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Get('upcoming')
  @AdminAuth('checkin:view')
  @ApiOperation({ summary: '近2小时待开课的课程及报名名单（含个人照片）' })
  async upcoming() {
    return this.checkinService.upcomingCheckins()
  }

  @Get('courses')
  @AdminAuth('checkin:view')
  @ApiOperation({ summary: '签到可检索课程（尚未结课 + 近3日内结课）' })
  async courses(@Query('keyword') keyword?: string) {
    return this.checkinService.checkinCourses(keyword)
  }

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
