import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { ReviewService } from './review.service'
import { AdminAuth } from '../../common/decorators/admin-auth.decorator'

@ApiTags('评价')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get()
  @AdminAuth('review:view')
  @ApiOperation({ summary: '评价列表（后台）' })
  async list(@Query('courseId') courseId?: string) {
    return this.reviewService.adminList(courseId)
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交课程评价（小程序）' })
  async submit(@Request() req: any, @Body() body: { courseId: string; rating: number; content?: string }) {
    return this.reviewService.submitReview(req.user.userId, body)
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的评价列表（小程序）' })
  async mine(@Request() req: any) {
    return this.reviewService.myReviews(req.user.userId)
  }

  @Get('trainer/:trainerId')
  @ApiOperation({ summary: '导师评价与评分（公开）' })
  async trainerReviews(@Param('trainerId') trainerId: string) {
    return this.reviewService.trainerReviews(trainerId)
  }

  @Get('course/:courseId')
  @ApiOperation({ summary: '课程评价列表' })
  async courseReviews(@Param('courseId') courseId: string) {
    return this.reviewService.courseReviews(courseId)
  }

  @Delete(':id')
  @AdminAuth('review:delete')
  @ApiOperation({ summary: '删除评价' })
  async remove(@Param('id') id: string) {
    return this.reviewService.remove(id)
  }
}
