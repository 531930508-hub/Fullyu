package com.macro.mall.membercard.calc;

import com.macro.mall.membercard.dto.MemberCardPriceOption;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MemberCardPriceEngineTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 7);

    private MemberCardPriceEngine.Input input(BigDecimal base, LocalDate serviceDate) {
        MemberCardPriceEngine.Input input = new MemberCardPriceEngine.Input();
        input.setBaseAmount(base);
        input.setAppointmentDate(serviceDate);
        input.setToday(TODAY);
        input.setCanUseCouponCount(0);
        input.setCouponCostCount(0);
        input.setPoints(0L);
        return input;
    }

    private MemberCardPriceEngine.Input withCard(MemberCardPriceEngine.Input input) {
        input.setHasActiveCard(true);
        input.setAdvanceRate(new BigDecimal("0.7800"));
        input.setSameDayRate(new BigDecimal("0.8800"));
        return input;
    }

    private MemberCardPriceOption option(MemberCardPriceEngine.Result result, int source) {
        return result.getOptions().stream().filter(o -> o.getSource() == source).findFirst().orElse(null);
    }

    @Test
    void advanceBookingUsesAdvanceRateAndBeatsGenericDiscount() {
        MemberCardPriceEngine.Input input = withCard(input(new BigDecimal("900"), TODAY.plusDays(1)));
        input.setDiscountPayAmount(new BigDecimal("810"));
        input.setDiscountLabel("通用折扣（9折）");
        input.setPoints(1200L);
        input.setCanUseCouponCount(3);
        input.setCouponCostCount(3);

        MemberCardPriceEngine.Result result = MemberCardPriceEngine.compute(input);

        assertTrue(result.isAdvance());
        assertMoney("702.00", option(result, 1).getPayAmount());
        assertMoney("198.00", option(result, 1).getBenefitAmount());
        assertMoney("810.00", option(result, 3).getPayAmount());
        assertMoney("0.00", option(result, 4).getPayAmount());
        assertEquals(900L, option(result, 4).getPointsCost());
        assertMoney("0.00", option(result, 5).getPayAmount());
        // 年卡与积分同为最低？不，积分 0 元最低，但年卡 702 > 0 → 默认积分
        assertEquals(4, result.getSelectedSource());
    }

    @Test
    void sameDayBookingUsesSameDayRate() {
        MemberCardPriceEngine.Input input = withCard(input(new BigDecimal("900"), TODAY));
        input.setDiscountPayAmount(new BigDecimal("810"));

        MemberCardPriceEngine.Result result = MemberCardPriceEngine.compute(input);

        assertFalse(result.isAdvance());
        assertNull(option(result, 1));
        assertMoney("792.00", option(result, 2).getPayAmount());
        assertEquals(2, result.getSelectedSource());
    }

    @Test
    void tieBreakPrefersMemberCardOverDiscount() {
        MemberCardPriceEngine.Input input = withCard(input(new BigDecimal("100"), TODAY.plusDays(2)));
        input.setDiscountPayAmount(new BigDecimal("78"));

        MemberCardPriceEngine.Result result = MemberCardPriceEngine.compute(input);

        assertEquals(1, result.getSelectedSource());
    }

    @Test
    void tieBreakPrefersPointsOverCouponWhenBothReachZero() {
        MemberCardPriceEngine.Input input = input(new BigDecimal("100"), TODAY);
        input.setPoints(100L);
        input.setCanUseCouponCount(4);
        input.setCouponCostCount(4);

        MemberCardPriceEngine.Result result = MemberCardPriceEngine.compute(input);

        assertEquals(4, result.getSelectedSource());
    }

    @Test
    void insufficientCouponIsShownButNotSelectable() {
        MemberCardPriceEngine.Input input = input(new BigDecimal("600"), TODAY);
        input.setCanUseCouponCount(2);
        input.setCouponCostCount(3);

        MemberCardPriceEngine.Result result = MemberCardPriceEngine.compute(input);

        MemberCardPriceOption coupon = option(result, 5);
        assertFalse(Boolean.TRUE.equals(coupon.getAvailable()));
        assertEquals("还差 1 张券", coupon.getUnavailableReason());
        assertNull(result.getSelectedSource());
    }

    @Test
    void partialPointsKeepRemainderAndCouponWins() {
        MemberCardPriceEngine.Input input = input(new BigDecimal("900"), TODAY);
        input.setPoints(300L);
        input.setCanUseCouponCount(3);
        input.setCouponCostCount(3);

        MemberCardPriceEngine.Result result = MemberCardPriceEngine.compute(input);

        assertMoney("600.00", option(result, 4).getPayAmount());
        assertEquals(300L, option(result, 4).getPointsCost());
        assertEquals(5, result.getSelectedSource());
    }

    @Test
    void noBenefitKeepsBaseAndSelectsNothing() {
        MemberCardPriceEngine.Input input = input(new BigDecimal("300"), TODAY);
        input.setDiscountPayAmount(new BigDecimal("300"));

        MemberCardPriceEngine.Result result = MemberCardPriceEngine.compute(input);

        assertTrue(result.getOptions().isEmpty());
        assertNull(result.getSelectedSource());
        assertMoney("300.00", result.getBaseAmount());
    }

    @Test
    void expiredCardDoesNotContributeOptions() {
        MemberCardPriceEngine.Input input = input(new BigDecimal("500"), TODAY);
        input.setHasActiveCard(false);
        input.setAdvanceRate(new BigDecimal("0.7800"));
        input.setSameDayRate(new BigDecimal("0.8800"));
        input.setCanUseCouponCount(2);
        input.setCouponCostCount(2);

        MemberCardPriceEngine.Result result = MemberCardPriceEngine.compute(input);

        assertNull(option(result, 1));
        assertNull(option(result, 2));
        assertEquals(5, result.getSelectedSource());
    }

    private void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual), "expected " + expected + " but was " + actual);
    }
}
