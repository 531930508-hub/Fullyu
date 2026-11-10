import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MaterialService } from './material.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('物料')
@Controller('materials')
export class MaterialController {
  constructor(private readonly materialService: MaterialService) {}

  @Get()
  @AdminAuth('material:view')
  @ApiOperation({ summary: '物料列表' })
  async list() {
    return this.materialService.list()
  }

  @Post()
  @AdminAuth('material:create')
  @ApiOperation({ summary: '创建物料' })
  async create(@Body() body: any) {
    return this.materialService.create(body)
  }

  @Put(':id')
  @AdminAuth('material:update')
  @ApiOperation({ summary: '更新物料' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.materialService.update(id, body)
  }

  @Delete(':id')
  @AdminAuth('material:delete')
  @ApiOperation({ summary: '删除物料' })
  async remove(@Param('id') id: string) {
    return this.materialService.remove(id)
  }
}
