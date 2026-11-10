package com.macro.mall.service;

import com.macro.mall.entity.CustomerCoupon;
import com.macro.mall.enums.CouponState;
import org.junit.jupiter.api.Test;
import java.lang.reflect.InvocationTargetException;
import java.time.LocalDate;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class CouponExpiryPolicyTest {
    final LocalDate today = LocalDate.of(2026, 11, 8);
    CustomerCoupon coupon(int days) {
        CustomerCoupon c = new CustomerCoupon(); c.setId(9L); c.setCustomerId(7L);
        c.setState(CouponState.EFFECTIVE.getValue()); c.setEndTime(today.plusDays(days));
        c.setCouponTitle("合成券"); return c;
    }
    @SuppressWarnings("unchecked") Map<String, Object> plan(CustomerCoupon c) throws Exception {
        Class<?> type;
        try { type = Class.forName("com.macro.mall.service.CouponExpiryPolicy"); }
        catch (ClassNotFoundException e) { type = null; }
        assertNotNull(type, "缺少5/3天提醒规则");
        return (Map<String, Object>) type.getMethod("plan", CustomerCoupon.class, LocalDate.class).invoke(null, c, today);
    }
    @Test void fiveDaysCreatesIndependentStableEvent() throws Exception {
        Map<String, Object> result = plan(coupon(5));
        assertEquals("coupon:9:2026-11-13:5", result.get("noticeKey"));
        assertEquals(5, result.get("days")); assertEquals(7L, result.get("customerId"));
        assertTrue(result.get("body").toString().contains("含当天"));
    }
    @Test void threeDaysHasDifferentKey() throws Exception {
        assertEquals("coupon:9:2026-11-11:3", plan(coupon(3)).get("noticeKey"));
    }
    @Test void otherDatesNeverSend() throws Exception {
        for (int days : new int[] {-1, 0, 1, 2, 4, 6, 7}) assertNull(plan(coupon(days)));
    }
    @Test void everyNonEffectiveStateIsSkipped() throws Exception {
        for (CouponState state : CouponState.values()) {
            if (state == CouponState.EFFECTIVE) continue;
            CustomerCoupon c = coupon(5); c.setState(state.getValue()); assertNull(plan(c));
        }
    }
    @Test void consumedCouponIsSkippedEvenWithStaleEffectiveState() throws Exception {
        CustomerCoupon c = coupon(5); c.setUseOrder(90L); assertNull(plan(c));
        c.setUseOrder(null); c.setUseTime(today.atStartOfDay()); assertNull(plan(c));
    }
    @Test void missingExpiryOrOwnerCannotCreateEvent() throws Exception {
        CustomerCoupon c = coupon(5); c.setEndTime(null); assertNull(plan(c));
        c = coupon(5); c.setCustomerId(null); assertNull(plan(c));
        c = coupon(5); c.setId(null); assertNull(plan(c));
    }
    @Test void futureStartDateCannotNotifyUnusableCoupon() throws Exception {
        CustomerCoupon c = coupon(5); c.setStartTime(today.plusDays(1)); assertNull(plan(c));
    }
    @Test void allCouponTypesUseSameExpiryRule() throws Exception {
        for (int useType = 0; useType <= 2; useType++) {
            CustomerCoupon c = coupon(5); c.setUseType(useType); assertNotNull(plan(c));
        }
    }
    @Test void emptyTitleFallsBackWithoutLeakingProfile() throws Exception {
        CustomerCoupon c = coupon(3); c.setCouponTitle(null);
        assertTrue(plan(c).get("body").toString().contains("卡券"));
        assertFalse(plan(c).containsKey("phone")); assertFalse(plan(c).containsKey("openId"));
    }
}
