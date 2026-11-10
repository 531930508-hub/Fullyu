import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { StaffContext } from '../common/auth.types';

export const PERMISSION_KEY = 'fullyu:crm:permission';

export const RequirePerm = (permission: string) => SetMetadata(PERMISSION_KEY, permission);

export const Staff = createParamDecorator((_data: unknown, ctx: ExecutionContext): StaffContext => {
  const request = ctx.switchToHttp().getRequest<Request & { staff?: StaffContext }>();
  return request.staff as StaffContext;
});
