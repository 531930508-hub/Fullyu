import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { RbacService } from './rbac.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'
import { CurrentAdmin } from '../../common/decorators/current-user.decorator'
import type { AdminContext } from '../auth/admin-jwt.strategy'

@ApiTags('权限管理')
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('admins')
  @AdminAuth('rbac:view')
  @ApiOperation({ summary: '管理员列表（按数据范围过滤）' })
  async listAdmins(@CurrentAdmin() admin: AdminContext) {
    return this.rbacService.listAdmins(admin)
  }

  @Get('admin-options')
  @AdminAuth()
  @ApiOperation({ summary: '人员下拉选项（选审批人/负责人用，仅需登录，按数据范围过滤）' })
  async listAdminOptions(@CurrentAdmin() admin: AdminContext) {
    return this.rbacService.listAdminOptions(admin)
  }

  @Post('admins')
  @AdminAuth('rbac:create')
  @ApiOperation({ summary: '创建管理员（含归属组织）' })
  async createAdmin(@CurrentAdmin() admin: AdminContext, @Body() body: any) {
    return this.rbacService.createAdmin(admin, body)
  }

  @Put('admins/:id')
  @AdminAuth('rbac:update')
  @ApiOperation({ summary: '更新管理员（含归属组织与角色）' })
  async updateAdmin(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.rbacService.updateAdmin(admin, id, body)
  }

  @Get('roles')
  @AdminAuth('rbac:view')
  @ApiOperation({ summary: '角色列表（含数据范围与权限码）' })
  async listRoles() {
    return this.rbacService.listRoles()
  }

  @Post('roles')
  @AdminAuth('rbac:create')
  @ApiOperation({ summary: '创建角色' })
  async createRole(@Body() body: any) {
    return this.rbacService.createRole(body)
  }

  @Post('roles/:id/clone')
  @AdminAuth('rbac:create')
  @ApiOperation({ summary: '复制角色为自定义角色' })
  async cloneRole(@Param('id') id: string, @Body() body: any) {
    return this.rbacService.cloneRole(id, body)
  }

  @Put('roles/:id')
  @AdminAuth('rbac:update')
  @ApiOperation({ summary: '更新角色（含权限分配与数据范围）' })
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

  @Get('permission-tree')
  @AdminAuth('rbac:view')
  @ApiOperation({ summary: '权限树（模块-分组-权限点）与数据范围选项' })
  async permissionTree() {
    return this.rbacService.permissionTree()
  }
}
