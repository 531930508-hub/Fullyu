import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import {
  BrandMemberGuard,
  type BrandMemberRequest
} from './brand-member.guard';
import {
  BrandMemberService,
  type IssueInput,
  type MeQuery,
  type QuoteInput,
  type RefundInput,
  type TicketInput
} from './brand-member.service';

/**
 * 三端（时叙 / 在场 / 轻疗）品牌会员入口。
 * 路径不含 /api：全局前缀会补上，签名按含 /api 的完整 originalUrl 计算。
 */
@Controller('v1/brand-member')
@UseGuards(BrandMemberGuard)
export class BrandMemberController {
  constructor(private readonly service: BrandMemberService) {}

  @Get('me')
  me(@Query() query: MeQuery, @Req() req: BrandMemberRequest) {
    return this.service.me(query, req.fy!);
  }

  @Get('products')
  products() {
    return this.service.products();
  }

  @Post('quote')
  @HttpCode(201)
  quote(@Body() body: QuoteInput, @Req() req: BrandMemberRequest) {
    return this.service.quote(body, req.fy!);
  }

  @Post('issue')
  @HttpCode(201)
  issue(
    @Body() body: IssueInput,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: BrandMemberRequest
  ) {
    return this.service.issue(body, req.fy!, idempotencyKey);
  }

  @Post('refund')
  @HttpCode(201)
  refund(
    @Body() body: RefundInput,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: BrandMemberRequest
  ) {
    return this.service.refund(body, req.fy!, idempotencyKey);
  }

  @Post('game/ticket')
  @HttpCode(201)
  ticket(@Body() body: TicketInput, @Req() req: BrandMemberRequest) {
    return this.service.gameTicket(body, req.fy!);
  }
}
