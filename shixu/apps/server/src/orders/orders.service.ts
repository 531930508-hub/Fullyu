import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, type Order, type OrderItem, type OrderUnit, type PaymentIntent, type Product, type RefundIntent } from '@prisma/client';
import { cupLabel, newId, nextSequence, uniquePickupCode, dayStamp } from '../common/ids';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { assertStoreAccess, hasPerm, type StaffContext } from '../common/auth.types';
import { logAction } from '../common/logs';
import { mapOrder } from '../common/mappers';
import { PrismaService } from '../common/prisma.service';
import { HardwareService } from '../hardware/hardware.module';
import { FinanceService, saleMethod } from '../finance/finance.service';
import { PrintingService } from '../printing/printing.service';
import { CouponsService, type ResolvedCoupon } from '../coupons/coupons.service';
import { ICE_OPTIONS } from '@teahour/shared';
import type { PaymentState } from '@teahour/integrations';

export type OrderLineInput = {
  productId: string;
  qty: number;
  temp?: string | null;
  ice?: string | null;
};

export type CreateOrderInput = {
  storeId?: string;
  business: 'fresh' | 'retail';
  channel: 'mini' | 'assisted' | 'meituan' | 'taobao';
  type: 'dine' | 'takeaway' | 'delivery' | 'retail';
  seat?: string | null;
  items: OrderLineInput[];
  note?: string;
  customerId?: string | null;
  ownerKind?: 'customer' | 'guest';
  memberDiscountPerCupCents?: number;
  /** 顾客持券实例 ID：服务端核验归属、状态、有效期与门槛后抵扣。 */
  couponId?: string | null;
  paymentMethod?: 'wechat' | 'alipay' | 'cash';
  /** 营业台收款方式：qr=顾客扫我们的收款码；scan=我们扫顾客的付款码。仅代点使用。 */
  payMode?: 'qr' | 'scan';
  /** 顾客付款码（scan 模式）：一次性使用，服务端不落库、不写日志。 */
  authCode?: string;
  actor?: StaffContext;
  externalRef?: string;
  /** 发起支付的客户端 IP，用于渠道风控字段（可空）。 */
  clientIp?: string;
  /** 客户端幂等键：同键同内容重试返回同单，同键异内容冲突；缺省由服务端生成自动键。 */
  idempotencyKey?: string;
  /** 内部使用：失败重试复用同一订单时，允许该单已锁定的券继续核验。 */
  retryOrderId?: string;
};

export type RefundLineInput = { itemId: string; qty: number };

/**
 * 代点/小程序在异步渠道下的收款提示：
 * - qr：把 qrCode 画成二维码给顾客扫；
 * - scan：已扫顾客付款码，paid 表示已扣款，processing 表示渠道处理中；
 * - prepay：小程序需要继续调预支付接口拿 wx.requestPayment 参数；
 * - cash/none：已直接完成。
 */
export type OrderPaymentPrompt =
  | { kind: 'qr'; method: 'wechat' | 'alipay'; qrCode: string; status: 'pending' }
  | {
      kind: 'scan';
      method: 'wechat' | 'alipay';
      status: 'paid' | 'processing';
      providerRef?: string;
    }
  | { kind: 'prepay'; method: 'wechat' | 'alipay' }
  | { kind: 'cash'; status: 'paid' }
  | { kind: 'none'; status: 'paid' };

export type CreateOrderResult = {
  order: Awaited<ReturnType<OrdersService['getOrder']>>;
  printError?: string;
  payment?: OrderPaymentPrompt;
};

type PreparedLine = {
  product: Product;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  costCents: number;
  temp: string | null;
  ice: string | null;
};

const ORDER_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  units: { orderBy: { label: 'asc' as const } }
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hardware: HardwareService,
    private readonly finance: FinanceService,
    private readonly printing: PrintingService,
    private readonly coupons: CouponsService
  ) {}

  async getOrderRow(id: string): Promise<Order> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    if (!row) throw notFound('订单不存在');
    return row;
  }

  private async storeName(id: string): Promise<string> {
    if (id === 'brand') return '品牌零售';
    const row = await this.prisma.store.findUnique({ where: { id } });
    return row?.name || id;
  }

  async getOrder(id: string) {
    const row = await this.getOrderRow(id);
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw notFound('订单不存在');
    return mapOrder(order, order.items, order.units, await this.storeName(row.storeId));
  }

  private assertStaffStore(user: StaffContext | undefined, storeId: string): void {
    if (!user) throw forbidden('需要员工身份');
    assertStoreAccess(user, storeId);
  }

  private async nextFreshNumber(storeId: string, remake: boolean): Promise<string> {
    const prefix = remake ? 'R' : storeId.startsWith('sh') ? 'A' : 'B';
    for (let i = 0; i < 20; i += 1) {
      const value = await nextSequence(this.prisma, `order:${prefix}`);
      const number = `${prefix}${String(value).padStart(3, '0')}`;
      const exists = await this.prisma.order.findUnique({ where: { number } });
      if (!exists) return number;
    }
    throw conflict('订单号生成冲突，请重试');
  }

  private async nextRetailNumber(now: number): Promise<string> {
    const stamp = dayStamp(now);
    for (let i = 0; i < 100; i += 1) {
      const value = await nextSequence(this.prisma, `retail:${stamp}`);
      const number = `TH-R-${stamp}-${String(value).padStart(4, '0')}`;
      const exists = await this.prisma.order.findUnique({ where: { number } });
      if (!exists) return number;
    }
    throw conflict('零售订单号生成冲突，请重试');
  }

  /** 规范化并校验温冰组合（TX-13）：温度须在商品允许列表内，冰量须在枚举内且商品支持。 */
  private normalizeTeaOptions(
    product: Product,
    line: OrderLineInput
  ): { temp: string | null; ice: string | null } {
    if (product.kind !== 'tea') {
      if (line.temp || line.ice) throw badRequest(`${product.name} 不支持温冰选项`);
      return { temp: null, ice: null };
    }
    let temps: string[] = [];
    try {
      temps = JSON.parse(product.tempsJson) as string[];
    } catch {
      temps = [];
    }
    if (!temps.length) temps = ['热'];
    const temp = line.temp || (temps.includes('热') ? '热' : temps[0]);
    if (!temps.includes(temp)) throw badRequest(`${product.name} 不支持“${line.temp}”，可选：${temps.join('/')}`);
    if (!product.ice) {
      // 旧版客户端会把“不选冰量”占位成“热饮”；它不是真实冰量选项，落库时清理掉。
      if (line.ice && line.ice !== '热饮') throw badRequest(`${product.name} 不支持冰量选择`);
      return { temp, ice: null };
    }
    if (temp === '热') {
      // V7 口径：热饮隐藏冰量选择，落库统一为标准冰占位；兼容旧客户端的“热饮”占位。
      if (line.ice && line.ice !== '标准冰' && line.ice !== '热饮') {
        throw badRequest('热饮不支持选择冰量');
      }
      return { temp, ice: '标准冰' };
    }
    const ice = line.ice || '标准冰';
    if (!(ICE_OPTIONS as readonly string[]).includes(ice)) {
      throw badRequest(`${product.name} 冰量选项无效，可选：${ICE_OPTIONS.join('/')}`);
    }
    return { temp, ice };
  }

  private async prepareLines(input: CreateOrderInput, storeId: string) {
    if (!Array.isArray(input.items) || !input.items.length) throw badRequest('订单没有商品');
    if (input.items.length > 30) throw badRequest('单次最多 30 个商品行');
    for (const line of input.items) {
      const qty = Number(line.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw badRequest('商品数量须为 1–20 的整数');
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: [...new Set(input.items.map((line) => line.productId))] } }
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // 行键 = 商品 + 规范化温冰：同款不同温冰保持独立行（TX-13），同规格合并数量。
    const merged = new Map<
      string,
      { product: Product; qty: number; temp: string | null; ice: string | null }
    >();
    for (const line of input.items) {
      const qty = Number(line.qty);
      const product = productMap.get(line.productId);
      if (!product) throw badRequest(`商品不存在：${line.productId}`);
      if (product.status !== 'published') throw badRequest(`${product.name} 已下架`);
      if (input.business === 'fresh' && product.kind !== 'tea') {
        throw badRequest('鲜酿订单只能包含现制茶饮；零售商品请单独下单');
      }
      if (input.business === 'retail' && product.kind === 'tea') {
        throw badRequest('现制茶饮请使用鲜酿下单');
      }
      const { temp, ice } = this.normalizeTeaOptions(product, line);
      const key = `${line.productId}|${temp ?? ''}|${ice ?? ''}`;
      const existing = merged.get(key);
      if (existing) {
        existing.qty += qty;
        if (existing.qty > 20) throw badRequest('同一商品单次最多 20 件');
      } else {
        merged.set(key, { product, qty, temp, ice });
      }
    }
    const stocks = await this.prisma.stock.findMany({
      where: { storeId, productId: { in: [...new Set(input.items.map((line) => line.productId))] } }
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s]));

    const lines: PreparedLine[] = [];
    let grossCents = 0;
    let discountCents = 0;
    let costCents = 0;
    for (const mergedLine of merged.values()) {
      const product = mergedLine.product;
      const stock = stockMap.get(product.id);
      if (input.business === 'fresh') {
        if (!stock || stock.soldOut) throw conflict(`${product.name} 在本店已售罄`);
        if (stock.grams < product.doseG * mergedLine.qty) throw conflict(`${product.name} 本店库存不足`);
      }
      const discount =
        input.business === 'fresh' &&
        (input.channel === 'mini' || input.channel === 'assisted') &&
        product.memberEligible &&
        input.memberDiscountPerCupCents
          ? Math.min(Math.max(0, Math.round(input.memberDiscountPerCupCents)), product.priceCents)
          : 0;
      const unitPriceCents = product.priceCents - discount;
      grossCents += product.priceCents * mergedLine.qty;
      discountCents += discount * mergedLine.qty;
      costCents += product.costCents * mergedLine.qty;
      lines.push({
        product,
        qty: mergedLine.qty,
        unitPriceCents,
        totalCents: unitPriceCents * mergedLine.qty,
        costCents: product.costCents * mergedLine.qty,
        temp: mergedLine.temp,
        ice: mergedLine.ice
      });
    }

    // 优惠券：按券的品类范围计算可用小计（会员每杯减免之后），门槛与面额都由服务端核验。
    let coupon: ResolvedCoupon | null = null;
    let couponDiscountCents = 0;
    if (input.couponId) {
      if (!input.customerId) throw badRequest('使用优惠券需要先登录会员');
      const resolved = await this.coupons.resolveForOrder({
        customerId: input.customerId,
        couponId: input.couponId,
        retryOrderId: input.retryOrderId,
        lines: lines.map((line) => ({
          categoryId: line.product.categoryId,
          totalCents: line.totalCents
        }))
      });
      coupon = resolved;
      couponDiscountCents = Math.min(resolved.discountCents, grossCents - discountCents);
    }

    return {
      lines,
      coupon,
      grossCents,
      discountCents,
      couponDiscountCents,
      totalCents: Math.max(0, grossCents - discountCents - couponDiscountCents),
      costCents
    };
  }

  private async createUnpaidOrder(
    input: CreateOrderInput,
    storeId: string,
    prepared: Awaited<ReturnType<OrdersService['prepareLines']>>,
    fixedId?: string
  ): Promise<string> {
    const now = new Date();
    const id = fixedId || newId('SO');
    const number =
      input.business === 'retail' ? await this.nextRetailNumber(now.getTime()) : await this.nextFreshNumber(storeId, false);
    const external = input.channel === 'meituan' || input.channel === 'taobao';
    const dbStoreId = input.business === 'retail' ? 'brand' : storeId;
    const storeLabel = await this.storeName(dbStoreId);

    await this.prisma.$transaction(async (tx) => {
      if (input.business === 'fresh') {
        for (const line of prepared.lines) {
          const result = await tx.stock.updateMany({
            where: {
              storeId,
              productId: line.product.id,
              grams: { gte: line.product.doseG * line.qty }
            },
            data: { grams: { decrement: line.product.doseG * line.qty } }
          });
          if (!result.count) throw conflict(`${line.product.name} 本店库存不足`);
        }
      }
      await tx.order.create({
        data: {
          id,
          number,
          business: input.business,
          storeId: dbStoreId,
          channel: input.channel,
          type: input.business === 'retail' ? 'retail' : input.type,
          seat: input.type === 'dine' ? input.seat || '' : null,
          status: 'unpaid',
          paymentStatus: 'unpaid',
          totalCents: prepared.totalCents,
          refundedCents: 0,
          pickupCode: null,
          pickupStoreId: null,
          printStatus: 'pending',
          parentOrderId: null,
          note: String(input.note || '').slice(0, 200),
          couponId: prepared.coupon?.id || null,
          couponTitle: prepared.coupon?.title || null,
          couponDiscountCents: prepared.couponDiscountCents,
          customerId: input.customerId || null,
          ownerKind: input.ownerKind || 'customer',
          createdBy: input.actor?.id || null,
          paymentRef: null,
          paymentMethod: input.paymentMethod || (external ? null : 'wechat'),
          createdAt: now
        }
      });
      // 券在同一个事务内锁定：条件更新保证并发下单时同一张券只有一单能占到。
      if (prepared.coupon) {
        const reserved = await tx.customerCoupon.updateMany({
          where: {
            id: prepared.coupon.id,
            status: { in: ['available', 'reserved'] },
            OR: [{ orderId: null }, { orderId: id }]
          },
          data: { status: 'reserved', orderId: id }
        });
        if (!reserved.count) throw conflict('优惠券已被使用，请重新选择');
      }
      let sortOrder = 0;
      for (const line of prepared.lines) {
        sortOrder += 1;
        await tx.orderItem.create({
          data: {
            id: newId('OI'),
            orderId: id,
            productId: line.product.id,
            name: line.product.name,
            nameEn: line.product.nameEn,
            kind: line.product.kind,
            series: line.product.series,
            qty: line.qty,
            sortOrder,
            refundedQty: 0,
            unitPriceCents: line.unitPriceCents,
            totalCents: line.totalCents,
            costCents: line.costCents,
            temp: line.temp,
            ice: line.ice
          }
        });
      }
      await logAction(tx, {
        actorId: input.actor?.id || null,
        actorName: input.actor?.name || (input.ownerKind === 'customer' ? '顾客' : '系统'),
        action: external ? '接收平台订单' : '提交订单',
        detail: `${number} · ${storeLabel}`,
        type: 'order',
        storeId: dbStoreId,
        orderId: id
      });
    });
    return id;
  }

  private async assignPickupCode(db: Prisma.TransactionClient = this.prisma): Promise<string> {
    const rows = await db.order.findMany({
      where: { business: 'retail', status: 'awaiting', pickupCode: { not: null } },
      select: { pickupCode: true }
    });
    const taken = new Set(rows.map((row) => row.pickupCode).filter(Boolean) as string[]);
    return uniquePickupCode((code) => taken.has(code));
  }

  private methodLabel(method: string): string {
    if (method === 'cash') return '现金';
    if (method === 'alipay') return '支付宝';
    return '微信支付';
  }

  /**
   * 支付成功落账（TX-03 状态机）。
   * - applied：未支付订单被正常置为已支付；
   * - duplicate：重复通知幂等跳过，不重复记账；
   * - blocked-cancelled：已取消订单收到迟到支付成功，拒绝复活；
   *   资金去向写入日志与待办口径（人工退款/对账），绝不静默把取消单改回已支付。
   */
  async markPaid(orderId: string, paymentRef: string): Promise<'applied' | 'duplicate' | 'blocked-cancelled'> {
    const now = new Date();
    let outcome: 'applied' | 'duplicate' | 'blocked-cancelled' = 'applied';
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw notFound('订单不存在');
      if (order.paymentStatus === 'paid') {
        outcome = 'duplicate';
        return;
      }
      if (order.status === 'cancelled') {
        outcome = 'blocked-cancelled';
        await logAction(tx, {
          actorName: '支付网关',
          action: '迟到支付成功拦截',
          detail: `${order.number} · 已取消订单收到支付成功通知 ¥${(order.totalCents / 100).toFixed(2)}，资金待人工退款/对账，未复活订单`,
          type: 'payment',
          storeId: order.storeId,
          orderId,
          at: now.getTime()
        });
        return;
      }
      const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { sortOrder: 'asc' } });
      const method = saleMethod({
        channel: order.channel,
        paymentMethod: order.paymentMethod ? this.methodLabel(order.paymentMethod) : null
      });
      const pickupCode = order.business === 'retail' ? await this.assignPickupCode(tx) : null;
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: order.business === 'retail' ? 'awaiting' : 'pending',
          paymentStatus: 'paid',
          paidAt: now,
          paymentRef,
          pickupCode,
          printStatus: order.business === 'retail' ? 'none' : 'queued'
        }
      });
      // 支付成功：锁定中的券转为已使用，之后不能再被任何订单占用。
      if (order.couponId) {
        await tx.customerCoupon.updateMany({
          where: { id: order.couponId, orderId, status: 'reserved' },
          data: { status: 'used', usedAt: now }
        });
      }
      if (order.business === 'fresh') {
        let cup = 0;
        for (const item of items) {
          for (let i = 0; i < item.qty; i += 1) {
            cup += 1;
            await tx.orderUnit.create({
              data: {
                id: newId('U'),
                orderId,
                itemId: item.id,
                label: cupLabel(order.number, cup),
                status: 'pending'
              }
            });
          }
        }
      }
      await this.finance.addEntry(
        {
          orderId,
          storeId: order.business === 'retail' ? 'brand' : order.storeId,
          type: 'SALE',
          amountCents: order.totalCents,
          method: method.method,
          settlement: method.settlement,
          memo: order.business === 'retail' ? '零售订单收款' : '订单收款',
          costCents: items.reduce((n, x) => n + x.costCents, 0),
          dedupeKey: `ORDER:${orderId}:SALE`,
          at: now.getTime()
        },
        tx
      );
      await logAction(tx, {
        actorName: '支付网关',
        action: '支付成功',
        detail: `${order.number} · ¥${(order.totalCents / 100).toFixed(2)}`,
        type: 'payment',
        storeId: order.business === 'retail' ? 'brand' : order.storeId,
        orderId,
        at: now.getTime()
      });
    });
    if (outcome !== 'applied') return outcome;
    if ((await this.getOrderRow(orderId)).business === 'fresh') {
      await this.printing.enqueue(orderId);
    }
    return outcome;
  }

  /**
   * 支付失败落账（TX-03 状态机）。
   * - 已支付订单收到迟到失败通知：保持已支付状态，仅留痕；
   * - 已取消订单重复收到失败通知：幂等跳过，库存不得二次回补；
   * - 只有未支付订单才允许取消并回补库存。
   */
  private async markPaymentFailed(orderId: string, reason: string, actorName = '支付网关'): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw notFound('订单不存在');
      if (order.paymentStatus === 'paid') {
        await logAction(tx, {
          actorName,
          action: '迟到支付失败忽略',
          detail: `${order.number} · ${reason}（订单已支付，保持原状态，不动资金与库存）`,
          type: 'payment',
          storeId: order.storeId,
          orderId
        });
        return;
      }
      if (order.status === 'cancelled') return;
      const items = await tx.orderItem.findMany({ where: { orderId } });
      if (order.business === 'fresh') {
        for (const item of items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (product?.kind === 'tea') {
            await tx.stock.updateMany({
              where: { storeId: order.storeId, productId: item.productId },
              data: { grams: { increment: product.doseG * item.qty } }
            });
          }
        }
      }
      await tx.order.update({ where: { id: orderId }, data: { status: 'cancelled', paymentStatus: 'failed' } });
      // 支付失败：释放本单锁定的券，顾客可在重试或其他订单继续使用。
      await tx.customerCoupon.updateMany({
        where: { orderId, status: 'reserved' },
        data: { status: 'available', orderId: null }
      });
      await logAction(tx, {
        actorName,
        action: '支付失败',
        detail: `${order.number} · ${reason}`,
        type: 'payment',
        storeId: order.storeId,
        orderId
      });
    });
  }

  /**
   * 小程序预支付：异步渠道（汇付）用真实 jspay 参数；仍是 mock 时沿用微信适配层的模拟回执，
   * 并如实返回 prepayMode，客户端据此决定是否调用 wx.requestPayment。
   */
  async prepayOrder(input: {
    orderId: string;
    customerId: string;
    openId: string;
    clientIp?: string;
  }): Promise<{
    paid: boolean;
    payment?: { timeStamp: string; nonceStr: string; package: string; signType: 'RSA' | 'MD5'; paySign: string };
    mode: string;
    prepayMode: string;
  }> {
    const order = await this.customerOrder(input.customerId, input.orderId);
    const gateway = this.hardware.payment;
    // 异步渠道下已支付无需再预下单；同步渠道（mock）保持原行为，仍返回模拟支付参数供联调。
    if (order.paymentStatus === 'paid' && gateway.asyncPayments) {
      return { paid: true, mode: gateway.mode, prepayMode: 'live' };
    }
    if (order.status === 'cancelled') throw conflict('订单已取消，请重新下单');
    if (!input.openId) throw badRequest('请先使用微信登录后再发起支付');

    const common = {
      openId: input.openId,
      orderId: order.id,
      orderNumber: order.number,
      amountCents: order.totalCents,
      description: `时叙 ${order.number}`,
      storeId: order.storeId,
      clientIp: input.clientIp
    };

    if (gateway.asyncPayments && gateway.prepay) {
      const result = await gateway.prepay(common);
      if (!result.ok || !result.payment) throw badRequest(result.error || '支付参数获取失败');
      return { paid: false, payment: result.payment, mode: gateway.mode, prepayMode: 'live' };
    }

    const result = await this.hardware.wechat.prepay(common);
    if (!result.ok || !result.payment) throw badRequest(result.error || '支付参数获取失败');
    return {
      paid: false,
      payment: result.payment,
      mode: this.hardware.wechat.mode,
      prepayMode: this.hardware.wechat.prepayMode || this.hardware.wechat.mode
    };
  }

  /** 顾客放弃支付：仅未支付订单可取消，回补库存并释放锁定的券；已支付订单拒绝取消。 */
  async cancelUnpaidOrder(customerId: string, orderId: string) {
    const order = await this.customerOrder(customerId, orderId);
    if (order.paymentStatus === 'paid') throw conflict('订单已支付，不能取消');
    if (order.status !== 'cancelled') {
      await this.markPaymentFailed(orderId, '顾客取消支付');
    }
    return this.getOrder(orderId);
  }

  /** 营业台取消未支付代点单：顾客未付款或长期未扫，释放库存与锁定的券。已支付订单必须走退款。 */
  async cancelUnpaidByStaff(staff: StaffContext, orderId: string) {
    const order = await this.getOrderRow(orderId);
    if (order.business !== 'retail') this.assertStaffStore(staff, order.storeId);
    if (order.paymentStatus === 'paid') throw conflict('订单已支付，请通过退款处理');
    if (order.status !== 'cancelled') {
      await this.markPaymentFailed(orderId, `营业台取消（${staff.name}）`, `营业台 · ${staff.name}`);
    }
    await this.prisma.paymentIntent.updateMany({
      where: { orderId, status: { in: ['processing', 'unknown'] } },
      data: { status: 'failed', failReason: '营业台取消未支付单', updatedAt: new Date() }
    });
    return this.getOrder(orderId);
  }

  /** 支付状态轮询：本地已支付/已取消直接返回；否则主动向渠道查询一次并收敛。 */
  async refreshPaymentStatus(order: Order, force = false): Promise<{
    paymentStatus: 'paid' | 'unpaid' | 'cancelled';
    gatewayStatus?: PaymentState;
    error?: string;
  }> {
    const row = await this.getOrderRow(order.id);
    if (row.paymentStatus === 'paid') return { paymentStatus: 'paid' };
    if (row.status === 'cancelled') return { paymentStatus: 'cancelled' };
    const gateway = this.hardware.payment;
    if (!gateway.asyncPayments || !gateway.query) return { paymentStatus: 'unpaid' };

    // 同一订单 2.5 秒内只查一次渠道，避免门店端轮询把查询接口打满。
    const last = this.lastQueryAt.get(row.id) || 0;
    if (!force && Date.now() - last < 2_500) {
      return { paymentStatus: 'unpaid', gatewayStatus: this.lastQueryState.get(row.id) };
    }
    this.lastQueryAt.set(row.id, Date.now());

    let result;
    try {
      result = await gateway.query({
        orderId: row.id,
        storeId: row.storeId,
        method: (row.paymentMethod === 'alipay' ? 'alipay' : 'wechat') as 'wechat' | 'alipay',
        requestedAt: row.createdAt.getTime()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { paymentStatus: 'unpaid', gatewayStatus: 'pending', error: message };
    }
    this.lastQueryState.set(row.id, result.status);
    if (result.status === 'paid') {
      const providerRef = result.providerRef || `HF-${row.id}`;
      await this.markPaid(row.id, providerRef);
      await this.prisma.paymentIntent.updateMany({
        where: { orderId: row.id, status: { in: ['processing', 'unknown', 'failed'] } },
        data: { status: 'succeeded', providerRef, updatedAt: new Date() }
      });
      await this.processQueuedPrint(row.id);
      return { paymentStatus: 'paid', gatewayStatus: 'paid' };
    }
    // 渠道已关闭/失败：确认没有收到款，释放库存与优惠券，订单落为已取消。
    if (result.status === 'failed' || result.status === 'closed') {
      const reason = result.error || '渠道交易已关闭，未收款';
      await this.markPaymentFailed(row.id, reason);
      await this.prisma.paymentIntent.updateMany({
        where: { orderId: row.id, status: { in: ['processing', 'unknown'] } },
        data: { status: 'failed', failReason: reason, updatedAt: new Date() }
      });
      return { paymentStatus: 'cancelled', gatewayStatus: result.status };
    }
    return { paymentStatus: 'unpaid', gatewayStatus: result.status, error: result.ok ? undefined : result.error };
  }

  /**
   * 支付回调落账前的业务校验：
   * 1) 金额必须与订单应付一致；2) 子商户号必须与订单门店配置一致。
   * 任一不符都拒绝落账并留痕——宁可人工核对，也不能把别的门店/别的金额的款记到这单上。
   */
  private async assertCallbackMatchesOrder(
    order: Order,
    input: { amountCents?: number; merchantId?: string; label: string }
  ): Promise<void> {
    if (input.amountCents != null && input.amountCents !== order.totalCents) {
      await logAction(this.prisma, {
        actorName: '支付网关',
        action: `${input.label}金额不一致拦截`,
        detail: `${order.number} · 订单应付 ¥${(order.totalCents / 100).toFixed(2)}，回调 ¥${(input.amountCents / 100).toFixed(2)}，未落账`,
        type: 'payment',
        storeId: order.storeId,
        orderId: order.id
      });
      throw badRequest('回调金额与订单应付不一致，已拒绝落账，请人工核对');
    }
    const expected = this.hardware.payment.merchantFor?.(order.storeId) || '';
    if (input.merchantId && expected && input.merchantId !== expected) {
      await logAction(this.prisma, {
        actorName: '支付网关',
        action: `${input.label}子商户不一致拦截`,
        detail: `${order.number} · 订单门店 ${order.storeId} 应为 ${expected}，回调 ${input.merchantId}，未落账`,
        type: 'payment',
        storeId: order.storeId,
        orderId: order.id
      });
      throw badRequest('回调子商户与订单门店不一致，已拒绝落账，请人工核对');
    }
  }

  /** 渠道支付回调：校验通过后复用 markPaid 落账，并补出票。 */
  async settlePaymentCallback(input: {
    reference: string;
    providerRef?: string;
    amountCents?: number;
    merchantId?: string;
    status: PaymentState;
    error?: string;
  }): Promise<'applied' | 'duplicate' | 'blocked-cancelled' | 'failed' | 'ignored'> {
    const order = await this.prisma.order.findUnique({ where: { id: input.reference } });
    if (!order) {
      await logAction(this.prisma, {
        actorName: '支付网关',
        action: '支付回调找不到订单',
        detail: `${input.reference} · 已忽略，请核对该笔支付来源`,
        type: 'payment'
      });
      return 'ignored';
    }
    await this.assertCallbackMatchesOrder(order, {
      amountCents: input.amountCents,
      merchantId: input.merchantId,
      label: '支付回调'
    });
    if (input.status === 'paid') {
      const outcome = await this.markPaid(order.id, input.providerRef || `HF-${order.id}`);
      if (outcome === 'applied') {
        await this.prisma.paymentIntent.updateMany({
          where: { orderId: order.id, status: { in: ['processing', 'unknown', 'failed'] } },
          data: { status: 'succeeded', providerRef: input.providerRef || `HF-${order.id}`, updatedAt: new Date() }
        });
        await this.processQueuedPrint(order.id);
      }
      return outcome;
    }
    if (input.status === 'failed' || input.status === 'closed') {
      await this.markPaymentFailed(order.id, input.error || '渠道返回支付失败');
      return 'failed';
    }
    return 'ignored';
  }

  /** 渠道退款回调：成功后走既有 confirmRefund 落账；处理中保持占用。 */
  async applyRefundCallback(input: {
    reference: string;
    providerRef?: string;
    amountCents?: number;
    merchantId?: string;
    status: 'succeeded' | 'processing' | 'failed';
    error?: string;
  }): Promise<'succeeded' | 'processing' | 'failed' | 'ignored'> {
    const intent = await this.prisma.refundIntent.findUnique({ where: { id: input.reference } });
    if (!intent) {
      await logAction(this.prisma, {
        actorName: '支付网关',
        action: '退款回调找不到退款单',
        detail: `${input.reference} · 已忽略，请核对该笔退款来源`,
        type: 'refund'
      });
      return 'ignored';
    }
    const order = await this.getOrderRow(intent.orderId);
    const expected = this.hardware.payment.merchantFor?.(order.storeId) || '';
    if (input.merchantId && expected && input.merchantId !== expected) {
      await logAction(this.prisma, {
        actorName: '支付网关',
        action: '退款回调子商户不一致拦截',
        detail: `${intent.id} · 订单门店 ${order.storeId} 应为 ${expected}，回调 ${input.merchantId}`,
        type: 'refund',
        storeId: order.storeId,
        orderId: order.id
      });
      throw badRequest('退款回调子商户与订单门店不一致，已拒绝处理');
    }
    if (input.amountCents != null && input.amountCents !== intent.amountCents) {
      await logAction(this.prisma, {
        actorName: '支付网关',
        action:
          input.amountCents < intent.amountCents ? '退款回调金额不足拦截' : '退款回调金额超出拦截',
        detail: `${intent.id} · 应退 ¥${(intent.amountCents / 100).toFixed(2)}，回调 ¥${(input.amountCents / 100).toFixed(2)}`,
        type: 'refund',
        storeId: order.storeId,
        orderId: order.id
      });
      throw badRequest('退款回调金额与应退金额不一致，已拒绝处理，请人工核对');
    }
    if (intent.status === 'succeeded') return 'succeeded';
    // 确定失败/已释放后迟到的成功或处理中回调：钱可能真的出去了，但系统已按失败释放占用，
    // 此时自动落账会造成账实不符，一律拦截并留痕，等人工核对后处理。
    if (intent.status === 'failed' || intent.status === 'released') {
      if (input.status !== 'failed') {
        await logAction(this.prisma, {
          actorName: '支付网关',
          action: '退款成功回调晚到拦截',
          detail: `${intent.id} · 退款单已${intent.status === 'failed' ? '失败' : '释放'}，收到「${input.status === 'succeeded' ? '成功' : '处理中'}」回调，未自动落账，请人工核对资金`,
          type: 'refund',
          storeId: order.storeId,
          orderId: order.id
        });
        return 'ignored';
      }
      await this.releaseRefund(intent, input.error || '渠道退款失败', 'failed');
      return 'failed';
    }
    if (input.status === 'succeeded') {
      await this.confirmRefund(intent, input.providerRef || null, order, await this.isPrepared(order), '支付网关');
      return 'succeeded';
    }
    if (input.status === 'failed') {
      await this.releaseRefund(intent, input.error || '渠道退款失败', 'failed');
      return 'failed';
    }
    await this.prisma.refundIntent.update({
      where: { id: intent.id },
      data: { status: 'processing', providerRef: input.providerRef || intent.providerRef, updatedAt: new Date() }
    });
    await this.syncApprovalExecution(intent.approvalId, 'processing');
    return 'processing';
  }

  /** 渠道查询节流表：只存时间戳与最近一次状态，不存任何渠道凭证。 */
  private readonly lastQueryAt = new Map<string, number>();
  private readonly lastQueryState = new Map<string, PaymentState>();

  /** 请求内容指纹：同键请求必须逐字节同内容才允许重放，否则视为冲突。 */
  private fingerprintOf(input: CreateOrderInput): string {
    const canonical = {
      storeId: input.storeId || 'sh',
      business: input.business,
      channel: input.channel,
      type: input.type,
      seat: input.seat || null,
      note: String(input.note || ''),
      customerId: input.customerId || null,
      ownerKind: input.ownerKind || 'customer',
      memberDiscountPerCupCents: input.memberDiscountPerCupCents || 0,
      couponId: input.couponId || null,
      paymentMethod: input.paymentMethod || null,
      items: input.items
        .map((x) => ({ productId: x.productId, qty: x.qty, temp: x.temp || null, ice: x.ice || null }))
        .sort((a, b) => a.productId.localeCompare(b.productId) || a.qty - b.qty)
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  /**
   * 声明支付意图（TX-02）。
   * 幂等键按顾客隔离；同键异内容直接冲突。并发同键靠唯一约束收敛，
   * 后到者复用先到者的意图继续走同一单。
   */
  private async claimPaymentIntent(
    key: string,
    fingerprint: string,
    data: { storeId: string; amountCents: number; method: string }
  ): Promise<PaymentIntent> {
    const existing = await this.prisma.paymentIntent.findUnique({ where: { key } });
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw conflict('该幂等键已用于其他内容的支付请求，请更换幂等键后重试');
      }
      return existing;
    }
    const now = new Date();
    try {
      return await this.prisma.paymentIntent.create({
        data: {
          id: newId('PI'),
          key,
          fingerprint,
          status: 'processing',
          storeId: data.storeId,
          amountCents: data.amountCents,
          method: data.method,
          createdAt: now,
          updatedAt: now
        }
      });
    } catch (error) {
      // 并发同键：唯一约束保证只有一个创建者；其余复用已存在的意图。
      const raced = await this.prisma.paymentIntent.findUnique({ where: { key } });
      if (!raced) throw error;
      if (raced.fingerprint !== fingerprint) {
        throw conflict('该幂等键已用于其他内容的支付请求，请更换幂等键后重试');
      }
      return raced;
    }
  }

  /** 确定性的订单 ID：由幂等键派生，并发同键只会建出一单。 */
  private deterministicOrderId(key: string): string {
    return `SO-${createHash('sha256').update(`order:${key}`).digest('hex').slice(0, 32)}`;
  }

  /**
   * 重新占用一笔失败/取消的订单（TX-02 重试收敛）：
   * 条件扣减库存防止超扣，把订单复位为未支付后再次扣款。
   */
  private async reoccupyOrder(
    orderId: string,
    storeId: string,
    business: 'fresh' | 'retail',
    prepared: Awaited<ReturnType<OrdersService['prepareLines']>>
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw notFound('订单不存在');
      if (order.status !== 'cancelled' || order.paymentStatus !== 'failed') {
        throw conflict('订单当前状态不支持重新支付，请刷新后查看');
      }
      if (business === 'fresh') {
        for (const line of prepared.lines) {
          const result = await tx.stock.updateMany({
            where: {
              storeId,
              productId: line.product.id,
              grams: { gte: line.product.doseG * line.qty }
            },
            data: { grams: { decrement: line.product.doseG * line.qty } }
          });
          if (!result.count) throw conflict(`${line.product.name} 本店库存不足`);
        }
      }
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'unpaid', paymentStatus: 'unpaid', paidAt: null, paymentRef: null }
      });
      // 失败重试复用同一单：券在失败时已释放，这里重新锁定。
      if (prepared.coupon) {
        const reserved = await tx.customerCoupon.updateMany({
          where: {
            id: prepared.coupon.id,
            status: { in: ['available', 'reserved'] },
            OR: [{ orderId: null }, { orderId }]
          },
          data: { status: 'reserved', orderId }
        });
        if (!reserved.count) throw conflict('优惠券不可用，请重新下单');
      }
      await logAction(tx, {
        actorName: '支付网关',
        action: '重新发起支付',
        detail: `${order.number} · 幂等键重试，重新占用库存`,
        type: 'payment',
        storeId: order.storeId,
        orderId
      });
    });
  }

  /** 对既有订单执行扣款并同步意图状态；外部调用前订单必须处于未支付状态。 */
  private async runCharge(
    intent: PaymentIntent,
    orderId: string,
    input: Pick<CreateOrderInput, 'business' | 'paymentMethod'>,
    storeId: string,
    amountCents: number
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const method = input.paymentMethod || 'wechat';
    const result = await this.hardware.payment.charge({
      amountCents,
      method,
      reference: orderId,
      metadata: { orderType: input.business, storeId }
    });
    if (!result.ok) {
      await this.markPaymentFailed(orderId, result.error || '支付失败');
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'failed',
          failReason: result.error || '支付失败',
          orderId,
          updatedAt: new Date()
        }
      });
      return { ok: false, error: result.error || '支付未完成，请重试' };
    }
    const paymentRef = result.providerRef || `TH-PAY-${orderId}`;
    await this.markPaid(orderId, paymentRef);
    const fresh = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (fresh?.paymentStatus === 'paid') {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'succeeded',
          providerRef: paymentRef,
          orderId,
          responseJson: JSON.stringify({ ok: true, orderId, providerRef: paymentRef, paidAt: result.paidAt ?? null }),
          updatedAt: new Date()
        }
      });
      return { ok: true };
    }
    // 扣款已成功但订单被并发取消（markPaid 拦截）：资金去向未知，转人工对账。
    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'unknown',
        failReason: '扣款成功但订单已取消，需人工退款/对账',
        orderId,
        updatedAt: new Date()
      }
    });
    return { ok: false, error: '支付状态异常，请联系门店核实' };
  }

  /**
   * 处理订单的自动出票任务（首次出票）。
   * 同步扣款的订单在请求内完成；异步回调落账时没有请求上下文，由回调入口调用。
   */
  async processQueuedPrint(orderId: string): Promise<string | undefined> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.business !== 'fresh') return undefined;
    const job = await this.prisma.printJob.findFirst({
      where: { orderId, status: 'queued', kind: 'labels' },
      orderBy: { createdAt: 'desc' }
    });
    if (!job) return undefined;
    const printed = await this.printing.process(job.id);
    return printed.ok ? undefined : printed.error;
  }

  private async finishOrder(
    orderId: string,
    business: 'fresh' | 'retail'
  ): Promise<CreateOrderResult> {
    const printError = business === 'fresh' ? await this.processQueuedPrint(orderId) : undefined;
    return { order: await this.getOrder(orderId), printError };
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const external = input.channel === 'meituan' || input.channel === 'taobao';
    const retail = input.business === 'retail';
    const storeId = input.storeId || 'sh';
    if (retail) {
      if (external) throw badRequest('零售不接外卖平台');
    } else {
      const store = await this.prisma.store.findUnique({ where: { id: storeId } });
      if (!store) throw badRequest('门店不存在');
      if (!store.open) throw conflict('本店暂停营业，请选择其他门店');
      if (!external) {
        const channels = JSON.parse(store.channelsJson) as Record<string, boolean>;
        if (!channels[input.channel]) throw conflict('该门店暂未开通此下单渠道');
      }
      if (input.type === 'dine' && input.seat) {
        // 堂食座位可空：未扫桌签的顾客到吧台取餐口自取；填了座位则必须属于本店。
        const positions = JSON.parse(store.positionsJson) as string[];
        if (!positions.includes(input.seat)) {
          throw badRequest('堂食请选择有效的吧台或窗边位置');
        }
      }
      if (input.type === 'delivery' && input.channel === 'assisted') {
        throw badRequest('伙伴代点不支持骑手配送，请选择堂食或外带');
      }
      if (input.actor) this.assertStaffStore(input.actor, storeId);
    }
    if (input.business === 'retail' && input.type !== 'retail') throw badRequest('零售订单类型无效');
    if (input.business === 'fresh' && input.type === 'retail') throw badRequest('请选择堂食、外带或配送');

    let prepared = await this.prepareLines(input, storeId);

    // 外卖平台单由平台结算，不走支付网关，也不产生支付意图。
    if (external) {
      const platformOrderId = await this.createUnpaidOrder(input, storeId, prepared);
      await this.markPaid(platformOrderId, input.externalRef || `PLATFORM-${platformOrderId}`);
      return this.finishOrder(platformOrderId, input.business);
    }

    // TX-02：意图先行——幂等键 + 指纹声明后，再建单、扣款、落终态。
    const dbStoreId = input.business === 'retail' ? 'brand' : storeId;
    const idemKey = input.idempotencyKey?.trim()
      ? `${input.customerId || 'guest'}:${input.idempotencyKey.trim()}`
      : `auto:${newId('PI')}`;
    const intent = await this.claimPaymentIntent(idemKey, this.fingerprintOf(input), {
      storeId: dbStoreId,
      amountCents: prepared.totalCents,
      method: input.paymentMethod || 'wechat'
    });

    // 已成功的意图：同键同内容重放同一单。
    if (intent.status === 'succeeded' && intent.orderId) {
      return this.finishOrder(intent.orderId, input.business);
    }

    let orderId = intent.orderId;
    if (orderId) {
      const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (!existing) {
        // 意图已关联但订单未落库（建单前崩溃）：重新建单。
        orderId = null;
      } else if (existing.paymentStatus === 'paid') {
        // 查询收敛：扣款已生效、意图未落终态（落终态前崩溃），补记后重放。
        if (intent.status !== 'succeeded') {
          await this.prisma.paymentIntent.update({
            where: { id: intent.id },
            data: {
              status: 'succeeded',
              providerRef: existing.paymentRef,
              responseJson: JSON.stringify({
                ok: true,
                orderId: existing.id,
                providerRef: existing.paymentRef,
                converged: true
              }),
              updatedAt: new Date()
            }
          });
        }
        return this.finishOrder(orderId, input.business);
      } else if (existing.status === 'cancelled') {
        // 失败后的同键重试：重新占用同一单。券可能仍锁在本单上，按重试单核验后复用。
        prepared = await this.prepareLines({ ...input, retryOrderId: orderId }, storeId);
        await this.reoccupyOrder(orderId, storeId, input.business, prepared);
      }
      // 其余情况：未支付订单保持原单续跑（扣款中断恢复）。
    }
    if (!orderId) {
      const deterministicId = this.deterministicOrderId(idemKey);
      try {
        orderId = await this.createUnpaidOrder(input, storeId, prepared, deterministicId);
      } catch (error) {
        // 并发同键：先到者已用同一确定性 ID 建单，复用之。
        const raced = await this.prisma.order.findUnique({ where: { id: deterministicId } });
        if (!raced) throw error;
        orderId = deterministicId;
      }
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { orderId, updatedAt: new Date() }
      });
    }

    // 异步渠道（汇付等）：订单保持未支付，由预下单/收款码/付款码发起，回调落账。
    // 绝不在渠道未确认时调用同步 charge，也不把「已发起」当成「已支付」。
    if (this.hardware.payment.asyncPayments) {
      return this.settleAsyncOrder(input, orderId, intent, prepared.totalCents);
    }

    const charge = await this.runCharge(intent, orderId, input, storeId, prepared.totalCents);
    if (!charge.ok) throw conflict(charge.error);
    return this.finishOrder(orderId, input.business);
  }

  /** 异步渠道下按门店收款方式发起支付；返回给前端继续完成支付所需的信息。 */
  private async settleAsyncOrder(
    input: CreateOrderInput,
    orderId: string,
    intent: PaymentIntent,
    amountCents: number
  ): Promise<CreateOrderResult> {
    const order = await this.getOrder(orderId);
    if (order.paymentStatus === 'paid') {
      return { order, payment: { kind: 'none', status: 'paid' } };
    }
    if (order.status === 'cancelled') throw conflict('订单已取消，请重新下单');

    const method = (input.paymentMethod || 'wechat') as 'wechat' | 'alipay' | 'cash';
    if (method === 'cash') {
      await this.markPaid(orderId, `CASH-${orderId}`);
      await this.settleIntent(intent, orderId, `CASH-${orderId}`, { kind: 'cash', status: 'paid' });
      const finished = await this.finishOrder(orderId, input.business);
      return { ...finished, payment: { kind: 'cash', status: 'paid' } };
    }

    // 小程序：建单后由客户端继续调 /customer/orders/:id/prepay，拿 wx.requestPayment 参数。
    if (input.channel === 'mini') {
      return { order, payment: { kind: 'prepay', method } };
    }

    const gateway = this.hardware.payment;
    const description = `时叙 ${order.number}`;
    const dbStoreId = order.storeId;

    if (input.payMode === 'scan') {
      if (!gateway.micropay) throw conflict('当前支付渠道不支持扫顾客付款码');
      const authCode = String(input.authCode || '').trim();
      if (!authCode) throw badRequest('请扫描顾客的付款码');
      const result = await gateway.micropay({
        orderId,
        amountCents,
        description,
        storeId: dbStoreId,
        method,
        authCode,
        clientIp: input.clientIp
      });
      if (result.status === 'paid') {
        const providerRef = result.providerRef || `HF-${orderId}`;
        await this.markPaid(orderId, providerRef);
        await this.settleIntent(intent, orderId, providerRef, {
          kind: 'scan',
          method,
          status: 'paid'
        });
        const finished = await this.finishOrder(orderId, input.business);
        return { ...finished, payment: { kind: 'scan', method, status: 'paid', providerRef } };
      }
      if (result.status === 'processing') {
        await this.prisma.paymentIntent.update({
          where: { id: intent.id },
          data: {
            status: 'processing',
            orderId,
            providerRef: result.providerRef || null,
            updatedAt: new Date()
          }
        });
        return {
          order: await this.getOrder(orderId),
          payment: { kind: 'scan', method, status: 'processing', providerRef: result.providerRef }
        };
      }
      // 渠道明确拒绝：回补库存并释放券，顾客可用同一幂等键换付款码重试。
      const reason = result.error || '顾客付款码扣款失败';
      await this.markPaymentFailed(orderId, reason);
      await this.failIntent(intent, orderId, reason);
      throw conflict(reason);
    }

    if (!gateway.nativePay) throw conflict('当前支付渠道不支持展示收款码');
    const cached = await this.cachedNativeQr(intent);
    if (cached) return { order, payment: cached };
    const result = await gateway.nativePay({
      orderId,
      amountCents,
      description,
      storeId: dbStoreId,
      method,
      clientIp: input.clientIp
    });
    if (result.status === 'paid') {
      const providerRef = result.providerRef || `HF-${orderId}`;
      await this.markPaid(orderId, providerRef);
      await this.settleIntent(intent, orderId, providerRef, { kind: 'none', status: 'paid' });
      return this.finishOrder(orderId, input.business);
    }
    if (!result.ok || !result.qrCode) {
      const reason = result.error || '收款码生成失败';
      await this.markPaymentFailed(orderId, reason);
      await this.failIntent(intent, orderId, reason);
      throw conflict(reason);
    }
    const payment: OrderPaymentPrompt = { kind: 'qr', method, qrCode: result.qrCode, status: 'pending' };
    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        orderId,
        providerRef: result.providerRef || null,
        responseJson: JSON.stringify(payment),
        updatedAt: new Date()
      }
    });
    return { order, payment };
  }

  /** 同一幂等请求重放时复用已生成的收款码，避免对同一订单重复下单。 */
  private async cachedNativeQr(intent: PaymentIntent): Promise<OrderPaymentPrompt | null> {
    if (!intent.responseJson) return null;
    try {
      const parsed = JSON.parse(intent.responseJson) as OrderPaymentPrompt & { kind?: string };
      if (parsed.kind === 'qr' && typeof (parsed as { qrCode?: unknown }).qrCode === 'string') {
        return parsed as OrderPaymentPrompt;
      }
    } catch {
      return null;
    }
    return null;
  }

  private async settleIntent(
    intent: PaymentIntent,
    orderId: string,
    providerRef: string,
    payment: OrderPaymentPrompt
  ): Promise<void> {
    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'succeeded',
        providerRef,
        orderId,
        responseJson: JSON.stringify({ ok: true, orderId, providerRef, payment }),
        updatedAt: new Date()
      }
    });
  }

  private async failIntent(intent: PaymentIntent, orderId: string, reason: string): Promise<void> {
    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'failed', failReason: reason, orderId, updatedAt: new Date() }
    });
  }

  async listOrders(options: {
    storeIds: string[];
    status?: string;
    business?: string;
    q?: string;
    from?: number;
    to?: number;
    limit?: number;
    customerId?: string;
  }) {
    // SEC-04：后台视角下空门店范围 = 什么都看不到（fail closed）；
    // 顾客自查（带 customerId）不受门店范围限制，只看自己的订单。
    if (!options.storeIds.length && !options.customerId) return [];
    // TX-10：状态/关键词全部下推数据库，先截断再筛选会漏掉旧待办与老单号。
    const and: Prisma.OrderWhereInput[] = [];
    if (options.customerId) and.push({ customerId: options.customerId });
    if (options.storeIds.length) {
      and.push({
        OR: [
          { storeId: { in: options.storeIds } },
          {
            business: 'retail',
            OR: [{ pickupStoreId: null }, { pickupStoreId: { in: options.storeIds } }]
          }
        ]
      });
    }
    if (options.status && options.status !== 'all') and.push({ status: options.status });
    if (options.business && options.business !== 'all') and.push({ business: options.business });
    if (options.from != null || options.to != null) {
      and.push({
        createdAt: {
          ...(options.from != null ? { gte: new Date(options.from) } : {}),
          ...(options.to != null ? { lt: new Date(options.to) } : {})
        }
      });
    }
    const q = (options.q || '').trim().replace(/\s/g, '');
    if (q) {
      and.push({
        OR: [
          { number: { contains: q } },
          { pickupCode: { contains: q } },
          { seat: { contains: q } }
        ]
      });
    }
    const rows = await this.prisma.order.findMany({
      where: { AND: and },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: options.limit || 100
    });
    const stores = await this.prisma.store.findMany();
    const names = new Map(stores.map((s) => [s.id, s.name]));
    return rows.map((row) =>
      mapOrder(
        row,
        row.items,
        row.units,
        row.business === 'retail' ? '品牌零售' : names.get(row.storeId) || row.storeId
      )
    );
  }

  async storeQueue(storeId: string) {
    // TX-10：活动队列独立查询，不被大量已完成订单挤出；排序交数据库。
    const rows = await this.prisma.order.findMany({
      where: {
        OR: [
          { business: 'fresh', status: { in: ['pending', 'ready'] }, storeId },
          {
            business: 'retail',
            status: 'awaiting',
            OR: [{ pickupStoreId: storeId }, { pickupStoreId: null }]
          }
        ]
      },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 500
    });
    const stores = await this.prisma.store.findMany();
    const names = new Map(stores.map((s) => [s.id, s.name]));
    const mapped = rows.map((row) =>
      mapOrder(
        row,
        row.items,
        row.units,
        row.business === 'retail' ? '品牌零售' : names.get(row.storeId) || row.storeId
      )
    );
    const fresh = mapped
      .filter((order) => order.business === 'fresh')
      .sort((a, b) => a.createdAt - b.createdAt);
    const retail = mapped
      .filter((order) => order.business === 'retail')
      .sort((a, b) => a.createdAt - b.createdAt);
    return {
      fresh,
      retail,
      counts: {
        pending: fresh.filter((x) => x.status === 'pending').length,
        ready: fresh.filter((x) => x.status === 'ready').length,
        retail: retail.length
      }
    };
  }

  async scanCupLabel(staff: StaffContext, label: string) {
    const code = String(label || '').trim().toUpperCase();
    if (!code) throw badRequest('请扫描杯贴');
    const unit = await this.prisma.orderUnit.findUnique({ where: { label: code } });
    if (!unit) throw notFound(`未找到杯贴 ${code}`);
    return this.scanUnit(staff, unit);
  }

  async scanUnitById(staff: StaffContext, orderId: string, unitId: string) {
    const unit = await this.prisma.orderUnit.findFirst({ where: { id: unitId, orderId } });
    if (!unit) throw notFound('杯贴不存在');
    return this.scanUnit(staff, unit);
  }

  private async scanUnit(staff: StaffContext, unit: OrderUnit) {
    const order = await this.getOrderRow(unit.orderId);
    if (order.business !== 'fresh') throw badRequest('零售请使用提货码交付');
    this.assertStaffStore(staff, order.storeId);
    if (order.status === 'refunded' || order.status === 'cancelled') throw conflict('该订单已退款或取消，不能出餐');
    if (unit.status === 'refunded') throw conflict('该杯已退款，无需出餐');
    if (unit.status !== 'scanned') {
      await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        await tx.orderUnit.update({ where: { id: unit.id }, data: { status: 'scanned', scannedAt: now } });
        const remaining = await tx.orderUnit.count({ where: { orderId: order.id, status: 'pending' } });
        if (!remaining) {
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'ready', preparedAt: order.preparedAt ?? now }
          });
          await logAction(tx, {
            actorId: staff.id,
            actorName: staff.name,
            action: '整单出餐完成',
            detail: `${order.number} · 全部杯贴已扫码`,
            type: 'order',
            storeId: order.storeId,
            orderId: order.id
          });
        } else {
          await logAction(tx, {
            actorId: staff.id,
            actorName: staff.name,
            action: '扫码出餐',
            detail: unit.label,
            type: 'order',
            storeId: order.storeId,
            orderId: order.id
          });
        }
      });
    }
    return this.getOrder(order.id);
  }

  /**
   * 待取餐 → 已取餐：顾客不需要再扫码，门店可在交付时归档。
   * 幂等：重复确认返回当前订单；未出完餐的订单不能跳过制作直接归档。
   */
  async deliverFresh(staff: StaffContext, orderId: string) {
    const order = await this.getOrderRow(orderId);
    if (order.business !== 'fresh') throw badRequest('零售订单请使用提货码交付');
    this.assertStaffStore(staff, order.storeId);
    if (order.status === 'delivered') return this.getOrder(order.id);
    if (order.status !== 'ready') throw conflict('只有待取餐订单可以确认已取餐');
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: { id: order.id, status: 'ready' },
        data: { status: 'delivered', deliveredAt: new Date() }
      });
      if (!claim.count) throw conflict('该订单状态已变化，请刷新后确认');
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '确认已取餐',
        detail: `${order.number} · 顾客已取餐`,
        type: 'order',
        storeId: order.storeId,
        orderId: order.id
      });
    });
    return this.getOrder(order.id);
  }

  /**
   * 每日凌晨自动确认取餐：顾客端把「已出餐」视为终态，线下关店时会人工确认当天交付；
   * 这里补齐夜间未手动归档的订单，避免待取餐队列跨日堆积。
   * 只处理截止时间之前创建、仍为 ready 的现制订单；逐单条件更新保证与人工确认并发时不重复写。
   */
  async autoDeliverReadyOrders(cutoff: Date, now = new Date()): Promise<number> {
    const rows = await this.prisma.order.findMany({
      where: { business: 'fresh', status: 'ready', createdAt: { lt: cutoff } },
      select: { id: true, number: true, storeId: true }
    });
    if (!rows.length) return 0;
    return this.prisma.$transaction(async (tx) => {
      const claimed: typeof rows = [];
      for (const row of rows) {
        const result = await tx.order.updateMany({
          where: { id: row.id, status: 'ready' },
          data: { status: 'delivered', deliveredAt: now }
        });
        if (result.count) claimed.push(row);
      }
      if (claimed.length) {
        await tx.log.createMany({
          data: claimed.map((row) => ({
            id: newId('L'),
            actorId: null,
            actorName: '系统自动',
            action: '每日自动确认取餐',
            detail: `${row.number} · 前一日营业结束自动归档`,
            type: 'order',
            storeId: row.storeId,
            orderId: row.id,
            at: now
          }))
        });
      }
      return claimed.length;
    });
  }

  async reprintOrder(staff: StaffContext, orderId: string) {
    const order = await this.getOrderRow(orderId);
    this.assertStaffStore(staff, order.storeId);
    if (order.business !== 'fresh') throw badRequest('零售订单没有杯贴');
    if (order.status === 'refunded' || order.status === 'cancelled') throw conflict('已退款或取消的订单无需打印');
    // TX-05：补打只针对仍有效的杯，已退杯不重建
    const count = await this.prisma.orderUnit.count({ where: { orderId, status: { not: 'refunded' } } });
    if (!count) throw conflict('本单没有杯贴');
    const jobId = await this.printing.enqueue(orderId, true);
    if (!jobId) throw conflict('无法创建打印任务');
    const result = await this.printing.process(jobId);
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '补打杯贴',
      detail: `${order.number} · ${result.ok ? '已受理' : result.error}`,
      type: 'print',
      storeId: order.storeId,
      orderId
    });
    return { ok: result.ok, error: result.error, order: await this.getOrder(orderId) };
  }

  async remakeOrder(staff: StaffContext, orderId: string, reason?: string) {
    const original = await this.getOrderRow(orderId);
    if (original.business !== 'fresh') throw badRequest('零售订单不能创建补做单');
    this.assertStaffStore(staff, original.storeId);
    if (original.paymentStatus !== 'paid' || original.status === 'cancelled') {
      throw conflict('该订单未支付或已取消，不能补做');
    }
    const items = await this.prisma.orderItem.findMany({
      where: { orderId, qty: { gt: 0 } },
      orderBy: { sortOrder: 'asc' }
    });
    const remaining = items.filter((item) => item.qty > item.refundedQty);
    if (!remaining.length) throw conflict('本单没有可补做的商品');
    const now = new Date();
    const childId = newId('SO');
    const number = await this.nextFreshNumber(original.storeId, true);
    await this.prisma.$transaction(async (tx) => {
      for (const item of remaining) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        const qty = item.qty - item.refundedQty;
        if (product?.kind === 'tea') {
          const result = await tx.stock.updateMany({
            where: { storeId: original.storeId, productId: product.id, grams: { gte: product.doseG * qty } },
            data: { grams: { decrement: product.doseG * qty } }
          });
          if (!result.count) throw conflict(`${product.name} 库存不足，无法补做`);
        }
      }
      await tx.order.create({
        data: {
          id: childId,
          number,
          business: 'fresh',
          storeId: original.storeId,
          channel: original.channel,
          type: original.type,
          seat: original.seat,
          status: 'pending',
          paymentStatus: 'paid',
          totalCents: 0,
          refundedCents: 0,
          printStatus: 'queued',
          parentOrderId: original.id,
          note: String(`补做 ${original.number} · ${reason || '服务补偿'}`).slice(0, 200),
          customerId: original.customerId,
          ownerKind: 'customer',
          createdBy: staff.id,
          paymentRef: 'REMAKE',
          paymentMethod: '补做',
          createdAt: now,
          paidAt: now
        }
      });
      let sortOrder = 0;
      let cup = 0;
      for (const item of remaining) {
        const qty = item.qty - item.refundedQty;
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        const itemId = newId('OI');
        sortOrder += 1;
        await tx.orderItem.create({
          data: {
            id: itemId,
            orderId: childId,
            productId: item.productId,
            name: item.name,
            nameEn: item.nameEn,
            kind: item.kind,
            series: item.series,
            qty,
            sortOrder,
            refundedQty: 0,
            unitPriceCents: 0,
            totalCents: 0,
            costCents: (product?.costCents ?? 0) * qty,
            temp: item.temp,
            ice: item.ice
          }
        });
        for (let i = 0; i < qty; i += 1) {
          cup += 1;
          await tx.orderUnit.create({
            data: {
              id: newId('U'),
              orderId: childId,
              itemId,
              label: cupLabel(number, cup),
              status: 'pending'
            }
          });
        }
      }
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '创建补做单',
        detail: `${original.number} → ${number} · ${reason || '服务补偿'}`,
        type: 'order',
        storeId: original.storeId,
        orderId: childId
      });
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '关联补做',
        detail: number,
        type: 'order',
        storeId: original.storeId,
        orderId: original.id
      });
    });
    const job = await this.printing.enqueue(childId);
    if (job) await this.printing.process(job);
    return this.getOrder(childId);
  }

  /**
   * 优惠券抵扣按行分摊后的「实付口径」金额。
   * 订单行 totalCents 只扣过会员立减，券抵扣记在订单上；
   * 退款若不先分摊就会按原价退，用券订单会超退或整单退不动。
   * 券范围在创建后不可改，按当前模板还原当时可用行是安全的。
   */
  private async couponAllocation(order: Order, items: OrderItem[]): Promise<Map<string, number>> {
    const allocation = new Map<string, number>();
    const discount = order.couponDiscountCents || 0;
    if (discount <= 0 || !items.length) return allocation;
    let eligible = items;
    if (order.couponId) {
      const held = await this.prisma.customerCoupon.findUnique({
        where: { id: order.couponId },
        include: { coupon: true }
      });
      if (held?.coupon && held.coupon.scope === 'category' && held.coupon.categoryId) {
        const products = await this.prisma.product.findMany({
          where: { id: { in: items.map((x) => x.productId) } },
          select: { id: true, categoryId: true }
        });
        const categoryOf = new Map(products.map((x) => [x.id, x.categoryId]));
        const scoped = items.filter((x) => categoryOf.get(x.productId) === held.coupon!.categoryId);
        // 找不到适用行时回退到全部行，宁可少退也绝不按原价多退。
        if (scoped.length) eligible = scoped;
      }
    }
    const eligibleTotal = eligible.reduce((n, x) => n + x.totalCents, 0);
    if (eligibleTotal <= 0) return allocation;
    const capped = Math.min(discount, eligibleTotal);
    // 按行占比 floor 分摊，余数给小数部分最大的行（同余按行序），保证合计恰好等于券抵扣。
    const shares = eligible.map((item, index) => {
      const exact = capped * item.totalCents;
      return {
        id: item.id,
        index,
        share: Math.floor(exact / eligibleTotal),
        remainder: exact % eligibleTotal
      };
    });
    let left = capped - shares.reduce((n, x) => n + x.share, 0);
    for (const row of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
      if (left <= 0) break;
      row.share += 1;
      left -= 1;
    }
    for (const row of shares) if (row.share > 0) allocation.set(row.id, row.share);
    return allocation;
  }

  private async quoteRefund(order: Order, lines?: RefundLineInput[]) {
    const items = await this.prisma.orderItem.findMany({ where: { orderId: order.id }, orderBy: { sortOrder: 'asc' } });
    const couponShare = await this.couponAllocation(order, items);
    const wanted = new Map<string, number>();
    if (lines?.length) {
      for (const line of lines) {
        const qty = Number(line.qty);
        if (!Number.isInteger(qty) || qty < 1) throw badRequest('退款数量须为正整数');
        wanted.set(line.itemId, (wanted.get(line.itemId) || 0) + qty);
      }
    } else {
      for (const item of items) {
        if (item.qty - item.refundedQty > 0) wanted.set(item.id, item.qty - item.refundedQty);
      }
    }
    if (!wanted.size) throw conflict('本单没有可退款数量');
    let amount = 0;
    let cost = 0;
    const detail: Array<{ item: OrderItem; qty: number; amountCents: number; costCents: number }> = [];
    for (const [itemId, qty] of wanted) {
      const item = items.find((x) => x.id === itemId);
      if (!item) throw notFound('订单行不存在');
      const remaining = item.qty - item.refundedQty;
      if (qty > remaining) throw badRequest(`${item.name} 退款数量超过剩余可退数量`);
      // 实付口径：行小计减去该行分摊的券抵扣，分次退款按已退数量累计取整，尾差落在最后一次。
      const effectiveTotal = Math.max(0, item.totalCents - (couponShare.get(item.id) || 0));
      const lineAmount =
        Math.floor((effectiveTotal * (item.refundedQty + qty)) / item.qty) -
        Math.floor((effectiveTotal * item.refundedQty) / item.qty);
      const lineCost =
        Math.floor((item.costCents * (item.refundedQty + qty)) / item.qty) -
        Math.floor((item.costCents * item.refundedQty) / item.qty);
      amount += lineAmount;
      cost += lineCost;
      detail.push({ item, qty, amountCents: lineAmount, costCents: lineCost });
    }
    return { amount, cost, detail };
  }

  private async isPrepared(order: Order): Promise<boolean> {
    if (order.business === 'retail') return order.status === 'delivered';
    if (order.status === 'ready') return true;
    const scanned = await this.prisma.orderUnit.count({ where: { orderId: order.id, status: 'scanned' } });
    return scanned > 0;
  }

  async refundQuoteForOrder(orderId: string, lines?: RefundLineInput[]) {
    const order = await this.getOrderRow(orderId);
    return { order, quote: await this.quoteRefund(order, lines), prepared: await this.isPrepared(order) };
  }

  async isOrderPrepared(orderId: string): Promise<boolean> {
    return this.isPrepared(await this.getOrderRow(orderId));
  }

  async refundNeedsApproval(staff: StaffContext, amount: number): Promise<boolean> {
    const flow = await this.finance.refundFlow();
    if (!flow.enabled) return false;
    return !hasPerm(staff, 'order:refund') || amount >= flow.thresholdCents;
  }

  async requestRefund(
    staff: StaffContext,
    orderId: string,
    options: { lines?: RefundLineInput[]; reason?: string }
  ) {
    const order = await this.getOrderRow(orderId);
    if (order.business === 'retail') assertStoreAccess(staff, order.pickupStoreId || 'brand');
    else this.assertStaffStore(staff, order.storeId);
    if (!hasPerm(staff, 'order:refund') && !hasPerm(staff, 'order:refund:request')) {
      throw forbidden('当前账号没有退款权限');
    }
    if (order.paymentStatus !== 'paid') throw conflict('订单未支付，不能退款');
    if (order.refundPending) throw conflict('该订单已有待审批的退款申请');
    const quote = await this.quoteRefund(order, options.lines);
    if (quote.amount <= 0) throw conflict('退款金额为 0');
    const prepared = await this.isPrepared(order);
    const reason = String(options.reason || '顾客需求').slice(0, 120);
    if (!(await this.refundNeedsApproval(staff, quote.amount))) {
      const result = await this.executeRefund(staff, {
        order,
        quote,
        reason,
        prepared,
        approvalId: null,
        decidedBy: staff.name
      });
      if (result.error) throw conflict(result.error);
      return { mode: 'refunded' as const, ...result, order: await this.getOrder(orderId) };    }
    const id = newId('AP');
    const now = new Date();
    const storeId = order.business === 'retail' ? order.pickupStoreId || 'brand' : order.storeId;
    await this.prisma.$transaction(async (tx) => {
      await tx.approval.create({
        data: {
          id,
          kind: 'REFUND',
          status: 'pending',
          amountCents: quote.amount,
          storeId,
          orderId: order.id,
          summary: `退款申请：${order.number} · ¥${(quote.amount / 100).toFixed(2)} · ${reason}`,
          payloadJson: JSON.stringify({
            lines: quote.detail.map((x) => ({ itemId: x.item.id, qty: x.qty, amountCents: x.amountCents })),
            reason,
            prepared
          }),
          requestedBy: staff.id,
          createdAt: now
        }
      });
      // 条件置位：并发重复申请只有一个能占住 refundPending（TX-08 同款「唯一胜者」条件更新）。
      const claimed = await tx.order.updateMany({
        where: { id: order.id, refundPending: false },
        data: { refundPending: true }
      });
      if (!claimed.count) throw conflict('该订单已有待审批的退款申请');
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '发起退款申请',
        detail: `${order.number} · ¥${(quote.amount / 100).toFixed(2)} · ${reason}`,
        type: 'approval',
        storeId,
        orderId: order.id
      });
    });
    const approval = await this.prisma.approval.findUnique({ where: { id } });
    return {
      mode: 'approval' as const,
      approval: approval
        ? {
            id: approval.id,
            kind: approval.kind,
            status: approval.status,
            amountCents: approval.amountCents,
            summary: approval.summary,
            createdAt: approval.createdAt.getTime()
          }
        : null,
      amountCents: quote.amount,
      order: await this.getOrder(orderId)
    };
  }

  /**
   * 退款三段式（TX-04）：
   * 1) 占用——事务内先持久化退款意图（稳定 RF 单号）并原子占用可退数量（pendingRefundQty）；
   * 2) 外部——用同一 RF 单号调渠道（渠道幂等），抛错视为「未知」（占用保留，可重试收敛），
   *    返回 ok:false 视为「确定失败」（释放占用）；
   * 3) 确认——渠道成功后才在事务内落账：refundedQty、库存冲回、杯次映射（TX-05）、财务流水。
   */
  /**
   * 占用：事务内重校验剩余可退（含处理中占用），防止并发超退；返回新退款单号。
   * claimApproval=true 时条件认领审批行（决定竞争的串行点，TX-12）；
   * 审批恢复重试（claimApproval=false）时审批决定已落库，仅刷新执行状态。
   */
  private async occupyRefund(
    order: Order,
    quote: Awaited<ReturnType<OrdersService['quoteRefund']>>,
    opts: {
      reason: string;
      approvalId: string | null;
      decidedBy: string;
      requestedBy: string | null;
      claimApproval: boolean;
    }
  ): Promise<string> {
    const intentId = newId('RF');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUnique({ where: { id: order.id } });
      if (!fresh) throw notFound('订单不存在');
      if (fresh.paymentStatus !== 'paid') throw conflict('订单未支付，不能退款');
      if (fresh.refundPending && !opts.approvalId) throw conflict('该订单已有待审批的退款申请');
      // 先认领审批行再校验金额：并发批准时第二笔必须以「已被处理」失败，
      // 而不是走到金额冲突被上层记成一条“已通过但执行失败”的误导记录。
      // refundIntentId 为空才可认领：前一笔执行中/待人工核对的退款单不能被第二次批准覆盖。
      if (opts.approvalId && opts.claimApproval) {
        const claim = await tx.approval.updateMany({
          where: { id: opts.approvalId, status: 'pending', refundIntentId: null },
          data: { executionStatus: 'pending', refundIntentId: intentId }
        });
        if (!claim.count) throw conflict('该审批已被处理，退款未执行');
      }
      if (fresh.refundedCents + quote.amount > fresh.totalCents) {
        throw conflict('退款金额超过剩余可退金额');
      }
      for (const line of quote.detail) {
        const item = await tx.orderItem.findUnique({ where: { id: line.item.id } });
        if (!item) throw notFound('订单行不存在');
        const remaining = item.qty - item.refundedQty - item.pendingRefundQty;
        if (line.qty > remaining) {
          throw conflict(`${item.name} 退款数量超过剩余可退数量（含处理中的退款）`);
        }
        await tx.orderItem.update({
          where: { id: item.id },
          data: { pendingRefundQty: { increment: line.qty } }
        });
      }
      await tx.refundIntent.create({
        data: {
          id: intentId,
          orderId: order.id,
          status: 'occupied',
          amountCents: quote.amount,
          linesJson: JSON.stringify(
            quote.detail.map((x) => ({
              itemId: x.item.id,
              qty: x.qty,
              amountCents: x.amountCents,
              costCents: x.costCents
            }))
          ),
          approvalId: opts.approvalId,
          requestedBy: opts.requestedBy,
          decidedBy: opts.decidedBy,
          reason: opts.reason,
          createdAt: now,
          updatedAt: now
        }
      });
      if (opts.approvalId && !opts.claimApproval) {
        // 审批恢复重试：审批决定已落库，仅刷新执行状态指向新退款单。
        await tx.approval.update({
          where: { id: opts.approvalId },
          data: { executionStatus: 'pending', refundIntentId: intentId }
        });
      }
      await logAction(tx, {
        actorId: opts.requestedBy,
        actorName: opts.decidedBy,
        action: '退款占用',
        detail: `${fresh.number} · ¥${(quote.amount / 100).toFixed(2)} · ${intentId}`,
        type: 'refund',
        storeId: order.business === 'retail' ? 'brand' : order.storeId,
        orderId: order.id,
        at: now.getTime()
      });
    });
    return intentId;
  }

  async executeRefund(
    staff: StaffContext | null,
    input: {
      order: Order;
      quote: Awaited<ReturnType<OrdersService['quoteRefund']>>;
      reason: string;
      prepared: boolean;
      approvalId: string | null;
      decidedBy: string;
    }
  ): Promise<{ refundedCents: number; providerRef: string | null; refundIntentId: string; pending?: boolean; error?: string }> {
    const { order, quote, prepared } = input;
    const intentId = await this.occupyRefund(order, quote, {
      reason: input.reason,
      approvalId: input.approvalId,
      decidedBy: input.decidedBy,
      requestedBy: staff?.id || null,
      claimApproval: true
    });

    // 2) 外部 + 3) 确认/释放。
    const intent = (await this.prisma.refundIntent.findUnique({ where: { id: intentId } }))!;
    const result = await this.runGatewayRefund(intent, order, prepared, input.decidedBy);
    if (!result.ok) {
      return { refundedCents: 0, providerRef: null, refundIntentId: intentId, error: result.error };
    }
    if (result.pending) {
      return { refundedCents: 0, providerRef: result.providerRef, refundIntentId: intentId, pending: true };
    }
    return { refundedCents: quote.amount, providerRef: result.providerRef, refundIntentId: intentId };
  }

  /** 外部退款 + 确认/释放；供 executeRefund 与 retryRefundIntent 复用。 */
  private async runGatewayRefund(
    intent: RefundIntent,
    order: Order,
    prepared: boolean,
    decidedBy: string
  ): Promise<{ ok: true; providerRef: string | null; pending?: boolean } | { ok: false; error: string }> {
    let gateway: Awaited<ReturnType<HardwareService['payment']['refund']>>;
    try {
      gateway = await this.hardware.payment.refund({
        paymentRef: order.paymentRef || '',
        amountCents: intent.amountCents,
        reference: intent.id,
        storeId: order.storeId,
        requestedAt: order.createdAt.getTime()
      });
    } catch (error) {
      // 抛错 = 渠道响应未知（超时/断连）：资金状态不明，占用保留，等待重试收敛。
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.refundIntent.update({
        where: { id: intent.id },
        data: { status: 'unknown', failReason: `渠道响应未知：${message}`, updatedAt: new Date() }
      });
      await this.syncApprovalExecution(intent.approvalId, 'unknown');
      return { ok: false, error: '退款渠道响应未知，资金状态待确认，可稍后重试收敛' };
    }
    if (!gateway.ok) {
      // 确定失败：渠道明确拒绝，释放占用，允许重新发起。
      await this.releaseRefund(intent, gateway.error || '支付网关退款失败', 'failed');
      return { ok: false, error: gateway.error || '支付网关退款失败' };
    }
    // 渠道已受理但尚未出账：保持数量占用，等回调/查询收敛，绝不提前记为已退款。
    if (gateway.status === 'processing') {
      await this.prisma.refundIntent.update({
        where: { id: intent.id },
        data: { status: 'processing', providerRef: gateway.providerRef || null, updatedAt: new Date() }
      });
      await this.syncApprovalExecution(intent.approvalId, 'processing');
      return { ok: true, providerRef: gateway.providerRef || null, pending: true };
    }
    await this.confirmRefund(intent, gateway.providerRef || null, order, prepared, decidedBy);
    return { ok: true, providerRef: gateway.providerRef || null };
  }

  private async syncApprovalExecution(approvalId: string | null, executionStatus: string): Promise<void> {
    if (!approvalId) return;
    await this.prisma.approval.update({ where: { id: approvalId }, data: { executionStatus } });
  }

  /** 确定失败/人工撤销：退回 pendingRefundQty 占用，意图落终态。 */
  private async releaseRefund(intent: RefundIntent, failReason: string, status: 'failed' | 'released'): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.refundIntent.findUnique({ where: { id: intent.id } });
      if (!fresh) return;
      // 只释放仍在占用中的退款单：重复失败回调、迟到回调、已成功单都必须原样返回，
      // 否则会二次扣减 pendingRefundQty 变成负数。
      const openStatuses = ['occupied', 'processing', 'unknown'];
      if (!openStatuses.includes(fresh.status)) return;
      const claim = await tx.refundIntent.updateMany({
        where: { id: intent.id, status: { in: openStatuses } },
        data: { status, failReason, updatedAt: new Date() }
      });
      if (!claim.count) return;
      const lines = JSON.parse(fresh.linesJson) as Array<{ itemId: string; qty: number }>;
      for (const line of lines) {
        const released = await tx.orderItem.updateMany({
          where: { id: line.itemId, pendingRefundQty: { gte: line.qty } },
          data: { pendingRefundQty: { decrement: line.qty } }
        });
        if (!released.count) throw conflict('退款占用数量异常，已中止释放，请人工核对');
      }
      if (fresh.approvalId) {
        await tx.approval.update({ where: { id: fresh.approvalId }, data: { executionStatus: status } });
      }
      const order = await tx.order.findUnique({ where: { id: intent.orderId } });
      await logAction(tx, {
        actorName: '支付网关',
        action: status === 'failed' ? '退款失败释放' : '退款占用释放',
        detail: `${order?.number || intent.orderId} · ${intent.id} · ${failReason}`,
        type: 'refund',
        orderId: intent.orderId
      });
    });
  }

  /**
   * 确认退款（TX-04 落账 + TX-05 杯次映射）。
   * 幂等：意图已是 succeeded 直接返回。库存冲回与成本口径沿用「订单是否已制作」；
   * 未制作的杯按行、按标签序原子认领退掉，已出杯保持原状态。
   */
  private async confirmRefund(
    intent: RefundIntent,
    providerRef: string | null,
    order: Order,
    prepared: boolean,
    decidedBy: string
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.refundIntent.findUnique({ where: { id: intent.id } });
      if (!fresh) throw notFound('退款单不存在');
      if (fresh.status === 'succeeded') return;
      // 已确定失败/已释放的退款单不能再确认：钱是否真的出去需要人工核对，
      // 这里先原子认领状态，避免并发回调重复落账。
      const openStatuses = ['occupied', 'processing', 'unknown'];
      if (!openStatuses.includes(fresh.status)) {
        throw conflict(`退款单已处于 ${fresh.status} 状态，不能重复确认，请人工核对`);
      }
      const claim = await tx.refundIntent.updateMany({
        where: { id: intent.id, status: { in: openStatuses } },
        data: { status: 'succeeded', providerRef, updatedAt: now }
      });
      if (!claim.count) {
        const again = await tx.refundIntent.findUnique({ where: { id: intent.id } });
        if (again?.status === 'succeeded') return;
        throw conflict('退款单状态已变化，不能重复确认，请人工核对');
      }
      const orderRow = await tx.order.findUnique({ where: { id: intent.orderId } });
      if (!orderRow) throw notFound('订单不存在');
      const lines = JSON.parse(fresh.linesJson) as Array<{
        itemId: string;
        qty: number;
        costCents: number;
      }>;
      for (const line of lines) {
        const consumed = await tx.orderItem.updateMany({
          where: { id: line.itemId, pendingRefundQty: { gte: line.qty } },
          data: { refundedQty: { increment: line.qty }, pendingRefundQty: { decrement: line.qty } }
        });
        if (!consumed.count) throw conflict('退款占用数量异常，已中止确认，请人工核对');
        if (order.business === 'fresh' && !prepared) {
          const item = await tx.orderItem.findUnique({ where: { id: line.itemId } });
          const product = item ? await tx.product.findUnique({ where: { id: item.productId } }) : null;
          if (product?.kind === 'tea') {
            await tx.stock.updateMany({
              where: { storeId: orderRow.storeId, productId: product.id },
              data: { grams: { increment: product.doseG * line.qty } }
            });
          }
        }
      }
      const refunded = orderRow.refundedCents + fresh.amountCents;
      const fully = refunded >= orderRow.totalCents;
      await tx.order.update({
        where: { id: orderRow.id },
        data: {
          refundedCents: refunded,
          status: fully ? 'refunded' : orderRow.status,
          refundPending: false
        }
      });
      if (order.business === 'fresh') {
        for (const line of lines) {
          const units = await tx.orderUnit.findMany({
            where: { orderId: orderRow.id, itemId: line.itemId, status: 'pending' },
            orderBy: { label: 'asc' },
            take: line.qty
          });
          for (const unit of units) {
            await tx.orderUnit.update({ where: { id: unit.id }, data: { status: 'refunded' } });
          }
        }
      }
      await this.finance.addEntry(
        {
          orderId: orderRow.id,
          storeId: order.business === 'retail' ? 'brand' : orderRow.storeId,
          type: 'REFUND',
          amountCents: -fresh.amountCents,
          method: '原路退回',
          settlement: 'settled',
          memo: `退款 · ${fresh.reason || '顾客需求'} · ${fresh.id}`,
          costCents: prepared ? 0 : -lines.reduce((n, x) => n + x.costCents, 0),
          dedupeKey: `REFUND:${fresh.id}`,
          at: now.getTime()
        },
        tx
      );
      if (fresh.approvalId) {
        await tx.approval.update({ where: { id: fresh.approvalId }, data: { executionStatus: 'succeeded' } });
      }
      await logAction(tx, {
        actorId: null,
        actorName: decidedBy,
        action: '执行退款',
        detail: `${orderRow.number} · ¥${(fresh.amountCents / 100).toFixed(2)} · ${fresh.id}${prepared ? ' · 已制作，保留原料成本' : ' · 未制作，成本冲回'}${fresh.approvalId ? ` · 审批 ${fresh.approvalId}` : ''}`,
        type: 'refund',
        storeId: order.business === 'retail' ? 'brand' : orderRow.storeId,
        orderId: orderRow.id,
        at: now.getTime()
      });
    });
  }

  /** 未知/处理中退款单的重试入口（TX-04 可重试收敛）：复用同一 RF 单号调渠道。 */
  async retryRefundIntent(
    staff: StaffContext,
    refundIntentId: string
  ): Promise<{ ok: boolean; status: string; refundedCents: number; error?: string }> {
    const intent = await this.prisma.refundIntent.findUnique({ where: { id: refundIntentId } });
    if (!intent) throw notFound('退款单不存在');
    if (!hasPerm(staff, 'order:refund')) throw forbidden('当前账号没有退款权限');
    const order = await this.getOrderRow(intent.orderId);
    if (order.business === 'retail') assertStoreAccess(staff, order.pickupStoreId || 'brand');
    else this.assertStaffStore(staff, order.storeId);
    if (intent.status === 'succeeded') {
      return { ok: true, status: intent.status, refundedCents: intent.amountCents };
    }
    if (intent.status === 'failed' || intent.status === 'released') {
      // TX-12：审批路径的确定失败可从同一审批恢复——重新占用并以新退款单执行，
      // 不需要再走一轮审批，也绝不重复落账（台账按退款单去重）。
      if (!intent.approvalId) {
        throw conflict('该退款单已失败释放，请重新发起退款申请');
      }
      const lines = JSON.parse(intent.linesJson) as Array<{ itemId: string; qty: number }>;
      const freshOrder = await this.getOrderRow(intent.orderId);
      const quote = await this.refundQuoteForOrder(
        freshOrder.id,
        lines.map((x) => ({ itemId: x.itemId, qty: x.qty }))
      );
      const prepared = await this.isOrderPrepared(freshOrder.id);
      const newIntentId = await this.occupyRefund(freshOrder, quote.quote, {
        reason: intent.reason || '审批退款重试',
        approvalId: intent.approvalId,
        decidedBy: staff.name,
        requestedBy: intent.requestedBy,
        claimApproval: false
      });
      const freshIntent = (await this.prisma.refundIntent.findUnique({
        where: { id: newIntentId }
      }))!;
      const retried = await this.runGatewayRefund(freshIntent, freshOrder, prepared, staff.name);
      if (!retried.ok) {
        return { ok: false, status: 'unknown', refundedCents: 0, error: retried.error };
      }
      if (retried.pending) {
        return { ok: true, status: 'processing', refundedCents: 0 };
      }
      return { ok: true, status: 'succeeded', refundedCents: quote.quote.amount };
    }
    const result = await this.runGatewayRefund(intent, order, await this.isPrepared(order), staff.name);
    if (!result.ok) return { ok: false, status: 'unknown', refundedCents: 0, error: result.error };
    if (result.pending) return { ok: true, status: 'processing', refundedCents: 0 };
    return { ok: true, status: 'succeeded', refundedCents: intent.amountCents };
  }

  async retailLookup(staff: StaffContext, code: string) {
    const digits = String(code || '').replace(/\D/g, '');
    if (digits.length !== 4) throw badRequest('请输入顾客的 4 位提货码');
    const row = await this.prisma.order.findFirst({
      where: { business: 'retail', pickupCode: digits, status: 'awaiting' },
      orderBy: { createdAt: 'desc' }
    });
    if (!row) throw notFound('没有匹配的待交付零售订单');
    return this.getOrder(row.id);
  }

  async deliverRetail(staff: StaffContext, input: { orderId: string; storeId: string; code: string }) {
    const order = await this.getOrderRow(input.orderId);
    if (order.business !== 'retail') throw badRequest('仅零售订单需要交付确认');
    // 提货码先于状态判断：已交付回读也必须对码，错码不得凭状态放行（TX-08）。
    const code = String(input.code || '').replace(/\D/g, '');
    if (!code || code !== order.pickupCode) {
      throw badRequest('提货码不正确，请让顾客重新核对 4 位数字');
    }
    if (order.status === 'delivered') return this.getOrder(order.id); // 对码幂等回读
    if (order.status !== 'awaiting') throw conflict('该订单不可交付');
    // 先校验门店权限，再判断门店营业状态：跨店操作必须稳定返回 403，不能泄露门店状态。
    assertStoreAccess(staff, input.storeId);
    const store = await this.prisma.store.findUnique({ where: { id: input.storeId } });
    if (!store) throw notFound('门店不存在');
    if (!store.open || !store.retailPickup) throw conflict('本店暂不可领取，请选择其他门店');
    const items = await this.prisma.orderItem.findMany({
      where: { orderId: order.id, qty: { gt: 0 } }
    });
    const active = items.filter((item) => item.qty > item.refundedQty);
    await this.prisma.$transaction(async (tx) => {
      // 事务内条件认领：两店/两操作者并发时只有一个能把 awaiting 迁移为 delivered。
      const claim = await tx.order.updateMany({
        where: { id: order.id, status: 'awaiting' },
        data: { status: 'delivered', pickupStoreId: input.storeId, deliveredAt: new Date() }
      });
      if (!claim.count) throw conflict('该订单刚被其他门店或店员交付，请刷新后确认');
      for (const item of active) {
        const qty = item.qty - item.refundedQty;
        // 条件扣减：库存不足抛错整体回滚（含认领），可安全重试。
        const dec = await tx.stock.updateMany({
          where: { storeId: input.storeId, productId: item.productId, grams: { gte: qty } },
          data: { grams: { decrement: qty } }
        });
        if (!dec.count) throw conflict(`${item.name} 在本店库存不足，请调货或选择其他门店`);
      }
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '确认零售交付',
        detail: `${order.number} · ${store.name} · 4 位提货码核验通过`,
        type: 'order',
        storeId: input.storeId,
        orderId: order.id
      });
    });
    return this.getOrder(order.id);
  }

  async orderLogs(orderId: string) {
    const rows = await this.prisma.log.findMany({
      where: { orderId },
      orderBy: [{ at: 'asc' }, { id: 'asc' }]
    });
    return rows.map((row) => ({
      id: row.id,
      actor: row.actorName || '系统',
      action: row.action,
      detail: row.detail,
      type: row.type,
      at: row.at.getTime()
    }));
  }

  /** TX-10：顾客历史按 createdAt+id 倒序游标分页，hasMore/nextCursor 供继续翻页。 */
  async customerOrders(
    customerId: string,
    options: { limit?: number; cursor?: string | null } = {}
  ): Promise<{ orders: Awaited<ReturnType<OrdersService['listOrders']>>; hasMore: boolean; nextCursor: string | null }> {
    const limit = Math.min(Math.max(Math.floor(options.limit || 10), 1), 50);
    const rows = await this.prisma.order.findMany({
      where: { customerId },
      include: ORDER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: limit + 1
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const stores = await this.prisma.store.findMany();
    const names = new Map(stores.map((s) => [s.id, s.name]));
    return {
      orders: page.map((row) =>
        mapOrder(
          row,
          row.items,
          row.units,
          row.business === 'retail' ? '品牌零售' : names.get(row.storeId) || row.storeId
        )
      ),
      hasMore,
      nextCursor: hasMore ? page[page.length - 1].id : null
    };
  }

  async customerOrder(customerId: string, id: string) {
    const order = await this.getOrder(id);
    if (order.customerId !== customerId) throw notFound('订单不存在');
    return order;
  }
}
