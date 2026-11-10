import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSION_KEY } from './decorators';
import { assertPerm, type StaffContext } from '../common/auth.types';
import { forbidden } from '../common/errors';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!permission) return true;
    const request = context.switchToHttp().getRequest<Request & { staff?: StaffContext }>();
    if (!request.staff) throw forbidden();
    assertPerm(request.staff, permission);
    return true;
  }
}
