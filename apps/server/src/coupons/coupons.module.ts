import { Module } from '@nestjs/common';
import { CouponRuleScheduler } from './coupon-rule.scheduler';
import { CouponRulesService } from './coupon-rules.service';
import { CouponsService } from './coupons.service';

@Module({
  providers: [CouponsService, CouponRulesService, CouponRuleScheduler],
  exports: [CouponsService, CouponRulesService]
})
export class CouponsModule {}