import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { UserService } from './user.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('用户（后台）')
@Controller('user-admin')
export class UserAdminController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @AdminAuth('user:view')
  @ApiOperation({ summary: '后台用户列表' })
  async list(@Query('keyword') keyword?: string) {
    return this.userService.adminList({ keyword })
  }
}
