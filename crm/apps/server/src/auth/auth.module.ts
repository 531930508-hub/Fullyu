import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StaffService } from './staff.service';
import { StaffGuard } from './staff.guard';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, StaffService, StaffGuard, PermissionsGuard],
  exports: [AuthService, StaffService, StaffGuard, PermissionsGuard]
})
export class AuthModule {}
