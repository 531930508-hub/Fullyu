import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../common/prisma.service';
import { unauthorized } from '../common/errors';
import type { CustomerContext } from '../common/auth.types';
import { readBearer, type TokenPayload } from './staff.guard';

@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { customer?: CustomerContext }>();
    const token = readBearer(request);
    if (!token) throw unauthorized('请先建立顾客会话');
    let payload: TokenPayload;
    try {
      payload = this.jwt.verify<TokenPayload>(token);
    } catch {
      throw unauthorized('顾客会话已过期');
    }
    if (payload.kind !== 'customer' || !payload.sub) throw unauthorized();
    const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
    if (!customer) throw unauthorized('顾客会话不存在');
    // 会话吊销：版本号对不上说明该会话已被服务端主动作废（如风控/重置），立即拒绝。
    if (payload.ver !== customer.sessionVersion) throw unauthorized('会话已失效，请重新进入');
    request.customer = {
      id: customer.id,
      memberCode: customer.memberCode,
      name: customer.name,
      phone: customer.phone
    };
    return true;
  }
}
