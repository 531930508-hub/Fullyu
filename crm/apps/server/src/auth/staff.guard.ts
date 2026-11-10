import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { StaffService } from './staff.service';
import { unauthorized } from '../common/errors';
import type { StaffContext } from '../common/auth.types';

export function readBearer(request: Request): string {
  const header = request.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export type TokenPayload = { kind?: string; sub?: string; ver?: number };

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly staffService: StaffService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { staff?: StaffContext }>();
    const token = readBearer(request);
    if (!token) throw unauthorized();
    let payload: TokenPayload;
    try {
      payload = this.jwt.verify<TokenPayload>(token);
    } catch {
      throw unauthorized('登录状态已过期，请重新登录');
    }
    if (payload.kind !== 'staff' || !payload.sub) throw unauthorized();
    const staff = await this.staffService.load(payload.sub);
    if (!staff || !staff.active) throw unauthorized('账号已停用或不存在');
    if (payload.ver !== staff.tokenVersion) throw unauthorized('登录状态已失效，请重新登录');
    request.staff = staff;
    return true;
  }
}
