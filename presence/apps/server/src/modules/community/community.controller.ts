import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import {
  CommunityService, CommunityInput, CommunityEventInput, CommunitySort,
  ModerationAction, ModerationTarget,
} from './community.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard'

@ApiTags('社群')
@Controller('communities')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // ==================== 后台管理（路由声明在 :id 之前，避免被通配吞掉） ====================

  @Get('admin/list')
  @AdminAuth('community:view')
  @ApiOperation({ summary: '后台社群列表（全部状态，可按主理人范围过滤）' })
  async adminList(
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('hostUserId') hostUserId?: string,
  ) {
    return this.communityService.adminList(status, keyword, hostUserId)
  }

  @Get('admin/hosts')
  @AdminAuth('community:view')
  @ApiOperation({ summary: '主理人列表（基础/扩展角色）' })
  async adminListHosts(@Query('keyword') keyword?: string) {
    return this.communityService.adminListHosts(keyword)
  }

  @Post('admin/hosts/:userId/role')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '平台人工设置主理人角色（不涉及商务/计费）' })
  async adminSetHostRole(
    @Param('userId') userId: string,
    @Body('role') role: 'BASIC' | 'EXTENDED' | null,
  ) {
    return this.communityService.adminSetHostRole(userId, role)
  }

  @Post('admin/create')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '后台创建社群' })
  async adminCreate(@Body() body: CommunityInput) {
    return this.communityService.adminCreate(body)
  }

  @Get('admin/join-requests')
  @AdminAuth('community:view')
  @ApiOperation({ summary: '入群申请队列' })
  async adminListRequests(
    @Query('communityId') communityId?: string,
    @Query('status') status?: string,
    @Query('hostUserId') hostUserId?: string,
  ) {
    return this.communityService.adminListRequests(communityId, status, hostUserId)
  }

  @Post('admin/join-requests/:id/review')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '审核入群申请（通过/驳回，可备注）' })
  async reviewRequest(
    @Param('id') id: string,
    @Body() body: { approved: boolean; note?: string; hostUserId?: string },
    @Request() req: any,
  ) {
    return this.communityService.reviewRequest(
      id,
      Boolean(body.approved),
      body.note,
      { id: req.user.adminId, name: req.user.username, type: 'PLATFORM' },
      body.hostUserId,
    )
  }

  @Get('admin/invites')
  @AdminAuth('community:view')
  @ApiOperation({ summary: '邀请/礼遇列表' })
  async adminListInvites(
    @Query('communityId') communityId: string,
    @Query('hostUserId') hostUserId?: string,
  ) {
    return this.communityService.adminListInvites(communityId, hostUserId)
  }

  @Post('admin/invites')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '创建邀请/礼遇' })
  async adminCreateInvite(
    @Body() body: {
      communityId: string
      name: string
      kind?: string
      amount?: number
      expiresAt?: string | null
      quota?: number
      note?: string
      hostUserId?: string
    },
    @Request() req: any,
  ) {
    // 后台管理员始终是平台身份；hostUserId 只作为「主理人工作台」的数据范围过滤
    return this.communityService.adminCreateInvite(
      body.communityId,
      body,
      { id: req.user.adminId, type: 'PLATFORM' },
      body.hostUserId,
    )
  }

  @Put('admin/invites/:id')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '更新邀请/礼遇' })
  async adminUpdateInvite(
    @Param('id') id: string,
    @Body() body: {
      name?: string
      kind?: string
      amount?: number
      expiresAt?: string | null
      quota?: number
      note?: string
      isActive?: boolean
      hostUserId?: string
    },
    @Request() req: any,
  ) {
    return this.communityService.adminUpdateInvite(
      id,
      body,
      { id: req.user.adminId, type: 'PLATFORM' },
      body.hostUserId,
    )
  }

  @Delete('admin/invites/:id')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '停用邀请/礼遇' })
  async adminRemoveInvite(
    @Param('id') id: string,
    @Query('hostUserId') hostUserId: string | undefined,
    @Request() req: any,
  ) {
    return this.communityService.adminRemoveInvite(
      id,
      { id: req.user.adminId, type: 'PLATFORM' },
      hostUserId,
    )
  }

  @Get('admin/moderation-logs')
  @AdminAuth('community:view')
  @ApiOperation({ summary: '内容治理日志' })
  async adminModerationLogs(
    @Query('communityId') communityId: string,
    @Query('hostUserId') hostUserId?: string,
  ) {
    return this.communityService.listModerationLogs(communityId, hostUserId)
  }

  @Post('admin/moderation')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '内容治理（隐藏/恢复/删除，必须填写原因）' })
  async adminModerate(
    @Body() body: {
      communityId: string
      targetType: ModerationTarget
      targetId: string
      action: ModerationAction
      reason: string
      hostUserId?: string
    },
    @Request() req: any,
  ) {
    return this.communityService.moderate(
      body.communityId,
      body,
      { id: req.user.adminId, name: req.user.username, type: 'PLATFORM' },
    )
  }

  @Get('admin/events')
  @AdminAuth('community:view')
  @ApiOperation({ summary: '后台活动列表' })
  async adminListEvents(
    @Query('communityId') communityId?: string,
    @Query('hostUserId') hostUserId?: string,
  ) {
    return this.communityService.adminListEvents(communityId, hostUserId)
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
  @ApiOperation({ summary: '后台动态列表（可按状态/社群/主理人过滤）' })
  async adminListPosts(
    @Query('status') status?: string,
    @Query('communityId') communityId?: string,
    @Query('hostUserId') hostUserId?: string,
  ) {
    return this.communityService.adminListPosts(status, communityId, hostUserId)
  }

  @Post('admin/posts/:id/audit')
  @AdminAuth('community:manage')
  @ApiOperation({ summary: '动态审核（历史兼容；新动态默认即时发布）' })
  async auditPost(@Param('id') id: string, @Body('approved') approved: boolean) {
    return this.communityService.auditPost(id, approved)
  }

  // ==================== 公共查询（C 端） ====================

  @Get()
  @ApiOperation({ summary: '社群广场列表（仅公开上架，公开）' })
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

  @Get('invites/:inviteId')
  @ApiOperation({ summary: '邀请落地信息（公开，不暴露私密内容）' })
  async invitePublic(@Param('inviteId') inviteId: string) {
    return this.communityService.getInvitePublic(inviteId)
  }

  @Post('invites/:inviteId/claim')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '领取邀请（每人一次，不替代入群审核）' })
  async claimInvite(@Param('inviteId') inviteId: string, @Request() req: any) {
    return this.communityService.claimInvite(inviteId, req.user.userId)
  }

  @Get(':id/managed')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '主理人视角的社群详情（待审核社群也可查看）' })
  async managedDetail(@Param('id') id: string, @Request() req: any) {
    return this.communityService.getManaged(id, req.user.userId)
  }

  @Get(':id')
  @ApiOperation({ summary: '社群详情（公开；邀请制仅返回身份信息）' })
  async detail(@Param('id') id: string) {
    return this.communityService.getPublic(id)
  }

  @Get(':id/membership')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '我与社群的关系（加入/申请/隐私/邀请）' })
  async membership(@Param('id') id: string, @Request() req: any) {
    return this.communityService.getMembership(id, req.user.userId)
  }

  @Get(':id/events')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '社群活动日历（内部活动仅成员可见）' })
  async events(@Param('id') id: string, @Request() req: any) {
    const userId = this.optionalUserId(req)
    return this.communityService.listEvents(id, userId)
  }

  @Get(':id/events/:eventId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '社群活动详情' })
  async eventDetail(@Param('id') id: string, @Param('eventId') eventId: string, @Request() req: any) {
    return this.communityService.getEvent(id, eventId, this.optionalUserId(req))
  }

  @Post(':id/events/:eventId/signup')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '活动报名' })
  async signupEvent(@Param('id') id: string, @Param('eventId') eventId: string, @Request() req: any) {
    return this.communityService.signupEvent(id, eventId, req.user.userId)
  }

  @Delete(':id/events/:eventId/signup')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消活动报名' })
  async cancelSignup(@Param('id') id: string, @Param('eventId') eventId: string, @Request() req: any) {
    return this.communityService.cancelSignup(id, eventId, req.user.userId)
  }

  @Get(':id/posts')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '社群动态（成员专属）' })
  async posts(@Param('id') id: string, @Request() req: any) {
    return this.communityService.listPosts(id, req.user.userId)
  }

  @Get(':id/members')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '社群成员列表（成员专属）' })
  async members(@Param('id') id: string, @Request() req: any) {
    return this.communityService.listMembers(id, req.user.userId)
  }

  @Get(':id/members/:userId/card')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '成员名片（按对方隐私展示活动）' })
  async memberCard(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.communityService.getMemberCard(id, userId, req.user.userId)
  }

  @Get(':id/host')
  @ApiOperation({ summary: '主理人资料（公开，不含联系方式）' })
  async hostCard(@Param('id') id: string) {
    return this.communityService.getHostCard(id)
  }

  // ==================== 用户操作（需登录） ====================

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '主理人创建社群（基础角色限 1 个）' })
  async create(@Request() req: any, @Body() body: CommunityInput) {
    return this.communityService.createByOwner(req.user.userId, body)
  }

  @Post(':id/posts')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '发布动态（即时可见）' })
  async createPost(
    @Param('id') id: string,
    @Request() req: any,
    @Body('content') content: string,
    @Body('images') images?: string[],
  ) {
    return this.communityService.createPost(id, req.user.userId, content, images)
  }

  @Post(':id/posts/:postId/comments')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '发表评论（即时可见）' })
  async createComment(
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Request() req: any,
    @Body('content') content: string,
  ) {
    return this.communityService.createComment(id, postId, req.user.userId, content)
  }

  @Post(':id/posts/:postId/like')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '点赞/取消点赞动态（一人一赞）' })
  async toggleLike(
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Request() req: any,
  ) {
    return this.communityService.toggleLike(id, postId, req.user.userId)
  }

  @Post(':id/moderation')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '主理人小程序内隐藏/恢复/删除动态或评论' })
  async moderate(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { targetType: ModerationTarget; targetId: string; action: ModerationAction; reason: string },
  ) {
    return this.communityService.moderateAsHost(id, req.user.userId, body)
  }

  @Post(':id/join')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '加入社群（审核/邀请/礼遇）' })
  async join(@Param('id') id: string, @Request() req: any) {
    return this.communityService.join(id, req.user.userId)
  }

  @Post(':id/join-requests')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交入群申请' })
  async applyJoin(@Param('id') id: string, @Request() req: any, @Body('note') note?: string) {
    return this.communityService.applyJoin(id, req.user.userId, note)
  }

  @Get(':id/join-requests/mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的入群申请状态' })
  async myRequest(@Param('id') id: string, @Request() req: any) {
    return this.communityService.myRequest(id, req.user.userId)
  }

  @Put(':id/privacy')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '成员隐私与兴趣设置（每个社群独立）' })
  async updatePrivacy(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { privacy: string; interests?: string[] },
  ) {
    return this.communityService.updatePrivacy(id, req.user.userId, body.privacy, body.interests || [])
  }

  @Get(':id/invite-claims/mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '我在本社群可用的邀请权益' })
  async myInviteClaim(@Param('id') id: string, @Request() req: any) {
    return this.communityService.myInviteClaim(id, req.user.userId)
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

  /** 公开查询接口可选带上登录态：有 token 时解析用户，用于过滤内部活动 */
  private optionalUserId(req: any): string | undefined {
    return req?.user?.userId
  }
}
