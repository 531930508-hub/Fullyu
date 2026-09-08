import { Controller, Post, Get, Body, Req } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { PasswordPolicyService } from '../../common/password-policy.service'
import { Public } from '../../common/decorators/public.decorator'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'
import { CurrentAdmin } from '../../common/decorators/current-user.decorator'
import type { AdminContext } from './admin-jwt.strategy'

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  @Public()
  @Get('password-policy')
  @ApiOperation({ summary: '当前生效的密码策略（前端表单按此校验，不含任何敏感信息）' })
  async passwordPolicyInfo() {
    return this.passwordPolicy.describe()
  }

  @Public()
  @Post('wechat/phone-login')
  @ApiOperation({ summary: '微信手机号一键登录' })
  async wechatPhoneLogin(
    @Body() body: { loginCode: string; phoneCode: string },
  ) {
    return this.authService.wechatPhoneLogin(body.loginCode, body.phoneCode)
  }

  @Public()
  @Post('dev/login')
  @ApiOperation({ summary: '【仅本地开发】手机号快捷登录（DEV_LOGIN_ENABLED 开启时生效）' })
  async devLogin(@Body() body: { phone: string }) {
    return this.authService.devLogin(body.phone)
  }

  @Public()
  @Post('admin/login')
  @ApiOperation({ summary: '管理后台登录' })
  async adminLogin(@Body() body: { username: string; password: string }) {
    return this.authService.adminLogin(body.username, body.password)
  }

  @Get('admin/profile')
  @AdminAuth()
  @ApiOperation({ summary: '当前管理员权限画像（权限码/数据范围/归属组织）' })
  async adminProfile(@CurrentAdmin() admin: AdminContext) {
    return this.authService.adminProfile(admin.adminId)
  }

  @Post('admin/change-password')
  @AdminAuth()
  @ApiOperation({ summary: '管理员修改密码' })
  async adminChangePassword(
    @CurrentAdmin() admin: AdminContext,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    return this.authService.adminChangePassword(admin.adminId, body.oldPassword, body.newPassword)
  }
}
