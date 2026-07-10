import { createParamDecorator, ExecutionContext } from '@nestjs/common'

/** 注入当前登录小程序用户（req.user，含 userId/phone/isTrainer） */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest()
    return data ? req.user?.[data] : req.user
  },
)

/** 注入当前登录管理员（req.user，含 adminId/username/permissions） */
export const CurrentAdmin = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest()
    return data ? req.user?.[data] : req.user
  },
)
