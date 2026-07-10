import { Controller, Get, Delete, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
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
