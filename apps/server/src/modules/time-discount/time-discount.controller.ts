import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { TimeDiscountService, TimeDiscountInput } from './time-discount.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('会员卡时段折扣')
@Controller('time-discounts')
export class TimeDiscountController {
  constructor(private readonly svc: TimeDiscountService) {}

  @Get('admin/list')
  @AdminAuth('membercard:view')
  @ApiOperation({ summary: '后台时段折扣规则列表（按优先级升序）' })
  async adminList() {
    return this.svc.adminList()
  }

  @Post()
  @AdminAuth('membercard:timediscount')
  @ApiOperation({ summary: '创建规则' })
  async create(@Body() body: TimeDiscountInput) {
    return this.svc.create(body)
  }

  @Post('reorder')
  @AdminAuth('membercard:timediscount')
  @ApiOperation({ summary: '优先级调序（传完整 id 顺序）' })
  async reorder(@Body('ids') ids: string[]) {
    return this.svc.reorder(ids)
  }

  @Put(':id')
  @AdminAuth('membercard:timediscount')
  @ApiOperation({ summary: '更新规则' })
  async update(@Param('id') id: string, @Body() body: TimeDiscountInput) {
    return this.svc.update(id, body)
  }

  @Post(':id/status')
  @AdminAuth('membercard:timediscount')
  @ApiOperation({ summary: '启用/停用规则' })
  async setStatus(@Param('id') id: string, @Body('status') status: 'ENABLED' | 'DISABLED') {
    return this.svc.setStatus(id, status)
  }

  @Delete(':id')
  @AdminAuth('membercard:timediscount')
  @ApiOperation({ summary: '删除规则（被订单引用时拒绝）' })
  async remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
