import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Business } from '@fullyu/crm-shared';
import { fromExternalBusiness } from '@fullyu/crm-shared';
import { PrismaService } from '../common/prisma.service';
import { unauthorized } from '../common/errors';
import { readBearer } from '../auth/staff.guard';

export type GameSessionContext = {
  memberId: string;
  business: Business;
  ticketId: string;
};

export type GameSessionRequest = Request & { game?: GameSessionContext };

type GameTokenPayload = {
  kind?: string;
  sub?: string;
  business?: string;
  ticketId?: string;
};

/**
 * 游戏 H5 短期会话守卫。
 * 票据已换成 2 小时 JWT，只允许读取/掷骰该会员自己的愈行之旅数据。
 */
@Injectable()
export class GameSessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GameSessionRequest>();
    const token = readBearer(request);
    if (!token) throw unauthorized('会员会话已失效，请回到会员页重新进入');
    let payload: GameTokenPayload;
    try {
      payload = this.jwt.verify<GameTokenPayload>(token);
    } catch {
      throw unauthorized('会员会话已失效，请回到会员页重新进入');
    }
    const business = fromExternalBusiness(payload.business || '');
    if (payload.kind !== 'game' || !payload.sub || !payload.ticketId || !business) {
      throw unauthorized('会员会话已失效，请回到会员页重新进入');
    }
    const member = await this.prisma.member.findUnique({ where: { id: payload.sub } });
    if (!member || member.status !== 'ACTIVE') {
      throw unauthorized('会员已停用，不能继续旅途');
    }
    request.game = { memberId: member.id, business, ticketId: payload.ticketId };
    return true;
  }
}
