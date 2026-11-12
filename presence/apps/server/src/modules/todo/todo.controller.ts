import { Controller, Get, Param, Request } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'
import { TodoService } from './todo.service'

@ApiTags('待办中心')
@Controller('todos')
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  /**
   * 聚合待办。只要求登录，具体来源由 service 逐项判权限，
   * 没有对应权限的来源既不查库也不返回。
   */
  @Get()
  @AdminAuth()
  @ApiOperation({ summary: '统一待办列表（审批/退款/社群/库存）' })
  async list(@Request() req: any) {
    return this.todoService.list(req.user)
  }

  @Get('count')
  @AdminAuth()
  @ApiOperation({ summary: '待办条数（侧边栏红点）' })
  async counts(@Request() req: any) {
    return this.todoService.counts(req.user)
  }

  /** 我的已办：我表决过的审批单，按最近推进排序 */
  @Get('done')
  @AdminAuth()
  @ApiOperation({ summary: '我的已办（审批流程）' })
  async done(@Request() req: any) {
    return { items: await this.todoService.done(req.user) }
  }

  /** 我提交的：我发起的审批单，任何状态都可跟进 */
  @Get('submitted')
  @AdminAuth()
  @ApiOperation({ summary: '我提交的审批单（审批流程）' })
  async submitted(@Request() req: any) {
    return { items: await this.todoService.submitted(req.user) }
  }

  /**
   * 审批详情：审批人可能只有 flow:todo:view，没有 flow:instance:view，
   * 因此不能复用 /approvals/instances/:id。访问范围由 service 判定。
   */
  @Get('approvals/:id')
  @AdminAuth()
  @ApiOperation({ summary: '待办审批详情（含业务上下文与可否表决）' })
  async approvalDetail(@Request() req: any, @Param('id') id: string) {
    return this.todoService.approvalDetail(req.user, id)
  }

  @Get('refunds/:orderId')
  @AdminAuth()
  @ApiOperation({ summary: '退款跟进详情' })
  async refundDetail(@Request() req: any, @Param('orderId') orderId: string) {
    return this.todoService.refundDetail(req.user, orderId)
  }
}
