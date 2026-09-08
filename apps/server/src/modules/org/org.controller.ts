import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { OrgStatus, OrgType } from '@prisma/client'
import { OrgService } from './org.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'
import { CurrentAdmin } from '../../common/decorators/current-user.decorator'
import type { AdminContext } from '../auth/admin-jwt.strategy'

@ApiTags('组织架构')
@Controller('organizations')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  @AdminAuth('org:view')
  @ApiOperation({ summary: '组织列表（按数据范围过滤）' })
  async list(
    @CurrentAdmin() admin: AdminContext,
    @Query() query: { keyword?: string; type?: OrgType; status?: OrgStatus },
  ) {
    return this.orgService.list(admin, query)
  }

  @Get('tree')
  @AdminAuth('org:view')
  @ApiOperation({ summary: '组织树' })
  async tree(@CurrentAdmin() admin: AdminContext, @Query() query: { status?: OrgStatus }) {
    return this.orgService.tree(admin, query)
  }

  @Get('options')
  @AdminAuth('org:view')
  @ApiOperation({ summary: '组织下拉选项（可按仓库/采购/核算能力筛选）' })
  async options(
    @CurrentAdmin() admin: AdminContext,
    @Query('warehouse') warehouse?: string,
    @Query('purchase') purchase?: string,
    @Query('accounting') accounting?: string,
  ) {
    return this.orgService.options(admin, {
      warehouse: warehouse === '1' || warehouse === 'true',
      purchase: purchase === '1' || purchase === 'true',
      accounting: accounting === '1' || accounting === 'true',
    })
  }

  @Get(':id')
  @AdminAuth('org:view')
  @ApiOperation({ summary: '组织详情' })
  async detail(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.orgService.detail(admin, id)
  }

  @Post()
  @AdminAuth('org:create')
  @ApiOperation({ summary: '新增组织' })
  async create(@CurrentAdmin() admin: AdminContext, @Body() body: any) {
    return this.orgService.create(admin, body)
  }

  @Put(':id')
  @AdminAuth('org:update')
  @ApiOperation({ summary: '更新组织' })
  async update(@CurrentAdmin() admin: AdminContext, @Param('id') id: string, @Body() body: any) {
    return this.orgService.update(admin, id, body)
  }

  @Delete(':id')
  @AdminAuth('org:delete')
  @ApiOperation({ summary: '删除组织' })
  async remove(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.orgService.remove(admin, id)
  }
}
