package com.macro.mall.service;

import com.macro.mall.entity.CustomerCoupon;
import com.macro.mall.enums.CouponState;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;

/** 券有效期含到期当天；5/3天为各自独立的提醒事件。无外部调用。 */
public final class CouponExpiryPolicy {
    private CouponExpiryPolicy() { }
    public static Map<String, Object> plan(CustomerCoupon coupon, LocalDate today) {
        if (coupon == null || today == null || coupon.getId() == null
                || coupon.getCustomerId() == null || coupon.getCustomerId() <= 0
                || coupon.getEndTime() == null
                || !CouponState.EFFECTIVE.getValue().equals(coupon.getState())
                || coupon.getUseOrder() != null || coupon.getUseTime() != null
                || (coupon.getStartTime() != null && coupon.getStartTime().isAfter(today))) return null;
        int days = (int) ChronoUnit.DAYS.between(today, coupon.getEndTime());
        if (days != 5 && days != 3) return null;
        String name = coupon.getCouponTitle();
        if (name == null || name.trim().isEmpty()) name = "卡券";
        if (name.length() > 80) name = name.substring(0, 80);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("noticeKey", "coupon:" + coupon.getId() + ":" + coupon.getEndTime() + ":" + days);
        result.put("customerId", coupon.getCustomerId());
        result.put("couponId", coupon.getId());
        result.put("endTime", coupon.getEndTime());
        result.put("days", days);
        result.put("title", "卡券还有 " + days + " 天到期");
        result.put("body", "您的" + name + "可使用至 " + coupon.getEndTime() + "（含当天）。欢迎提前预约，留一段时间给自己。");
        return result;
    }
}
