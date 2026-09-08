import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ApprovalBizType, ApprovalInstanceStatus } from '@prisma/client'
import { ApprovalService } from './approval.service'
import { ApprovalFlowService, type UpsertFlowRuleInput } from './approval-flow.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('审批流')
@Controller('approvals')
export class ApprovalController {
  constructor(
    private readonly approvalService: ApprovalService,
    private readonly flowService: ApprovalFlowService,
  ) {}

  // ===== 流程配置 =====

  @Get('rules')
  @AdminAuth('flow:config:view')
  @ApiOperation({ summary: '流程规则列表' })
  async rules(@Query('bizType') bizType?: ApprovalBizType) {
    return this.flowService.list({ bizType })
  }

  @Post('rules')
  @AdminAuth('flow:config:edit')
  @ApiOperation({ summary: '新建流程规则' })
  async createRule(@Body() body: UpsertFlowRuleInput) {
    return this.flowService.create(body)
  }

  @Post('rules/preview')
  @AdminAuth('flow:config:view')
  @ApiOperation({ summary: '试算命中的流程（返回空表示免审直通）' })
  async previewRule(
    @Body() body: { bizType: ApprovalBizType; amount: number; scope: 'HQ' | 'STORE' },
  ) {
    return this.flowService.preview({
      bizType: body.bizType,
      amount: Number(body.amount ?? 0),
      scope: body.scope === 'STORE' ? 'STORE' : 'HQ',
    })
  }

  @Put('rules/:id')
  @AdminAuth('flow:config:edit')
  @ApiOperation({ summary: '编辑流程规则（节点整单覆盖）' })
  async updateRule(@Param('id') id: string, @Body() body: UpsertFlowRuleInput) {
    return this.flowService.update(id, body)
  }

  @Put('rules/:id/toggle')
  @AdminAuth('flow:config:toggle')
  @ApiOperation({ summary: '启用/停用流程规则' })
  async toggleRule(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.flowService.toggle(id, !!body?.enabled)
  }

  @Delete('rules/:id')
  @AdminAuth('flow:config:edit')
  @ApiOperation({ summary: '删除流程规则' })
  async removeRule(@Param('id') id: string) {
    return this.flowService.remove(id)
  }

  // ===== 审批待办与记录 =====

  @Get('todo')
  @AdminAuth('flow:todo:view')
  @ApiOperation({ summary: '我的审批待办' })
  async todo(@Request() req: any) {
    return this.approvalService.myTodo(req.user)
  }

  @Get('todo/count')
  @AdminAuth('flow:todo:view')
  @ApiOperation({ summary: '我的待办条数' })
  async todoCount(@Request() req: any) {
    return { count: await this.approvalService.todoCount(req.user) }
  }

  @Get('instances')
  @AdminAuth('flow:instance:view')
  @ApiOperation({ summary: '审批记录列表' })
  async instances(
    @Request() req: any,
    @Query('status') status?: ApprovalInstanceStatus,
    @Query('bizType') bizType?: ApprovalBizType,
    @Query('keyword') keyword?: string,
  ) {
    return this.approvalService.list(req.user, { status, bizType, keyword })
  }

  @Get('instances/:id')
  @AdminAuth('flow:instance:view')
  @ApiOperation({ summary: '审批单详情（含节点与意见）' })
  async instanceDetail(@Param('id') id: string) {
    return this.approvalService.detail(id)
  }

  @Post('instances/:id/approve')
  @AdminAuth('flow:todo:approve')
  @ApiOperation({ summary: '同意' })
  async approve(@Request() req: any, @Param('id') id: string, @Body() body: { comment?: string }) {
    return this.approvalService.approve(req.user, id, body?.comment)
  }

  @Post('instances/:id/reject')
  @AdminAuth('flow:todo:approve')
  @ApiOperation({ summary: '驳回' })
  async reject(@Request() req: any, @Param('id') id: string, @Body() body: { comment?: string }) {
    return this.approvalService.reject(req.user, id, body?.comment)
  }

  @Post('instances/:id/cancel')
  @AdminAuth('flow:instance:view')
  @ApiOperation({ summary: '撤销（仅发起人）' })
  async cancel(@Request() req: any, @Param('id') id: string) {
    return this.approvalService.cancel(req.user, id)
  }
}
