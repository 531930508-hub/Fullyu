import { Controller, Get, Post, Put, Delete, Body, Query, Param, Request } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { CourseService } from './course.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('课程')
@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Get('admin/list')
  @AdminAuth('course:view')
  @ApiOperation({ summary: '后台课程列表（全部状态）' })
  async adminList(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('startDateFrom') startDateFrom?: string,
    @Query('startDateTo') startDateTo?: string,
  ) {
    return this.courseService.adminList({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
      status,
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

  @Put(':id/member-discounts')
  @AdminAuth('course:update')
  @ApiOperation({ summary: '保存课程会员折扣' })
  async saveMemberDiscounts(@Param('id') id: string, @Body() body: { discounts: any[] }) {
    return this.courseService.saveMemberDiscounts(id, body.discounts ?? [])
  }
}
