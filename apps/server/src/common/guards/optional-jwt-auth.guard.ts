import { ExecutionContext, Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/**
 * 可选登录态：带 token 时解析用户，未登录也放行。
 * 用于公开列表需要按登录身份裁剪内容（如社群内部活动）的场景。
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(_err: any, user: any, _info: any, _context: ExecutionContext) {
    return user || null
  }
}
