import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { resolveRange } from '@teahour/shared';
import { StaffGuard } from '../auth/staff.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerm, Staff } from '../auth/decorators';
import { parseInput } from '../common/zod';
import { badRequest } from '../common/errors';
import { assertStoreAccess, type StaffContext } from '../common/auth.types';
import { OrdersService } from '../orders/orders.service';
import { FinanceService } from '../finance/finance.service';
import { ExpensesService } from '../finance/expenses.service';
import { LossesService } from '../losses/losses.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { CatalogService } from '../catalog/catalog.service';
import { AdminService } from '../admin/admin.service';
import { HardwareService } from '../hardware/hardware.module';
import { AuthService } from '../auth/auth.service';

const itemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1).max(20),
  temp: z.string().max(20).nullable().optional(),
  ice: z.string().max(20).nullable().optional()
});

@Controller('store')
@UseGuards(StaffGuard, PermissionsGuard)
export class StoreController {
  constructor(
    private readonly orders: OrdersService,
    private readonly finance: FinanceService,
    private readonly expenses: ExpensesService,
    private readonly losses: LossesService,
    private readonly approvals: ApprovalsService,
    private readonly catalog: CatalogService,
    private readonly admin: AdminService,
    private readonly hardware: HardwareService,
    private readonly auth: AuthService
  ) {}

  private async ensureOrderAccess(staff: StaffContext, orderId: string) {
    const order = await this.orders.getOrderRow(orderId);
    if (order.business !== 'retail') assertStoreAccess(staff, order.storeId);
    return order;
  }

  @Get('overview')
  @RequirePerm('order:view')
  async overview(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ storeId: z.string().min(1) }), query);
    assertStoreAccess(staff, input.storeId);
    const range = resolveRange({ range: 'today' });
    const entries = await this.finance.list({ range, storeIds: [input.storeId] });
    const summary = this.finance.summary(entries);
    const expenses = await this.expenses.list({ storeIds: [input.storeId], range, limit: 100 });
    return {
      storeId: input.storeId,
      date: range.fromDate,
      queue: await this.orders.storeQueue(input.storeId),
      finance: summary,
      opexCents: expenses.reduce((n, x) => n + x.amountCents, 0),
      expenses,
      approvals: await this.approvals.counts([input.storeId])
    };
  }

  /**
   * 员工目录视图：营业台代点/报损/杯贴需要投茶量（doseGrams），
   * 与顾客公共目录（SEC-02 剥离版）分视图；登录 + 门店范围即可读，不放开成本字段。
   */
  @Get('catalog')
  async staffCatalog(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ storeId: z.string().min(1) }), query);
    assertStoreAccess(staff, input.storeId);
    const stores = await this.catalog.listStores();
    if (!stores.some((store) => store.id === input.storeId)) throw badRequest('门店不存在');
    return {
      stores,
      ...(await this.catalog.catalogForStoreStaff(input.storeId)),
      retail: await this.catalog.retailAvailability(),
      hardware: {
        payment: this.hardware.payment.mode,
        member: this.hardware.member.mode,
        printer: this.hardware.printer.mode,
        teaMachine: this.hardware.teaMachine.mode
      }
    };
  }

  @Get('queue')
  @RequirePerm('pos:use')
  async queue(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ storeId: z.string().min(1) }), query);
    assertStoreAccess(staff, input.storeId);
    return this.orders.storeQueue(input.storeId);
  }

  @Get('orders')
  @RequirePerm('order:view')
  async listOrders(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        storeId: z.string().optional(),
        status: z.string().optional(),
        business: z.string().optional(),
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(300).optional()
      }),
      query ?? {}
    );
    let storeIds: string[];
    if (staff.allStores) {
      storeIds = input.storeId ? [input.storeId] : (await this.catalog.listStores()).map((store) => store.id);
    } else if (input.storeId) {
      assertStoreAccess(staff, input.storeId);
      storeIds = [input.storeId];
    } else {
      storeIds = staff.storeIds;
    }
    return {
      orders: await this.orders.listOrders({
        storeIds,
        status: input.status,
        business: input.business,
        q: input.q,
        limit: input.limit
      })
    };
  }

  @Post('orders')
  @RequirePerm('pos:use')
  async createOrder(@Body() body: unknown, @Staff() staff: StaffContext, @Req() req: Request) {
    const input = parseInput(
      z.object({
        storeId: z.string().min(1),
        business: z.enum(['fresh', 'retail']).default('fresh'),
        type: z.enum(['dine', 'takeaway', 'delivery', 'retail']),
        seat: z.string().max(30).nullable().optional(),
        items: z.array(itemSchema).min(1).max(30),
        note: z.string().max(200).optional(),
        paymentMethod: z.enum(['wechat', 'alipay', 'cash']).default('wechat'),
        // qr=顾客扫我们的收款码；scan=我们扫顾客的付款码；缺省按渠道能力选 qr。
        payMode: z.enum(['qr', 'scan']).optional(),
        /** 顾客付款码：只透传给渠道，不落库、不写日志。 */
        authCode: z.string().trim().min(6).max(64).optional(),
        memberCode: z.string().max(40).optional(),
        // 营业台断网/双击重试时用同一个键：同键同内容返回原单，同键异内容 409。
        idempotencyKey: z.string().trim().min(4).max(64).optional()
      }),
      body
    );
    if (input.paymentMethod === 'cash' && input.payMode === 'scan') {
      throw badRequest('现金收款不需要扫描付款码');
    }
    if (input.payMode === 'scan' && input.paymentMethod === 'cash') {
      throw badRequest('请选择微信或支付宝后再扫付款码');
    }
    assertStoreAccess(staff, input.storeId);
    const business = input.business ?? 'fresh';
    let memberDiscountPerCupCents = 0;
    if (input.memberCode && business === 'fresh') {
      const benefit = await this.auth.memberBenefitByCode(input.memberCode);
      if (!benefit) throw badRequest('会员码无效，请重新扫码或改为标准价收款');
      memberDiscountPerCupCents = benefit.discountPerCupCents;
    }
    const result = await this.orders.createOrder({
      ...input,
      business,
      channel: 'assisted',
      ownerKind: 'guest',
      memberDiscountPerCupCents,
      actor: staff,
      clientIp: req.ip
    });
    return { order: result.order, printError: result.printError, payment: result.payment };
  }

  /** 代点支付状态轮询：顾客扫完收款码后，营业台据此确认到账。 */
  @Get('orders/:id/payment')
  @RequirePerm('pos:use')
  async paymentStatus(@Param('id') id: string, @Staff() staff: StaffContext) {
    const order = await this.orders.getOrderRow(id);
    if (order.business !== 'retail') assertStoreAccess(staff, order.storeId);
    const status = await this.orders.refreshPaymentStatus(order);
    return { ...status, order: await this.orders.getOrder(id) };
  }

  /** 顾客迟迟未付款时取消代点单：释放库存与锁定的券；已支付订单必须走退款。 */
  @Post('orders/:id/cancel')
  @RequirePerm('pos:use')
  async cancelUnpaid(@Param('id') id: string, @Staff() staff: StaffContext) {
    return { order: await this.orders.cancelUnpaidByStaff(staff, id) };
  }

  /** 代点时扫顾客会员码：只识别权益，不读取个人资料。 */
  @Post('member/verify')
  @RequirePerm('pos:use')
  async verifyMember(@Body() body: unknown) {
    const input = parseInput(z.object({ code: z.string().trim().min(1).max(40) }), body);
    const benefit = await this.auth.memberBenefitByCode(input.code);
    if (!benefit) throw badRequest('会员码无效，请重新扫码或改为标准价收款');
    return { benefit, mode: 'db' };
  }

  @Get('orders/:id')
  @RequirePerm('order:view')
  async getOrder(@Param('id') id: string, @Staff() staff: StaffContext) {
    await this.ensureOrderAccess(staff, id);
    return { order: await this.orders.getOrder(id), logs: await this.orders.orderLogs(id) };
  }

  @Post('scan')
  @RequirePerm('pos:use')
  async scan(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ code: z.string().min(1) }), body);
    return { order: await this.orders.scanCupLabel(staff, input.code) };
  }

  @Post('orders/:id/scan')
  @RequirePerm('pos:use')
  async scanUnit(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ unitId: z.string().min(1) }), body);
    await this.ensureOrderAccess(staff, id);
    return { order: await this.orders.scanUnitById(staff, id, input.unitId) };
  }

  /** 待取餐订单确认已取餐：顾客侧无需再扫码，门店据此归档。 */
  @Post('orders/:id/deliver')
  @RequirePerm('pos:use')
  async deliverFresh(@Param('id') id: string, @Staff() staff: StaffContext) {
    return { order: await this.orders.deliverFresh(staff, id) };
  }

  @Post('orders/:id/reprint')
  @RequirePerm('pos:use')
  async reprint(@Param('id') id: string, @Staff() staff: StaffContext) {
    await this.ensureOrderAccess(staff, id);
    return this.orders.reprintOrder(staff, id);
  }

  @Post('orders/:id/remake')
  @RequirePerm('pos:use')
  async remake(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({ reason: z.string().max(120).optional() }).optional(),
      body ?? {}
    );
    await this.ensureOrderAccess(staff, id);
    return { order: await this.orders.remakeOrder(staff, id, input?.reason) };
  }

  @Post('orders/:id/refund')
  async refund(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z
        .object({
          items: z.array(z.object({ itemId: z.string(), qty: z.number().int().min(1) })).optional(),
          reason: z.string().max(120).optional()
        })
        .optional(),
      body ?? {}
    );
    await this.ensureOrderAccess(staff, id);
    return this.orders.requestRefund(staff, id, { lines: input?.items, reason: input?.reason });
  }

  /** 退款收敛重试（TX-04）：渠道响应未知的退款单复用同一退款单号重试。 */
  @Post('refunds/:id/retry')
  async retryRefund(@Param('id') id: string, @Staff() staff: StaffContext) {
    return this.orders.retryRefundIntent(staff, id);
  }

  @Post('retail/lookup')
  @RequirePerm('retail:handover')
  async retailLookup(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ code: z.string().min(1) }), body);
    return { order: await this.orders.retailLookup(staff, input.code) };
  }

  @Post('retail/:id/deliver')
  @RequirePerm('retail:handover')
  async deliverRetail(@Param('id') id: string, @Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ storeId: z.string().min(1), code: z.string().min(1) }), body);
    return { order: await this.orders.deliverRetail(staff, { orderId: id, ...input }) };
  }

  @Get('inventory')
  @RequirePerm('store:stock')
  async inventory(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ storeId: z.string().min(1) }), query);
    assertStoreAccess(staff, input.storeId);
    return { items: await this.catalog.stockForStore(input.storeId) };
  }

  @Put('inventory')
  @RequirePerm('store:stock')
  async updateInventory(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        storeId: z.string().min(1),
        items: z
          .array(
            z.object({
              productId: z.string().min(1),
              grams: z.number().min(0).max(1_000_000).optional(),
              soldOut: z.boolean().optional()
            })
          )
          .min(1)
      }),
      body
    );
    assertStoreAccess(staff, input.storeId);
    return { items: await this.catalog.updateStock(input.storeId, input.items) };
  }

  /** 本店茶单顺序：覆盖总部默认顺序，只影响当前门店。 */
  @Put('inventory/order')
  @RequirePerm('store:stock')
  async updateInventoryOrder(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({ storeId: z.string().min(1), productIds: z.array(z.string().min(1)).min(1).max(200) }),
      body
    );
    assertStoreAccess(staff, input.storeId);
    return { items: await this.catalog.updateStoreOrder(input.storeId, input.productIds) };
  }

  /** 恢复总部顺序：清除本店覆盖。 */
  @Delete('inventory/order')
  @RequirePerm('store:stock')
  async resetInventoryOrder(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ storeId: z.string().min(1) }), query);
    assertStoreAccess(staff, input.storeId);
    return { items: await this.catalog.resetStoreOrder(input.storeId) };
  }

  @Get('losses')
  @RequirePerm('loss:report')
  async losses_(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(z.object({ storeId: z.string().min(1), status: z.string().optional() }), query);
    assertStoreAccess(staff, input.storeId);
    return {
      losses: await this.losses.list({
        storeIds: [input.storeId],
        status: input.status,
        limit: 100
      }),
      policy: await this.losses.getPolicy(),
      summary: await this.losses.summary({ storeIds: [input.storeId] })
    };
  }

  @Post('losses')
  @RequirePerm('loss:report')
  async reportLoss(@Body() body: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        storeId: z.string().min(1),
        productId: z.string().min(1),
        qty: z.coerce.number().positive(),
        reason: z.string().min(1).max(120),
        note: z.string().max(200).optional()
      }),
      body
    );
    return { loss: await this.losses.report(staff, input) };
  }

  @Get('devices')
  @RequirePerm('store:device')
  async devices() {
    return { devices: await this.losses.deviceStatuses() };
  }

  @Get('logs')
  @RequirePerm('log:view')
  async logs(@Query() query: unknown, @Staff() staff: StaffContext) {
    const input = parseInput(
      z.object({
        storeId: z.string().min(1),
        q: z.string().optional(),
        limit: z.coerce.number().int().optional()
      }),
      query
    );
    assertStoreAccess(staff, input.storeId);
    return {
      logs: await this.admin.listLogs({
        storeIds: [input.storeId],
        q: input.q,
        limit: input.limit || 100
      })
    };
  }
}
