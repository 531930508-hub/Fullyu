import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { BannerService, BannerInput } from './banner.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('首页Banner')
@Controller('banners')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  @Get()
  @ApiOperation({ summary: '首页 Banner 列表（仅启用，公开）' })
  async list() {
    return this.bannerService.listActive()
  }

  @Get('admin/list')
  @AdminAuth('banner:view')
  @ApiOperation({ summary: '后台 Banner 列表（全部）' })
  async adminList() {
    return this.bannerService.adminList()
  }

  @Post()
  @AdminAuth('banner:manage')
  @ApiOperation({ summary: '创建 Banner' })
  async create(@Body() body: BannerInput) {
    return this.bannerService.create(body)
  }

  @Put(':id')
  @AdminAuth('banner:manage')
  @ApiOperation({ summary: '更新 Banner' })
  async update(@Param('id') id: string, @Body() body: BannerInput) {
    return this.bannerService.update(id, body)
  }

  @Post(':id/status')
  @AdminAuth('banner:manage')
  @ApiOperation({ summary: '启用/停用 Banner' })
  async setStatus(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.bannerService.setStatus(id, isActive)
  }

  @Delete(':id')
  @AdminAuth('banner:manage')
  @ApiOperation({ summary: '删除 Banner' })
  async remove(@Param('id') id: string) {
    return this.bannerService.remove(id)
  }
}
