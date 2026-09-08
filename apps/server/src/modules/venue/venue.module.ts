import { Module } from '@nestjs/common'
import { VenueService } from './venue.service'
import { VenueController } from './venue.controller'
import { CourseModule } from '../course/course.module'

@Module({
  imports: [CourseModule],
  controllers: [VenueController],
  providers: [VenueService],
  exports: [VenueService],
})
export class VenueModule {}
