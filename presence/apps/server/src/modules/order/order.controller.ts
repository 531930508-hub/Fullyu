import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { OrderService } from './order.service'
import { EnrollmentService, EnrollDto } from './enrollment.service'

@ApiTags('订单')
@Controller('orders')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly enrollmentService: EnrollmentService,
  ) {}

  @Get('quote/:courseId')
  @ApiOperation({ summary: '课程报名询价（阶梯价 + 会员折扣 + 可用抵扣）' })
  async quote(@Request() req: any, @Param('courseId') courseId: string) {
    return this.enrollmentService.quote(courseId, req.user.userId)
  }

  @Post('enroll/:courseId')
  @ApiOperation({ summary: '课程报名下单（锁价 + 生成待支付订单）' })
  async enroll(
    @Request() req: any,
    @Param('courseId') courseId: string,
    @Body() body: EnrollDto,
  ) {
    return this.enrollmentService.enroll(courseId, req.user.userId, body)
  }

  @Post('lock-seat')
  @ApiOperation({ summary: '锁定课程席位' })
  async lockSeat(@Request() req: any, @Body() body: { courseId: string }) {
    return this.orderService.lockSeat(body.courseId, req.user.userId)
  }

  @Post()
  @ApiOperation({ summary: '创建订单' })
  async create(@Request() req: any, @Body() body: any) {
    return this.orderService.createOrder({ ...body, userId: req.user.userId })
  }

  @Get()
  @ApiOperation({ summary: '获取我的订单列表' })
  async list(@Request() req: any, @Query('status') status?: string) {
    return this.orderService.findByUser(req.user.userId, status)
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消订单' })
  async cancel(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.orderService.cancelOrder(id, req.user.userId, body.reason)
  }
}
