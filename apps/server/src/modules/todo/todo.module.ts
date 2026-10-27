import { Module } from '@nestjs/common'
import { ApprovalModule } from '../approval/approval.module'
import { TodoController } from './todo.controller'
import { TodoService } from './todo.service'

/**
 * 统一待办中心：把审批、退款跟进、入群审核、库存预警收敛到一处。
 * 审批的「谁该处理」判定复用审批引擎，避免两处口径走差。
 */
@Module({
  imports: [ApprovalModule],
  controllers: [TodoController],
  providers: [TodoService],
  exports: [TodoService],
})
export class TodoModule {}
