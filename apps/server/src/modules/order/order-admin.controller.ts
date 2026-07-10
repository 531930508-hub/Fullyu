import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { OrderService } from './order.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('订单（后台）')
@Controller('order-admin')
export class OrderAdminController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @AdminAuth('order:view')
  @ApiOperation({ summary: '后台订单列表' })
  async list(
    @Query('status') status?: string,
    @Query('orderType') orderType?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.orderService.adminList({ status, orderType, keyword })
  }
}
