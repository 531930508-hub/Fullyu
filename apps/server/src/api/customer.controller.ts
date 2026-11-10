import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import { ApiError, badRequest, notImplemented } from '../common/errors';
import { parseInput } from '../common/zod';
import { CustomerGuard } from '../auth/customer.guard';
import { Customer } from '../auth/decorators';
import { AuthService, annualDiscountCents } from '../auth/auth.service';
import type { CustomerContext } from '../common/auth.types';
import { CatalogService } from '../catalog/catalog.service';
import { ContentService } from '../content/content.service';
import { CouponsService } from '../coupons/coupons.service';
import { OrdersService } from '../orders/orders.service';
import { HardwareService } from '../hardware/hardware.module';
import { mapPublicOrder } from '../common/mappers';

const itemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1).max(20),
  temp: z.string().max(20).nullable().optional(),
  ice: z.string().max(20).nullable().optional()
});

const orderSchema = z.object({
  storeId: z.string().min(1),
  business: z.enum(['fresh', 'retail']),
  type: z.enum(['dine', 'takeaway', 'delivery', 'retail']),
  seat: z.string().max(30).nullable().optional(),
  items: z.array(itemSchema).min(1).max(30),
  note: z.string().max(200).optional(),
  memberCode: z.string().max(40).optional(),
  // 顾客持券实例 ID；服务端核验归属、状态、有效期、品类与门槛。
  couponId: z.string().trim().min(1).max(64).optional(),
  // 客户端幂等键：网络重试时携带同一键，服务端保证同键同内容返回同单。
  idempotencyKey: z.string().trim().min(4).max(64).optional()
});

const profileSchema = z
  .object({
    name: z.string().max(40).optional(),
    // 1=男 2=女 null=未填写，与在场一致
    gender: z.union([z.literal(1), z.literal(2), z.null()]).optional(),
    birthday: z.union([z.string().max(10), z.null()]).optional()
  })
  .refine(
    (value) => value.name !== undefined || value.gender !== undefined || value.birthday !== undefined,
    { message: '没有需要更新的资料' }
  );

const avatarSchema = z.object({
  // 允许带 data URL 前缀，服务端会剥离；2MB 的 base64 约 2.8MB 字符
  base64: z.string().min(1).max(3_000_000),
  contentType: z.enum(['image/jpeg', 'image/jpg', 'image/png'])
});

@Controller('customer')
export class CustomerController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly orders: OrdersService,
    private readonly hardware: HardwareService,
    private readonly auth: AuthService,
    private readonly coupons: CouponsService,
    private readonly content: ContentService
  ) {}

  /** 首页小程序码缓存：微信生成结果长期有效，24 小时内直接复用。 */
  private shareCodeCache: {
    payload: { page: string; scene: string; image: string };
    expiresAt: number;
  } | null = null;

  /**
   * 分享海报用小程序码：扫码直接进入首页。
   * 小程序码由微信生成后长期不变，按页面缓存 24 小时，避免每次打开分享弹层都请求微信。
   * mock 环境没有开放接口，如实返回未实现，不拿普通二维码冒充。
   */
  @Get('share/code')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async shareCode() {
    const cached = this.shareCodeCache;
    if (cached && cached.expiresAt > Date.now()) return cached.payload;

    if (typeof this.hardware.wechat.shareCode !== 'function') {
      throw notImplemented('当前微信适配层未启用真实小程序码，请在部署环境使用 live 模式');
    }

    let code;
    try {
      code = await this.hardware.wechat.shareCode({
        page: 'pages/index/index',
        scene: 'share',
        width: 430
      });
    } catch (error) {
      throw new ApiError(503, `分享小程序码生成失败：${(error as Error).message || '微信接口异常'}`);
    }

    const payload = {
      page: code.page,
      scene: code.scene,
      image: `data:${code.contentType};base64,${code.base64}`
    };
    this.shareCodeCache = { payload, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    return payload;
  }

  @Get('stores')
  async stores() {
    return { stores: await this.catalog.listStores() };
  }

  @Get('bootstrap')
  async bootstrap(@Query() query: unknown) {
    const input = parseInput(z.object({ storeId: z.string().optional() }), query ?? {});
    const stores = await this.catalog.listStores();
    // 只有「对外营业 + 开通小程序渠道」的门店可作为默认/缓存门店；
    // 已缓存但暂停营业或未开通小程序的门店，回到第一家可下单门店，避免把顾客落到筹备中门店。
    const orderable = (store: (typeof stores)[number]) => store.open && store.channels?.mini !== false;
    const requested = input.storeId ? stores.find((store) => store.id === input.storeId && orderable(store)) : undefined;
    const fallback = stores.find(orderable) || stores.find((store) => store.open) || stores[0];
    const storeId = requested?.id || fallback?.id;
    if (!storeId) throw badRequest('暂无可用门店');
    const catalog = await this.catalog.catalogForStore(storeId);
    return {
      stores,
      store: catalog.store,
      categories: catalog.categories,
      products: catalog.products,
      retail: await this.catalog.retailAvailability(),
      // 首页轮播与系列图覆盖；后台未配置时小程序回落到内置图。
      home: await this.content.publicHome(),
      hardware: {
        payment: this.hardware.payment.mode,
        member: this.hardware.member.mode,
        printer: this.hardware.printer.mode,
        teaMachine: this.hardware.teaMachine.mode
      }
    };
  }

  @Get('menu')
  async menu(@Query() query: unknown) {
    const input = parseInput(z.object({ storeId: z.string().min(1) }), query ?? {});
    const catalog = await this.catalog.catalogForStore(input.storeId);
    return { ...catalog, categories: await this.catalog.listCategories() };
  }

  @Post('member/verify')
  async verifyMember(@Body() body: unknown) {
    const input = parseInput(z.object({ code: z.string().trim().min(1) }), body);
    const benefit = await this.auth.memberBenefitByCode(input.code);
    // 公共入口只返回是否年卡与减免金额，不返回姓名等个人资料。
    return {
      benefit: benefit
        ? {
            code: benefit.code,
            tier: benefit.tier,
            discountPerCupCents: benefit.discountPerCupCents
          }
        : null,
      mode: 'db'
    };
  }

  /**
   * 微信手机号登录：wx.login 的 code 换 openId，getPhoneNumber 的 code 换手机号。
   * 手机号是唯一身份；H5 预览可在 mock 适配层直接提交手机号（真实环境只认微信授权）。
   */
  @Post('wechat/login')
  // 登录是唯一无需身份即可写入会话的入口，单独限流防止被当作验证码/手机号探测通道。
  // 微信授权正常一次通过；额度放宽到 120 次/分钟，覆盖审核与弱网下的连续重试，
  // 避免正常顾客在反复操作时误触「操作太频繁」。真正的高频探测仍会被 429 拦下。
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async wechatLogin(@Body() body: unknown) {
    const input = parseInput(
      z.object({
        code: z.string().trim().max(200).optional(),
        phoneCode: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(20).optional(),
        name: z.string().trim().max(30).optional()
      }),
      body ?? {}
    );
    return this.auth.createWechatSession(input);
  }

  /** getPhoneNumber 授权回传；mock 适配层返回模拟号码，真实实现需 session_key 解密。 */
  @Post('wechat/phone')
  @UseGuards(CustomerGuard)
  async wechatPhone(@Body() body: unknown, @Customer() customer: CustomerContext) {
    const input = parseInput(
      z.object({
        code: z.string().trim().max(200).optional(),
        encryptedData: z.string().max(4000).optional(),
        iv: z.string().max(200).optional()
      }),
      body ?? {}
    );
    return this.auth.bindWechatPhone(customer.id, input);
  }

  /** 个人资料维护：姓名、性别、生日。字段口径与在场一致。 */
  @Put('profile')
  @UseGuards(CustomerGuard)
  async updateProfile(@Body() body: unknown, @Customer() customer: CustomerContext) {
    const input = parseInput(profileSchema, body ?? {});
    return { customer: await this.auth.updateCustomerProfile(customer.id, input) };
  }

  /** 头像上传：base64 直传，落 AvatarStorageProvider，库里只存 key。 */
  @Post('avatar')
  @UseGuards(CustomerGuard)
  async updateAvatar(@Body() body: unknown, @Customer() customer: CustomerContext) {
    const input = parseInput(avatarSchema, body ?? {});
    return { customer: await this.auth.updateCustomerAvatar(customer.id, input) };
  }

  /**
   * JSAPI 预下单：异步渠道（汇付）返回真实 wx.requestPayment 参数；mock 仍返回模拟回执。
   * TX-01：渠道身份必须读取当前顾客已验证的 openId；未绑定微信的会话不得发起支付。
   * 客户端必须按 prepayMode 判断支付参数的真实性，不能用模拟回执冒充真实扣款。
   */
  @Post('orders/:id/prepay')
  @UseGuards(CustomerGuard)
  async prepay(@Param('id') id: string, @Customer() customer: CustomerContext, @Req() req: Request) {
    const row = await this.auth.getCustomerRow(customer.id);
    const openId = row?.openId || null;
    const result = await this.orders.prepayOrder({
      orderId: id,
      customerId: customer.id,
      openId: openId || '',
      clientIp: req.ip
    });
    return {
      paid: result.paid,
      payment: result.payment,
      mode: result.mode,
      prepayMode: result.prepayMode
    };
  }

  /** 顾客放弃支付：未支付订单取消并回补库存/释放券；已支付订单拒绝取消。 */
  @Post('orders/:id/cancel')
  @UseGuards(CustomerGuard)
  async cancelOrder(@Param('id') id: string, @Customer() customer: CustomerContext) {
    return { order: mapPublicOrder(await this.orders.cancelUnpaidOrder(customer.id, id)) };
  }

  /** 支付状态轮询：回调可能晚于 wx.requestPayment 的成功返回，客户端据此确认到账。 */
  @Get('orders/:id/payment')
  @UseGuards(CustomerGuard)
  async paymentStatus(@Param('id') id: string, @Customer() customer: CustomerContext) {
    const order = await this.orders.customerOrder(customer.id, id);
    const row = await this.orders.getOrderRow(order.id);
    const status = await this.orders.refreshPaymentStatus(row);
    return { ...status, order: mapPublicOrder(await this.orders.getOrder(order.id)) };
  }

  @Post('orders')
  @UseGuards(CustomerGuard)
  async createOrder(@Body() body: unknown, @Customer() customer: CustomerContext) {
    const input = parseInput(orderSchema, body);
    // 手机号是会员唯一身份：没有手机号的旧会话不能下单，避免出现无身份订单。
    const row = await this.auth.getCustomerRow(customer.id);
    if (!row?.phone) throw badRequest('请先使用微信手机号登录');
    // 折扣只认当前登录账号的库内会籍：客户端传来的 memberCode 不参与判定，
    // 避免普通会员或他人的会员码被误当成折扣凭证。
    const discount = input.business === 'fresh' ? annualDiscountCents(row) : 0;
    const result = await this.orders.createOrder({
      storeId: input.storeId,
      business: input.business,
      channel: 'mini',
      type: input.type,
      seat: input.seat,
      items: input.items,
      note: input.note,
      customerId: customer.id,
      ownerKind: 'customer',
      memberDiscountPerCupCents: discount,
      couponId: input.couponId,
      paymentMethod: 'wechat',
      idempotencyKey: input.idempotencyKey
    });
    return {
      order: mapPublicOrder(result.order),
      printError: result.printError,
      payment: result.payment
    };
  }

  /** 我的券：可用在前，含已使用与已过期，状态由服务端按有效期计算。 */
  @Get('coupons')
  @UseGuards(CustomerGuard)
  async myCoupons(@Customer() customer: CustomerContext) {
    return this.coupons.listForCustomer(customer.id);
  }

  @Get('orders')
  @UseGuards(CustomerGuard)
  async myOrders(@Query() query: unknown, @Customer() customer: CustomerContext) {
    const input = parseInput(
      z.object({
        limit: z.coerce.number().int().min(1).max(50).optional(),
        cursor: z.string().min(1).max(64).optional()
      }),
      query ?? {}
    );
    const page = await this.orders.customerOrders(customer.id, {
      limit: input.limit,
      cursor: input.cursor
    });
    return {
      orders: page.orders.map(mapPublicOrder),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor
    };
  }

  @Get('orders/:id')
  @UseGuards(CustomerGuard)
  async myOrder(@Param('id') id: string, @Customer() customer: CustomerContext) {
    const order = await this.orders.customerOrder(customer.id, id);
    return { order: mapPublicOrder(await this.orders.getOrder(order.id)) };
  }

  @Get('retail')
  async retail() {
    return { products: await this.catalog.retailAvailability() };
  }
}
