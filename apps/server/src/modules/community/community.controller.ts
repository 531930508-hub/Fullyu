import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { CommunityService, CommunityInput, CommunityEventInput, CommunitySort } from './community.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('社群')
@Controller('communities')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // ==================== 后台管理（路由声明在 :id 之前，避免被通配吞掉） ====================

  @Get('admin/list')
  @AdminAuth('community:view')
  @ApiOperation({ summary: '后台社群列表（全部状态）' })
  async adminList(@Query('status') status?: string, @Query('keyword') keyword?: string) {
    return this.communityService.adminList(status, keyword)
  }

  @Post('admin/create')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '后台创建社群' })
  async adminCreate(@Body() body: CommunityInput) {
    return this.communityService.adminCreate(body)
  }

  @Get('admin/events')
  @AdminAuth('community:view')
  @ApiOperation({ summary: '后台活动列表' })
  async adminListEvents(@Query('communityId') communityId?: string) {
    return this.communityService.adminListEvents(communityId)
  }

  @Post('admin/events')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '创建活动' })
  async adminCreateEvent(@Body() body: CommunityEventInput) {
    return this.communityService.adminCreateEvent(body)
  }

  @Put('admin/events/:id')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '更新活动' })
  async adminUpdateEvent(@Param('id') id: string, @Body() body: CommunityEventInput) {
    return this.communityService.adminUpdateEvent(id, body)
  }

  @Delete('admin/events/:id')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '删除活动' })
  async adminRemoveEvent(@Param('id') id: string) {
    return this.communityService.adminRemoveEvent(id)
  }

  @Get('admin/posts')
  @AdminAuth('community:view')
  @ApiOperation({ summary: '后台动态列表（可按状态过滤）' })
  async adminListPosts(@Query('status') status?: string) {
    return this.communityService.adminListPosts(status)
  }

  @Post('admin/posts/:id/audit')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '动态审核（通过/驳回）' })
  async auditPost(@Param('id') id: string, @Body('approved') approved: boolean) {
    return this.communityService.auditPost(id, approved)
  }

  // ==================== 公共查询（C 端） ====================

  @Get()
  @ApiOperation({ summary: '社群广场列表（仅上架，公开）' })
  async list(
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('sort') sort?: CommunitySort,
  ) {
    return this.communityService.listPublic(category, keyword, sort || 'recommend')
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的社群（我管理的 + 我加入的）' })
  async mine(@Request() req: any) {
    return this.communityService.listMine(req.user.userId)
  }

  @Get(':id')
  @ApiOperation({ summary: '社群详情（公开）' })
  async detail(@Param('id') id: string) {
    return this.communityService.getPublic(id)
  }

  @Get(':id/membership')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '我与社群的关系（已加入/主理人）' })
  async membership(@Param('id') id: string, @Request() req: any) {
    return this.communityService.getMembership(id, req.user.userId)
  }

  @Get(':id/events')
  @ApiOperation({ summary: '社群活动日历（公开）' })
  async events(@Param('id') id: string) {
    return this.communityService.listEvents(id)
  }

  @Get(':id/posts')
  @ApiOperation({ summary: '社群动态（已发布，公开）' })
  async posts(@Param('id') id: string) {
    return this.communityService.listPosts(id)
  }

  @Get(':id/members')
  @ApiOperation({ summary: '社群成员列表（公开）' })
  async members(@Param('id') id: string) {
    return this.communityService.listMembers(id)
  }

  // ==================== 用户操作（需登录） ====================

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '主理人创建社群（提交审核）' })
  async create(@Request() req: any, @Body() body: CommunityInput) {
    return this.communityService.createByOwner(req.user.userId, body)
  }

  @Post(':id/posts')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '发布动态（先审后发）' })
  async createPost(@Param('id') id: string, @Request() req: any, @Body('content') content: string) {
    return this.communityService.createPost(id, req.user.userId, content)
  }

  @Post(':id/join')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '加入社群' })
  async join(@Param('id') id: string, @Request() req: any) {
    return this.communityService.join(id, req.user.userId)
  }

  @Delete(':id/join')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '退出社群' })
  async leave(@Param('id') id: string, @Request() req: any) {
    return this.communityService.leave(id, req.user.userId)
  }

  @Put(':id')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '后台更新社群' })
  async update(@Param('id') id: string, @Body() body: CommunityInput) {
    return this.communityService.adminUpdate(id, body)
  }

  @Post(':id/audit')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '社群审核（通过/驳回）' })
  async audit(@Param('id') id: string, @Body('approved') approved: boolean) {
    return this.communityService.audit(id, approved)
  }

  @Post(':id/status')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '上架/下架社群' })
  async setStatus(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.communityService.setStatus(id, isActive)
  }

  @Delete(':id')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '删除社群' })
  async remove(@Param('id') id: string) {
    return this.communityService.remove(id)
  }
}
