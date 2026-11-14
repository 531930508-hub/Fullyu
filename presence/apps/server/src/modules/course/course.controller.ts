import { Controller, Get, Post, Put, Delete, Body, Query, Param, Request } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { CourseService } from './course.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('课程')
@Controller('courses')
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly config: ConfigService,
  ) {}

  @Get('subscribe-templates')
  @ApiOperation({ summary: '报名/候补场景需申请授权的订阅消息模板 id（公开）' })
  async subscribeTemplates() {
    // 模板 id 非敏感信息，与后端下发用的 env 同源，避免小程序端二次配置
    return {
      courseReminder: this.config.get<string>('WECHAT_TMPL_COURSE_REMINDER') || '',
      waitlistPromoted: this.config.get<string>('WECHAT_TMPL_WAITLIST_PROMOTED') || '',
    }
  }

  @Get('admin/list')
  @AdminAuth('course:view')
  @ApiOperation({ summary: '后台课程列表（全部状态）' })
  async adminList(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: string,
    @Query('phase') phase?: string,
    @Query('keyword') keyword?: string,
    @Query('startDateFrom') startDateFrom?: string,
    @Query('startDateTo') startDateTo?: string,
  ) {
    return this.courseService.adminList({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
      status,
      phase,
      keyword,
      startDateFrom,
      startDateTo,
    })
  }

  @Get()
  @ApiOperation({ summary: '获取课程列表' })
  async list(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('time') timeFilter?: 'today' | 'week' | 'month',
    @Query('category') category?: string,
    @Query('sortPrice') sortPrice?: 'asc' | 'desc',
    @Query('memberOnly') memberOnly?: boolean,
  ) {
    return this.courseService.findPublished({
      page: page || 1,
      pageSize: pageSize || 10,
      timeFilter,
      category,
      sortPrice,
      memberOnly,
    })
  }

  @Get(':id')
  @ApiOperation({ summary: '获取课程详情' })
  async detail(@Param('id') id: string) {
    return this.courseService.findById(id)
  }

  @Post()
  @AdminAuth('course:create')
  @ApiOperation({ summary: '创建课程' })
  async create(@Body() body: any) {
    return this.courseService.create(body)
  }

  @Put(':id')
  @AdminAuth('course:update')
  @ApiOperation({ summary: '更新课程' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.courseService.update(id, body)
  }

  @Post(':id/status')
  @AdminAuth('course:update')
  @ApiOperation({ summary: '发布/下架/取消课程' })
  async setStatus(@Request() req: any, @Param('id') id: string, @Body() body: { status: any }) {
    return this.courseService.setStatus(id, body.status, {
      operatorId: req.user?.adminId,
      operatorName: req.user?.username,
      source: 'COURSE_PAGE',
    })
  }

  @Put(':id/enrollment-window')
  @AdminAuth('course:update')
  @ApiOperation({ summary: '调整报名窗口（开放补报名 / 恢复默认截止）' })
  async setEnrollmentWindow(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { enrollEndAt?: string | null },
  ) {
    return this.courseService.setEnrollmentWindow(id, body?.enrollEndAt ?? null, {
      operatorId: req.user?.adminId,
      operatorName: req.user?.username,
    })
  }

  @Delete(':id')
  @AdminAuth('course:delete')
  @ApiOperation({ summary: '删除课程（仅草稿且无报名/候补）' })
  async remove(@Param('id') id: string) {
    return this.courseService.remove(id)
  }

  @Put(':id/price-tiers')
  @AdminAuth('course:update')
  @ApiOperation({ summary: '保存课程阶梯价' })
  async savePriceTiers(@Param('id') id: string, @Body() body: { tiers: any[] }) {
    return this.courseService.savePriceTiers(id, body.tiers ?? [])
  }
}
