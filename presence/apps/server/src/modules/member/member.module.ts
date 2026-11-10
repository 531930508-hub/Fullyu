import { Module } from '@nestjs/common'
import { MemberService } from './member.service'
import { MemberController } from './member.controller'
import { MemberAdminController } from './member-admin.controller'

@Module({
  controllers: [MemberController, MemberAdminController],
  providers: [MemberService],
  exports: [MemberService],
})
export class MemberModule {}
