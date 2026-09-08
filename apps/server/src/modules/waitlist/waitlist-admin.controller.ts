import { Controller, Get, Post, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { WaitlistService } from './waitlist.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('候补（后台）')
@Controller('waitlist-admin')
export class WaitlistAdminController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get('course/:courseId')
  @AdminAuth('waitlist:manage')
  @ApiOperation({ summary: '某课程候补名单' })
  async listByCourse(@Param('courseId') courseId: string) {
    return this.waitlistService.adminListByCourse(courseId)
  }

  @Post(':id/promote')
  @AdminAuth('waitlist:manage')
  @ApiOperation({ summary: '手动递补（不受最大人数限制，可超额开课）' })
  async promote(@Param('id') id: string) {
    return this.waitlistService.promoteEntry(id)
  }

  @Post(':id/cancel')
  @AdminAuth('waitlist:manage')
  @ApiOperation({ summary: '候补退出退款（全额退回微信）' })
  async cancel(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.waitlistService.cancelEntry(id, body?.reason)
  }
}
