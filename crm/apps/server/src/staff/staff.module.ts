import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffAdminService } from './staff-admin.service';

@Module({
  controllers: [StaffController],
  providers: [StaffAdminService]
})
export class StaffModule {}