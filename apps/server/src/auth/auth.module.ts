import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StaffService } from './staff.service';
import { StaffGuard } from './staff.guard';
import { CustomerGuard } from './customer.guard';
import { PermissionsGuard } from './permissions.guard';
import { CrmModule } from '../crm/crm.module';

@Global()
@Module({
  imports: [CrmModule],
  controllers: [AuthController],
  providers: [AuthService, StaffService, StaffGuard, CustomerGuard, PermissionsGuard],
  exports: [AuthService, StaffService, StaffGuard, CustomerGuard, PermissionsGuard]
})
export class AuthModule {}
