import { Module } from '@nestjs/common';
import { PointsModule } from '../points/points.module';
import { ExternalController } from './external.controller';
import { ExternalGuard } from './external.guard';
import { ExternalService } from './external.service';

@Module({
  imports: [PointsModule],
  controllers: [ExternalController],
  providers: [ExternalService, ExternalGuard]
})
export class ExternalModule {}
