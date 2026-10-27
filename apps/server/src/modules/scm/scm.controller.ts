import { Controller, Get, Post, Put, Body, Param, Query, Request } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { PurchaseOrderStatus, StockAdjustStatus } from '@prisma/client'
import { ScmBasicService } from './scm-basic.service'
import { PurchaseService, type CreatePurchaseOrderInput, type CreateReceiptInput } from './purchase.service'
import { StockQueryService, type CreateAdjustInput } from './stock-query.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'
import { hasPermission } from '@fullyu/shared'

@ApiTags('进销存')
@Controller('scm')
export class ScmController {
  constructor(
    private readonly basicService: ScmBasicService,
    private readonly purchaseService: PurchaseService,
    private readonly stockQueryService: StockQueryService,
  ) {}

  // ===== 基础档案 =====

  @Get('products')
  @AdminAuth('scm:po:view')
  @ApiOperation({ summary: '商品列表' })
  async products(
    @Request() req: any,
    @Query('keyword') keyword?: string,
    @Query('enabled') enabled?: string,
  ) {
    return this.basicService.listProducts(
      {
        keyword,
        enabled: enabled === undefined ? undefined : enabled === 'true',
      },
      hasPermission(req.user?.permissions, 'scm:po:price'),
    )
  }

  @Post('products')
  @AdminAuth('scm:po:update')
  @ApiOperation({ summary: '新建商品' })
  async createProduct(@Request() req: any, @Body() body: any) {
    return this.basicService.createProduct(
      body,
      hasPermission(req.user?.permissions, 'scm:po:price'),
    )
  }

  @Put('products/:id')
  @AdminAuth('scm:po:update')
  @ApiOperation({ summary: '编辑商品' })
  async updateProduct(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.basicService.updateProduct(
      id,
      body,
      hasPermission(req.user?.permissions, 'scm:po:price'),
    )
  }

  @Put('products/:id/toggle')
  @AdminAuth('scm:po:update')
  @ApiOperation({ summary: '启用/停用商品' })
  async toggleProduct(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.basicService.toggleProduct(
      id,
      !!body?.enabled,
      hasPermission(req.user?.permissions, 'scm:po:price'),
    )
  }

  @Get('suppliers')
  @AdminAuth('scm:po:view')
  @ApiOperation({ summary: '供应商列表' })
  async suppliers(@Query('keyword') keyword?: string) {
    return this.basicService.listSuppliers({ keyword })
  }

  @Post('suppliers')
  @AdminAuth('scm:po:update')
  @ApiOperation({ summary: '新建供应商' })
  async createSupplier(@Body() body: any) {
    return this.basicService.createSupplier(body)
  }

  @Put('suppliers/:id')
  @AdminAuth('scm:po:update')
  @ApiOperation({ summary: '编辑供应商' })
  async updateSupplier(@Param('id') id: string, @Body() body: any) {
    return this.basicService.updateSupplier(id, body)
  }

  // ===== 采购订单 =====

  @Get('purchase-orders')
  @AdminAuth('scm:po:view')
  @ApiOperation({ summary: '采购单列表' })
  async purchaseOrders(
    @Request() req: any,
    @Query('status') status?: PurchaseOrderStatus,
    @Query('buyerId') buyerId?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.purchaseService.list(req.user, { status, buyerId, keyword })
  }

  @Get('purchase-orders/receivable')
  @AdminAuth('scm:inbound:view')
  @ApiOperation({ summary: '待收货的采购单' })
  async receivable(@Request() req: any) {
    return this.purchaseService.receivableOrders(req.user)
  }

  @Get('purchase-orders/:id')
  @AdminAuth('scm:po:view')
  @ApiOperation({ summary: '采购单详情' })
  async purchaseOrderDetail(@Request() req: any, @Param('id') id: string) {
    return this.purchaseService.detail(req.user, id)
  }

  @Post('purchase-orders')
  @AdminAuth('scm:po:create')
  @ApiOperation({ summary: '发起采购申请（自动挂审批）' })
  async createPurchaseOrder(@Request() req: any, @Body() body: CreatePurchaseOrderInput) {
    return this.purchaseService.create(req.user, body)
  }

  @Put('purchase-orders/:id')
  @AdminAuth('scm:po:update')
  @ApiOperation({ summary: '修改后重新提交（仅已驳回/已取消）' })
  async updatePurchaseOrder(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: CreatePurchaseOrderInput,
  ) {
    return this.purchaseService.update(req.user, id, body)
  }

  @Post('purchase-orders/:id/cancel')
  @AdminAuth('scm:po:cancel')
  @ApiOperation({ summary: '作废采购单' })
  async cancelPurchaseOrder(@Request() req: any, @Param('id') id: string) {
    return this.purchaseService.cancel(req.user, id)
  }

  // ===== 验收入库 =====

  @Get('receipts')
  @AdminAuth('scm:inbound:view')
  @ApiOperation({ summary: '入库记录' })
  async receipts(
    @Request() req: any,
    @Query('poId') poId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.purchaseService.listReceipts(req.user, { poId, warehouseId })
  }

  @Post('receipts')
  @AdminAuth('scm:inbound:create')
  @ApiOperation({ summary: '执行验收入库（可分批）' })
  async createReceipt(@Request() req: any, @Body() body: CreateReceiptInput) {
    return this.purchaseService.createReceipt(req.user, body)
  }

  // ===== 库存 =====

  @Get('stock')
  @AdminAuth('scm:stock:view')
  @ApiOperation({ summary: '库存结存' })
  async stock(
    @Request() req: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('keyword') keyword?: string,
    @Query('belowSafety') belowSafety?: string,
  ) {
    return this.stockQueryService.balances(req.user, {
      warehouseId,
      keyword,
      belowSafety: belowSafety === 'true',
    })
  }

  @Get('stock/ledgers')
  @AdminAuth('scm:stock:view')
  @ApiOperation({ summary: '出入库流水' })
  async ledgers(
    @Request() req: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockQueryService.ledgers(req.user, {
      warehouseId,
      productId,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get('stock/adjusts')
  @AdminAuth('scm:stock:view')
  @ApiOperation({ summary: '库存调整单列表' })
  async adjusts(
    @Request() req: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: StockAdjustStatus,
  ) {
    return this.stockQueryService.listAdjusts(req.user, { warehouseId, status })
  }

  @Post('stock/adjusts')
  @AdminAuth('scm:stock:adjust')
  @ApiOperation({ summary: '提交库存调整（盘盈盘亏/报损，自动挂审批）' })
  async createAdjust(@Request() req: any, @Body() body: CreateAdjustInput) {
    return this.stockQueryService.createAdjust(req.user, body)
  }

  @Post('stock/adjusts/:id/cancel')
  @AdminAuth('scm:stock:adjust')
  @ApiOperation({ summary: '撤销库存调整单' })
  async cancelAdjust(@Request() req: any, @Param('id') id: string) {
    return this.stockQueryService.cancelAdjust(req.user, id)
  }
}
