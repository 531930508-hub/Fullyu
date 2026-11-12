import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'
import { TrainerPortalAdminService, type ApproveApplicationInput, type ApproveProposalInput } from './trainer-portal-admin.service'

/**
 * 教务侧审核接口（后台）。
 * 权限沿用已有权限点：导师入驻用 trainer:create / trainer:update，
 * 课程提案用 course:create / course:update，避免再引入一套新权限导致存量角色全部失效。
 */
@ApiTags('导师门户-教务审核')
@Controller('trainer-portal/admin')
export class TrainerPortalAdminController {
  constructor(private readonly service: TrainerPortalAdminService) {}

  // ---------- 入驻审核 ----------

  @Get('applications')
  @AdminAuth('trainer:view')
  @ApiOperation({ summary: '导师入驻申请列表' })
  async applications(@Query('status') status?: string, @Query('keyword') keyword?: string) {
    return this.service.listApplications({ status, keyword })
  }

  @Get('applications/:id')
  @AdminAuth('trainer:view')
  @ApiOperation({ summary: '导师入驻申请详情' })
  async application(@Param('id') id: string) {
    return this.service.applicationDetail(id)
  }

  @Post('applications/:id/approve')
  @AdminAuth('trainer:create')
  @ApiOperation({ summary: '通过入驻：建导师档案并开通门户账号' })
  async approveApplication(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: ApproveApplicationInput,
  ) {
    return this.service.approveApplication(req.user, id, body)
  }

  @Post('applications/:id/reject')
  @AdminAuth('trainer:update')
  @ApiOperation({ summary: '驳回入驻申请' })
  async rejectApplication(@Request() req: any, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.service.rejectApplication(req.user, id, body.reason)
  }

  @Post('trainers/:id/reset-password')
  @AdminAuth('trainer:update')
  @ApiOperation({ summary: '重置导师门户登录密码' })
  async resetPassword(@Request() req: any, @Param('id') id: string, @Body() body: { newPassword: string }) {
    return this.service.resetTrainerPassword(req.user, id, body.newPassword)
  }

  // ---------- 课程提案审核 ----------

  @Get('proposals')
  @AdminAuth('course:view')
  @ApiOperation({ summary: '课程提案列表（按状态筛选）' })
  async proposals(@Query('status') status?: string, @Query('keyword') keyword?: string) {
    return this.service.listProposals({ status, keyword })
  }

  @Get('proposals/:id')
  @AdminAuth('course:view')
  @ApiOperation({ summary: '课程提案详情' })
  async proposal(@Param('id') id: string) {
    return this.service.proposalDetail(id)
  }

  @Post('proposals/:id/review')
  @AdminAuth('course:update')
  @ApiOperation({ summary: '受理提案（标记审核中）' })
  async review(@Request() req: any, @Param('id') id: string) {
    return this.service.startReview(req.user, id)
  }

  @Post('proposals/:id/reject')
  @AdminAuth('course:update')
  @ApiOperation({ summary: '驳回提案（可勾选需修改的内容项）' })
  async reject(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { reason: string; fields?: string[] },
  ) {
    return this.service.rejectProposal(req.user, id, body.reason, body.fields || [])
  }

  @Post('proposals/:id/approve')
  @AdminAuth('course:create')
  @ApiOperation({ summary: '通过提案：补齐场地/日期/定价后生成课程' })
  async approve(@Request() req: any, @Param('id') id: string, @Body() body: ApproveProposalInput) {
    return this.service.approveProposal(req.user, id, body)
  }
}