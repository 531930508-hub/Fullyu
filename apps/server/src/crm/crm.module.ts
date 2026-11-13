import { Module } from '@nestjs/common';
import { BrandMemberClient } from './brand-member.client';
import { BrandOrderReporter } from './brand-order.reporter';
import { BrandPerksService } from './brand-perks.service';
import { CrmClient } from './crm.client';
import { MembershipService } from './membership.service';

/**
 * 会员中心接入。仅暴露两个客户端，业务代码不直接拼 HTTP 与签名：
 * - CrmClient：旧会员身份与积分（x-crm-*）；
 * - BrandMemberClient：品牌会员卡与愈行之旅（X-Fy）；
 * - BrandOrderReporter：后台把已付款订单与累计退款上报 CRM（默认关闭）；
 * - BrandPerksService：卡版本权益参数（时叙每杯立减金额）的缓存读入口；
 * - MembershipService：把 CRM 品牌卡状态折算成本地会籍快照（5 分钟 TTL）。
 */
@Module({
  providers: [
    CrmClient,
    BrandMemberClient,
    BrandOrderReporter,
    BrandPerksService,
    MembershipService
  ],
  exports: [CrmClient, BrandMemberClient, BrandOrderReporter, BrandPerksService, MembershipService]
})
export class CrmModule {}
