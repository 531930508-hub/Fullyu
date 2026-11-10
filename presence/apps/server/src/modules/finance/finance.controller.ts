import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ExpenseCategory, ExpenseStatus, RevenueSourceKey } from '@prisma/client'
import { recentMonths } from '@fullyu/shared'
import { RevenueService, type RevenueRecordInput } from './revenue.service'
import { ExpenseService, type ExpenseInput } from './expense.service'
import { DashboardService } from './dashboard.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('财务')
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly revenueService: RevenueService,
    private readonly expenseService: ExpenseService,
    private readonly dashboardService: DashboardService,
  ) {}

  // ===== 收入 =====

  @Get('revenue/sources')
  @AdminAuth('finance:revenue:view')
  @ApiOperation({ summary: '收入数据源与对接状态' })
  async sources() {
    return this.revenueService.listSources()
  }

  @Post('revenue/sources/:key/sync')
  @AdminAuth('finance:revenue:sync')
  @ApiOperation({ summary: '手动触发收入抽取' })
  async sync(@Param('key') key: RevenueSourceKey, @Body() body: { month?: string }) {
    return this.revenueService.sync(key, body?.month)
  }

  @Get('revenue/records')
  @AdminAuth('finance:revenue:view')
  @ApiOperation({ summary: '收入流水' })
  async records(
    @Request() req: any,
    @Query('month') month?: string,
    @Query('orgId') orgId?: string,
    @Query('source') source?: RevenueSourceKey,
  ) {
    return this.revenueService.listRecords(req.user, { month, orgId, source })
  }

  @Post('revenue/records')
  @AdminAuth('finance:revenue:import')
  @ApiOperation({ summary: '手工录入收入' })
  async createRecords(@Request() req: any, @Body() body: RevenueRecordInput | RevenueRecordInput[]) {
    const rows = Array.isArray(body) ? body : [body]
    // 一次传多条按导入处理，单条按手工录入，看板上能区分数据来路
    return this.revenueService.createRecords(req.user, rows, rows.length > 1 ? 'IMPORT' : 'MANUAL')
  }

  @Delete('revenue/records/:id')
  @AdminAuth('finance:revenue:import')
  @ApiOperation({ summary: '删除手工收入流水' })
  async removeRecord(@Request() req: any, @Param('id') id: string) {
    return this.revenueService.removeRecord(req.user, id)
  }

  // ===== 支出 =====

  @Get('expenses')
  @AdminAuth('finance:expense:view')
  @ApiOperation({ summary: '支出台账' })
  async expenses(
    @Request() req: any,
    @Query('month') month?: string,
    @Query('orgId') orgId?: string,
    @Query('category') category?: ExpenseCategory,
    @Query('status') status?: ExpenseStatus,
  ) {
    return this.expenseService.list(req.user, { month, orgId, category, status })
  }

  @Post('expenses')
  @AdminAuth('finance:expense:create')
  @ApiOperation({ summary: '录入支出（自动挂审批）' })
  async createExpense(@Request() req: any, @Body() body: ExpenseInput) {
    return this.expenseService.create(req.user, body)
  }

  @Post('expenses/import')
  @AdminAuth('finance:expense:import')
  @ApiOperation({ summary: '批量导入支出（直接生效）' })
  async importExpenses(@Request() req: any, @Body() body: { items: ExpenseInput[] }) {
    return this.expenseService.importBatch(req.user, body?.items ?? [])
  }

  @Put('expenses/:id')
  @AdminAuth('finance:expense:update')
  @ApiOperation({ summary: '编辑支出' })
  async updateExpense(@Request() req: any, @Param('id') id: string, @Body() body: ExpenseInput) {
    return this.expenseService.update(req.user, id, body)
  }

  @Delete('expenses/:id')
  @AdminAuth('finance:expense:delete')
  @ApiOperation({ summary: '删除支出' })
  async removeExpense(@Request() req: any, @Param('id') id: string) {
    return this.expenseService.remove(req.user, id)
  }

  // ===== 看板 =====

  @Get('dashboard')
  @AdminAuth('finance:dashboard:view')
  @ApiOperation({ summary: '月度门店损益看板' })
  async dashboard(@Request() req: any, @Query('month') month?: string) {
    return this.dashboardService.overview(req.user, month)
  }

  @Get('dashboard/trend')
  @AdminAuth('finance:dashboard:view')
  @ApiOperation({ summary: '近几月收支趋势' })
  async trend(
    @Request() req: any,
    @Query('count') count?: string,
    @Query('orgId') orgId?: string,
  ) {
    const months = recentMonths(Math.min(Number(count) || 6, 24)).reverse()
    return this.dashboardService.trend(req.user, months, orgId)
  }
}
