import { Module } from '@nestjs/common'
import { BrandMemberController } from './brand-member.controller'
import { BrandWebhookController } from './brand-webhook.controller'
import { BrandPresenceSync } from './brand-presence.sync'

@Module({
  controllers: [BrandMemberController, BrandWebhookController],
  providers: [BrandPresenceSync],
  exports: [BrandPresenceSync],
})
export class MemberModule {}
