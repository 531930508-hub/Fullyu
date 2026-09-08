import { Module } from '@nestjs/common'
import { FinanceController } from './finance.controller'
import { RevenueService } from './revenue.service'
import { ExpenseService } from './expense.service'
import { DashboardService } from './dashboard.service'
import { ApprovalModule } from '../approval/approval.module'

/**
 * 财务模块：收入多源归集、支出台账、门店损益看板。
 *
 * 只依赖审批引擎（支出录入要挂审批）；耗材成本直接查采购单表，
 * 不引入 ScmModule，两个模块可以各自演进。
 */
@Module({
  imports: [ApprovalModule],
  controllers: [FinanceController],
  providers: [RevenueService, ExpenseService, DashboardService],
  exports: [RevenueService, ExpenseService, DashboardService],
})
export class FinanceModule {}
