import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { TrainerLevelService } from './trainer-level.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('导师等级')
@Controller('trainer-levels')
export class TrainerLevelController {
  constructor(private readonly service: TrainerLevelService) {}

  @Get()
  @ApiOperation({ summary: '导师等级列表' })
  async list() {
    return this.service.list()
  }

  @Post()
  @AdminAuth('trainer:create')
  @ApiOperation({ summary: '新增导师等级' })
  async create(@Body() body: any) {
    return this.service.create(body)
  }

  @Put(':id')
  @AdminAuth('trainer:update')
  @ApiOperation({ summary: '更新导师等级' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body)
  }

  @Delete(':id')
  @AdminAuth('trainer:update')
  @ApiOperation({ summary: '删除导师等级' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
