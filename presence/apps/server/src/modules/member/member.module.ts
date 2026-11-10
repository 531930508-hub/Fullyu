import { Module } from '@nestjs/common'
import { MemberService } from './member.service'
import { MemberController } from './member.controller'
import { MemberAdminController } from './member-admin.controller'
import { BrandMemberController } from './brand-member.controller'
import { BrandWebhookController } from './brand-webhook.controller'
import { BrandPresenceSync } from './brand-presence.sync'

@Module({
  controllers: [MemberController, BrandMemberController, MemberAdminController, BrandWebhookController],
  providers: [MemberService, BrandPresenceSync],
  exports: [MemberService, BrandPresenceSync],
})
export class MemberModule {}
