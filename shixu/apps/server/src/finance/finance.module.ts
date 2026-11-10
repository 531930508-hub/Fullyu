import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { ExpensesService } from './expenses.service';
import { DashboardService } from './dashboard.service';

@Module({
  providers: [FinanceService, ExpensesService, DashboardService],
  exports: [FinanceService, ExpensesService, DashboardService]
})
export class FinanceModule {}
