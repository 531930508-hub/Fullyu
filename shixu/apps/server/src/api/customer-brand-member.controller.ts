import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { parseInput } from '../common/zod';
import { CustomerGuard } from '../auth/customer.guard';
import { Customer } from '../auth/decorators';
import type { CustomerContext } from '../common/auth.types';
import { BrandCardPaymentService } from '../crm/brand-card-payment.service';
import { BrandMemberClient } from '../crm/brand-member.client';

const quoteSchema = z.object({
  productCode: z.string().trim().regex(/^FY_[A-Z0-9_]{2,30}$/, 'productCode 格式不正确')
});

const purchaseSchema = quoteSchema;

/**
 * 产品目录只含公开售价与时长，登录前的首页也要展示 CRM 当前价，
 * 因此单独开放为只读；任何写操作仍必须经过顾客身份校验。
 */
@Controller('brand-member')
export class PublicBrandMemberController {
  constructor(private readonly brand: BrandMemberClient) {}

  @Get('products')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  products() {
    return this.brand.products();
  }
}

const giftSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{4,16}$/, '会员码为 4–16 位字母或数字'))
});

const feedbackSchema = z.object({
  content: z.string().trim().min(5, '至少写 5 个字').max(1000, '最多 1000 字'),
  allowQuote: z.boolean().optional().default(false)
});

/**
 * 顾客品牌会员入口（Full愈大会员 / 月会员）。
 *
 * 小程序只访问本服务：签名密钥留在服务端，会员身份固定取当前登录顾客，
 * 前端无法通过改 localUserId、金额或积分伪造他人身份与权益。
 * 购卡走真实支付：服务端按 CRM 报价建单 → JSAPI 预下单 → 验签回调落账后向 CRM 开卡。
 */
@Controller('customer/brand-member')
@UseGuards(CustomerGuard)
export class CustomerBrandMemberController {
  constructor(
    private readonly brand: BrandMemberClient,
    private readonly cardPayments: BrandCardPaymentService
  ) {}

  @Get('me')
  me(@Customer() customer: CustomerContext) {
    return this.brand.me(customer.id);
  }

  @Get('products')
  products() {
    return this.brand.products();
  }

  /** 报价供支付前展示；金额由 CRM 决定，客户端传入的价格一律忽略。 */
  @Post('quote')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  quote(@Body() body: unknown, @Customer() customer: CustomerContext) {
    const input = parseInput(quoteSchema, body ?? {});
    return this.brand.quote(customer.id, input.productCode);
  }

  /**
   * 购卡支付：金额取服务端向 CRM 的实时报价，客户端只给 productCode。
   * 返回 wx.requestPayment 参数与 prepayMode；订单在验签回调落账后才开卡。
   */
  @Post('purchase')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  purchase(@Body() body: unknown, @Customer() customer: CustomerContext, @Req() req: Request) {
    const input = parseInput(purchaseSchema, body ?? {});
    return this.cardPayments.purchase({
      customerId: customer.id,
      productCode: input.productCode,
      clientIp: req.ip
    });
  }

  /** 最近一张会员卡订单：顾客支付后轮询它收敛状态（待支付时会顺手向渠道查询一次）。 */
  @Get('orders/latest')
  latestOrder(@Customer() customer: CustomerContext) {
    return this.cardPayments.latestOrder(customer.id).then((order) => ({ order }));
  }

  @Get('orders/:id')
  order(@Param('id') id: string, @Customer() customer: CustomerContext) {
    return this.cardPayments.getOrder(customer.id, id).then((order) => ({ order }));
  }

  /** 顾客放弃支付：关闭待支付单，未扣款。 */
  @Post('orders/:id/close')
  @HttpCode(200)
  close(@Param('id') id: string, @Customer() customer: CustomerContext) {
    return this.cardPayments.closePending(customer.id, id).then((order) => ({ order }));
  }

  /** 愈行之旅：服务端换一次性票据，小程序用 web-view 打开 CRM 托管的游戏。 */
  @Post('game/ticket')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  gameTicket(@Customer() customer: CustomerContext) {
    return this.brand.gameTicket(customer.id);
  }

  /** 会员码兑换：渠道/天数/名额由 CRM 判定，这里只校验格式并固定身份。 */
  @Post('gift/claim')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  claimGift(@Body() body: unknown, @Customer() customer: CustomerContext) {
    const input = parseInput(giftSchema, body ?? {});
    return this.brand.claimGift(customer.id, input.code);
  }

  /** 意见反馈：仅有效会员可提交；勾选 allowQuote 才可能被整理进会员故事。 */
  @Post('feedback')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  feedback(@Body() body: unknown, @Customer() customer: CustomerContext) {
    const input = parseInput(feedbackSchema, body ?? {});
    return this.brand.submitFeedback(customer.id, input.content, input.allowQuote === true);
  }

  /** 会员故事：只对有效会员开放。 */
  @Get('stories')
  stories(@Customer() customer: CustomerContext) {
    return this.brand.stories(customer.id);
  }
}
