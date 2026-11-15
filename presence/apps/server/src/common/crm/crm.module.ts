import { Global, Module } from '@nestjs/common'
import { CrmClient } from './crm.client'
import { BrandMemberClient } from './brand-member.client'
import { BrandMemberLinkService } from './brand-member-link.service'
import { BrandPerksService } from './brand-perks.service'

/**
 * 会员中心接入（全局）。业务代码只依赖 CrmClient / BrandMemberClient，
 * 不直接拼 HTTP 与签名。
 */
@Global()
@Module({
  providers: [CrmClient, BrandMemberClient, BrandMemberLinkService, BrandPerksService],
  exports: [CrmClient, BrandMemberClient, BrandMemberLinkService, BrandPerksService],
})
export class CrmModule {}
