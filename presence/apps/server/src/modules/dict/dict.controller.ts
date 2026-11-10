import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { DictService } from './dict.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'
import { Public } from '../../common/decorators/public.decorator'

@ApiTags('值集字典')
@Controller('dicts')
export class DictController {
  constructor(private readonly dictService: DictService) {}

  @Get('items')
  @Public()
  @ApiOperation({ summary: '按 code 获取启用选项' })
  async items(@Query('code') code: string) {
    return this.dictService.getItems(code)
  }

  @Get()
  @AdminAuth('dict:view')
  @ApiOperation({ summary: '全部值集' })
  async list() {
    return this.dictService.listSets()
  }

  @Post()
  @AdminAuth('dict:create')
  @ApiOperation({ summary: '创建值集' })
  async createSet(@Body() body: { code: string; name: string; desc?: string }) {
    return this.dictService.createSet(body)
  }

  @Put(':id')
  @AdminAuth('dict:update')
  @ApiOperation({ summary: '更新值集' })
  async updateSet(@Param('id') id: string, @Body() body: any) {
    return this.dictService.updateSet(id, body)
  }

  @Delete(':id')
  @AdminAuth('dict:delete')
  @ApiOperation({ summary: '删除值集' })
  async removeSet(@Param('id') id: string) {
    return this.dictService.removeSet(id)
  }

  @Put(':id/items')
  @AdminAuth('dict:update')
  @ApiOperation({ summary: '保存值集选项' })
  async saveItems(@Param('id') id: string, @Body() body: { items: any[] }) {
    return this.dictService.saveItems(id, body.items ?? [])
  }
}
