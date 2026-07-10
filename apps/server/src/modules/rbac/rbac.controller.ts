import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { RbacService } from './rbac.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('权限管理')
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('admins')
  @AdminAuth('rbac:view')
  @ApiOperation({ summary: '管理员列表' })
  async listAdmins() {
    return this.rbacService.listAdmins()
  }

  @Post('admins')
  @AdminAuth('rbac:create')
  @ApiOperation({ summary: '创建管理员' })
  async createAdmin(@Body() body: any) {
    return this.rbacService.createAdmin(body)
  }

  @Put('admins/:id')
  @AdminAuth('rbac:update')
  @ApiOperation({ summary: '更新管理员' })
  async updateAdmin(@Param('id') id: string, @Body() body: any) {
    return this.rbacService.updateAdmin(id, body)
  }

  @Get('roles')
  @AdminAuth('rbac:view')
  @ApiOperation({ summary: '角色列表' })
  async listRoles() {
    return this.rbacService.listRoles()
  }

  @Post('roles')
  @AdminAuth('rbac:create')
  @ApiOperation({ summary: '创建角色' })
  async createRole(@Body() body: any) {
    return this.rbacService.createRole(body)
  }

  @Put('roles/:id')
  @AdminAuth('rbac:update')
  @ApiOperation({ summary: '更新角色（含权限分配）' })
  async updateRole(@Param('id') id: string, @Body() body: any) {
    return this.rbacService.updateRole(id, body)
  }

  @Delete('roles/:id')
  @AdminAuth('rbac:delete')
  @ApiOperation({ summary: '删除角色' })
  async removeRole(@Param('id') id: string) {
    return this.rbacService.removeRole(id)
  }

  @Get('permissions')
  @AdminAuth('rbac:view')
  @ApiOperation({ summary: '权限点列表' })
  async listPermissions() {
    return this.rbacService.listPermissions()
  }
}
