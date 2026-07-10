import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { VenueService } from './venue.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('场地')
@Controller('venues')
export class VenueController {
  constructor(private readonly venueService: VenueService) {}

  @Get()
  @ApiOperation({ summary: '场地列表' })
  async list() {
    return this.venueService.list()
  }

  @Get('reservations')
  @AdminAuth('venue:view')
  @ApiOperation({ summary: '场地预约列表' })
  async listReservations(@Query('venueId') venueId?: string, @Query('date') date?: string) {
    return this.venueService.listReservations(venueId, date)
  }

  @Get(':id')
  @ApiOperation({ summary: '场地详情' })
  async detail(@Param('id') id: string) {
    return this.venueService.detail(id)
  }

  @Post()
  @AdminAuth('venue:create')
  @ApiOperation({ summary: '创建场地' })
  async create(@Body() body: any) {
    return this.venueService.create(body)
  }

  @Put(':id')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '更新场地' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.venueService.update(id, body)
  }

  @Delete(':id')
  @AdminAuth('venue:delete')
  @ApiOperation({ summary: '删除场地' })
  async remove(@Param('id') id: string) {
    return this.venueService.remove(id)
  }

  @Post('reservations')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '创建场地预约' })
  async createReservation(@Body() body: any) {
    return this.venueService.createReservation(body)
  }

  @Delete('reservations/:id')
  @AdminAuth('venue:update')
  @ApiOperation({ summary: '删除场地预约' })
  async removeReservation(@Param('id') id: string) {
    return this.venueService.removeReservation(id)
  }
}
