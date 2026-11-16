import { Module } from '@nestjs/common';
import { CouponMonthlyService } from './coupon-monthly.service';
import { CouponRuleScheduler } from './coupon-rule.scheduler';
import { CouponRulesService } from './coupon-rules.service';
import { CouponsService } from './coupons.service';

@Module({
  providers: [CouponsService, CouponMonthlyService, CouponRulesService, CouponRuleScheduler],
  exports: [CouponsService, CouponMonthlyService, CouponRulesService]
})
export class CouponsModule {}