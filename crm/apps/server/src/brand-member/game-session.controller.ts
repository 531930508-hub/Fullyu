import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';
import { GameService } from '../game/game.service';
import { BrandMemberService } from './brand-member.service';
import {
  GameSessionGuard,
  type GameSessionRequest
} from './game-session.guard';

/**
 * 愈行之旅 H5 的短期会话入口。
 * 票据由三端服务端签名换取；H5 只持 2 小时会员会话，不接触业务密钥。
 */
@Controller('v1/brand-member/game')
export class GameSessionController {
  constructor(
    private readonly members: BrandMemberService,
    private readonly game: GameService
  ) {}

  @Post('exchange')
  @HttpCode(201)
  exchange(@Body() body: { ticket?: string }) {
    return this.members.exchangeGameTicket(body?.ticket);
  }

  @Get('session')
  @UseGuards(GameSessionGuard)
  session(@Req() req: GameSessionRequest) {
    return this.game.sessionForMember(req.game!.memberId, req.game!.business);
  }

  @Post('session/roll')
  @HttpCode(201)
  @UseGuards(GameSessionGuard)
  roll(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: GameSessionRequest
  ) {
    const game = req.game!;
    return this.game.rollForMember(
      game.memberId,
      game.business,
      `gt:${game.ticketId}`,
      idempotencyKey
    );
  }
}
