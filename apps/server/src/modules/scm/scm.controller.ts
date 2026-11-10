import { Controller, Get, Post, Put, Body, Param, Query, Request } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import {
  PurchaseOrderStatus,
  ScmBomStatus,
  ScmLocationType,
  ScmProductionStatus,
  ScmProductType,
  ScmTransferStatus,
  StockAdjustStatus,
} from '@prisma/client'
import { ScmBasicService } from './scm-basic.service'
import { PurchaseService, type CreatePurchaseOrderInput, type CreateReceiptInput } from './purchase.service'
import { StockQueryService, type CreateAdjustInput } from './stock-query.service'
import { ScmLocationService, type CreateLocationInput } from './scm-location.service'
import { ScmBomService, type SaveBomInput } from './scm-bom.service'
import { ScmTransferService, type CreateTransferInput } from './scm-transfer.service'
import { ScmPriceService, type CreatePriceInput } from './scm-price.service'
import {
  ScmProductionService,
  type CompleteProductionInput,
  type CreateProductionInput,
} from './scm-production.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'
import { hasPermission } from '@fullyu/shared'

@ApiTags('进销存')
@Controller('scm')
export class ScmController {
  constructor(
    private readonly basicService: ScmBasicService,
    private readonly purchaseService: PurchaseService,
    private readonly stockQueryService: StockQueryService,
    private readonly locationService: ScmLocationService,
    private readonly bomService: ScmBomService,
    private readonly transferService: ScmTransferService,
    private readonly productionService: ScmProductionService,
    private readonly priceService: ScmPriceService,
  ) {}

  // ===== 基础档案 =====

  @Get('products')
  @AdminAuth('scm:po:view')
  @ApiOperation({ summary: '商品列表' })
  async products(
    @Request() req: any,
    @Query('keyword') keyword?: string,
    @Query('enabled') enabled?: string,
    @Query('type') type?: ScmProductType,
  ) {
    return this.basicService.listProducts(
      {
        keyword,
        enabled: enabled === undefined ? undefined : enabled === 'true',
        type,
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

  // ===== 采购价历史 =====

  @Get('products/:id/prices')
  @AdminAuth('scm:po:price')
  @ApiOperation({ summary: '商品采购价历史' })
  async productPrices(@Param('id') id: string) {
    return this.priceService.list(id)
  }

  @Post('products/:id/prices')
  @AdminAuth('scm:po:price')
  @ApiOperation({ summary: '手工补录采购价' })
  async createProductPrice(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: CreatePriceInput,
  ) {
    return this.priceService.create(id, body, req.user?.username ?? '')
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

  // ===== 库存地点 =====

  @Get('locations')
  @AdminAuth('scm:location:view')
  @ApiOperation({ summary: '库存地点列表' })
  async locations(
    @Request() req: any,
    @Query('type') type?: ScmLocationType,
    @Query('orgId') orgId?: string,
    @Query('keyword') keyword?: string,
    @Query('includeDisabled') includeDisabled?: string,
  ) {
    return this.locationService.list(req.user, {
      type,
      orgId,
      keyword,
      includeDisabled: includeDisabled === 'true',
    })
  }

  @Post('locations')
  @AdminAuth('scm:location:update')
  @ApiOperation({ summary: '新建库存地点（自有仓/供应商处/代工厂/在途）' })
  async createLocation(@Request() req: any, @Body() body: CreateLocationInput) {
    return this.locationService.create(req.user, body)
  }

  @Put('locations/:id')
  @AdminAuth('scm:location:update')
  @ApiOperation({ summary: '编辑或停用库存地点' })
  async updateLocation(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.locationService.update(req.user, id, body)
  }

  // ===== BOM 配方 =====

  @Get('boms')
  @AdminAuth('scm:bom:view')
  @ApiOperation({ summary: 'BOM 列表（含历史版本）' })
  async boms(
    @Request() req: any,
    @Query('productId') productId?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: ScmBomStatus,
  ) {
    return this.bomService.list(req.user, { productId, keyword, status })
  }

  @Get('boms/:id')
  @AdminAuth('scm:bom:view')
  @ApiOperation({ summary: 'BOM 详情' })
  async bomDetail(@Request() req: any, @Param('id') id: string) {
    return this.bomService.detail(req.user, id)
  }

  @Post('boms')
  @AdminAuth('scm:bom:update')
  @ApiOperation({ summary: '保存 BOM（自动升版本并归档旧版）' })
  async saveBom(@Request() req: any, @Body() body: SaveBomInput) {
    return this.bomService.save(req.user, body)
  }

  @Post('boms/:id/archive')
  @AdminAuth('scm:bom:update')
  @ApiOperation({ summary: '归档 BOM 版本' })
  async archiveBom(@Request() req: any, @Param('id') id: string) {
    return this.bomService.archive(req.user, id)
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

  @Get('stock/batches')
  @AdminAuth('scm:stock:view')
  @ApiOperation({ summary: '批次与效期看板' })
  async batches(
    @Request() req: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: 'OK' | 'EXPIRING' | 'EXPIRED',
    @Query('expiringDays') expiringDays?: string,
  ) {
    return this.stockQueryService.batches(req.user, {
      warehouseId,
      keyword,
      status,
      expiringDays: expiringDays ? Number(expiringDays) : undefined,
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

  // ===== 库存调拨 =====

  @Get('transfers')
  @AdminAuth('scm:transfer:view')
  @ApiOperation({ summary: '调拨单列表' })
  async transfers(
    @Request() req: any,
    @Query('locationId') locationId?: string,
    @Query('productId') productId?: string,
    @Query('status') status?: ScmTransferStatus,
    @Query('limit') limit?: string,
  ) {
    return this.transferService.list(req.user, {
      locationId,
      productId,
      status,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get('transfers/:id')
  @AdminAuth('scm:transfer:view')
  @ApiOperation({ summary: '调拨单详情' })
  async transferDetail(@Request() req: any, @Param('id') id: string) {
    return this.transferService.detail(req.user, id)
  }

  @Post('transfers')
  @AdminAuth('scm:transfer:create')
  @ApiOperation({ summary: '发起库存调拨（提交即生效）' })
  async createTransfer(@Request() req: any, @Body() body: CreateTransferInput) {
    return this.transferService.create(req.user, body)
  }

  @Post('transfers/:id/cancel')
  @AdminAuth('scm:transfer:create')
  @ApiOperation({ summary: '撤销调拨（写反向流水）' })
  async cancelTransfer(@Request() req: any, @Param('id') id: string) {
    return this.transferService.cancel(req.user, id)
  }

  // ===== 生产/委外工单 =====

  @Get('production-orders')
  @AdminAuth('scm:production:view')
  @ApiOperation({ summary: '生产工单列表' })
  async productionOrders(
    @Request() req: any,
    @Query('status') status?: ScmProductionStatus,
    @Query('keyword') keyword?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productionService.list(req.user, {
      status,
      keyword,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get('production-orders/:id')
  @AdminAuth('scm:production:view')
  @ApiOperation({ summary: '生产工单详情' })
  async productionDetail(@Request() req: any, @Param('id') id: string) {
    return this.productionService.detail(req.user, id)
  }

  @Post('production-orders')
  @AdminAuth('scm:production:create')
  @ApiOperation({ summary: '创建生产/委外工单（按生效 BOM 快照用料）' })
  async createProduction(@Request() req: any, @Body() body: CreateProductionInput) {
    return this.productionService.create(req.user, body)
  }

  @Post('production-orders/:id/issue')
  @AdminAuth('scm:production:issue')
  @ApiOperation({ summary: '领料/发料' })
  async issueProduction(@Request() req: any, @Param('id') id: string) {
    return this.productionService.issue(req.user, id)
  }

  @Post('production-orders/:id/complete')
  @AdminAuth('scm:production:complete')
  @ApiOperation({ summary: '完工入库' })
  async completeProduction(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: CompleteProductionInput,
  ) {
    return this.productionService.complete(req.user, id, body)
  }

  @Post('production-orders/:id/cancel')
  @AdminAuth('scm:production:create')
  @ApiOperation({ summary: '取消未领料的生产工单' })
  async cancelProduction(@Request() req: any, @Param('id') id: string) {
    return this.productionService.cancel(req.user, id)
  }
}
