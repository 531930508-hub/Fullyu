import { Module } from '@nestjs/common';
import { BrandMemberClient } from './brand-member.client';
import { BrandOrderReporter } from './brand-order.reporter';
import { MembershipService } from './membership.service';
import { CrmClient } from './crm.client';

/**
 * 会员中心接入。仅暴露两个客户端，业务代码不直接拼 HTTP 与签名：
 * - CrmClient：旧会员身份与积分（x-crm-*）；
 * - BrandMemberClient：品牌会员卡与愈行之旅（X-Fy）；
 * - BrandOrderReporter：后台把已付款订单与累计退款上报 CRM（默认关闭）；
 * - MembershipService：把 CRM 卡态同步到本地会籍缓存（折扣只认这份缓存）。
 */
@Module({
  providers: [CrmClient, BrandMemberClient, BrandOrderReporter, MembershipService],
  exports: [CrmClient, BrandMemberClient, BrandOrderReporter, MembershipService]
})
export class CrmModule {}
