import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import { ApiError } from '../common/errors';
import { parseInput } from '../common/zod';
import { CustomerGuard } from '../auth/customer.guard';
import { Customer } from '../auth/decorators';
import type { CustomerContext } from '../common/auth.types';
import { BrandMemberClient } from '../crm/brand-member.client';

const quoteSchema = z.object({
  productCode: z.string().trim().regex(/^FY_[A-Z0-9_]{2,30}$/, 'productCode 格式不正确')
});

const purchaseSchema = quoteSchema;

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
 * 顾客品牌会员入口（Full愈年卡 / 月卡）。
 *
 * 小程序只访问本服务：签名密钥留在服务端，会员身份固定取当前登录顾客，
 * 前端无法通过改 localUserId、金额或积分伪造他人身份与权益。
 * 支付通道接入前，购买入口明确返回未开通，不跳过扣款直接开卡。
 */
@Controller('customer/brand-member')
@UseGuards(CustomerGuard)
export class CustomerBrandMemberController {
  constructor(private readonly brand: BrandMemberClient) {}

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
   * 购卡支付：时叙现有支付链路只覆盖茶饮/零售订单，品牌卡订单与回调尚未接入。
   * 此处如实返回未开通，避免出现「点一下就开通」的假支付；接入真实支付后
   * 由服务端在验签回调里调用 CRM 开卡。
   */
  @Post('purchase')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  purchase(@Body() body: unknown) {
    parseInput(purchaseSchema, body ?? {});
    throw new ApiError(501, '会员卡支付通道尚未接入，暂不能在时叙开通', {
      code: 'PAYMENT_NOT_ENABLED'
    });
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
