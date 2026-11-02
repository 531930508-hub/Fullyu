import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CustomerContext, StaffContext } from '../common/auth.types';

export const PERMISSION_KEY = 'teahour:permission';

export const RequirePerm = (permission: string) => SetMetadata(PERMISSION_KEY, permission);

export const Staff = createParamDecorator((_data: unknown, ctx: ExecutionContext): StaffContext => {
  const request = ctx.switchToHttp().getRequest<Request & { staff?: StaffContext }>();
  return request.staff as StaffContext;
});

export const Customer = createParamDecorator((_data: unknown, ctx: ExecutionContext): CustomerContext => {
  const request = ctx.switchToHttp().getRequest<Request & { customer?: CustomerContext }>();
  return request.customer as CustomerContext;
});
