import { Controller, Get, Post, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { CourseWishService } from './course-wish.service'
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard'

/**
 * 往期课程许愿（小程序端）。
 * 独立前缀 course-wishes：避免与 courses/:id 通配路由抢匹配。
 */
@ApiTags('课程许愿')
@Controller('course-wishes')
export class CourseWishController {
  constructor(private readonly courseWishService: CourseWishService) {}

  private optionalUserId(req: any): string | undefined {
    return req?.user?.userId || req?.user?.id || undefined
  }

  @Get('summary')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '课程许愿概况（未登录只返回数量）' })
  async summary(@Query('courseId') courseId: string, @Request() req: any) {
    return this.courseWishService.summary(courseId, this.optionalUserId(req))
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的心愿列表' })
  async mine(@Query('page') page?: number, @Query('pageSize') pageSize?: number, @Request() req?: any) {
    return this.courseWishService.mine(req.user.userId, page, pageSize)
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '许愿：想再上一节该往期课程' })
  async add(@Body() body: { courseId?: string }, @Request() req: any) {
    return this.courseWishService.add(body?.courseId || '', req.user.userId)
  }

  @Delete(':courseId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消许愿' })
  async remove(@Param('courseId') courseId: string, @Request() req: any) {
    return this.courseWishService.remove(courseId, req.user.userId)
  }
}