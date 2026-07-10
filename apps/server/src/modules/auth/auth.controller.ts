import { Controller, Post, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { Public } from '../../common/decorators/public.decorator'

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('wechat/phone-login')
  @ApiOperation({ summary: '微信手机号一键登录' })
  async wechatPhoneLogin(
    @Body() body: { loginCode: string; phoneCode: string },
  ) {
    return this.authService.wechatPhoneLogin(body.loginCode, body.phoneCode)
  }

  @Public()
  @Post('admin/login')
  @ApiOperation({ summary: '管理后台登录' })
  async adminLogin(@Body() body: { username: string; password: string }) {
    return this.authService.adminLogin(body.username, body.password)
  }
}
