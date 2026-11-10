package com.macro.mall.incentive.calc;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class IncentiveMathTest {

    @Test
    void sequenceStopsGrowingAtCapButKeepsOccupyingOrdinals() {
        List<BigDecimal> prices = IncentiveMath.sequence(10,
                new BigDecimal("10"), new BigDecimal("10"), new BigDecimal("130"));
        assertMoneyList(Arrays.asList(
                "10.00", "10.00", "20.00", "30.00", "50.00",
                "80.00", "130.00", "130.00", "130.00", "130.00"), prices);
    }

    @Test
    void fibonacciAmountUsesWeightsWithoutChangingOrdinals() {
        assertMoney("70.00", IncentiveMath.fibonacciAmount(
                Arrays.asList(BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE),
                new BigDecimal("10"), new BigDecimal("10"), new BigDecimal("130")));
        assertMoney("525.00", IncentiveMath.fibonacciAmount(
                Arrays.asList(BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE,
                        BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE,
                        new BigDecimal("0.5")),
                new BigDecimal("10"), new BigDecimal("10"), new BigDecimal("130")));
    }

    @Test
    void capBelowSeedsUsesCap() {
        List<BigDecimal> prices = IncentiveMath.sequence(4,
                new BigDecimal("10"), new BigDecimal("20"), new BigDecimal("15"));
        assertMoneyList(Arrays.asList("10.00", "15.00", "15.00", "15.00"), prices);
    }

    @Test
    void nextPriceUsesOrdinalNotWeightedHeadCount() {
        assertMoney("50.00", IncentiveMath.nextFibonacciPrice(4,
                new BigDecimal("10"), new BigDecimal("10"), new BigDecimal("130")));
    }

    @Test
    void retentionThresholdUsesExactRatio() {
        assertTrue(IncentiveMath.ratioAtLeast(
                new BigDecimal("3"), new BigDecimal("5"), new BigDecimal("60")));
        assertFalse(IncentiveMath.ratioAtLeast(
                new BigDecimal("2"), new BigDecimal("3"), new BigDecimal("66.67")));
        assertFalse(IncentiveMath.ratioAtLeast(
                BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("60")));
    }

    @Test
    void historicalMonthCutsAtMonthEndAndCurrentMonthUsesAsOf() {
        assertEquals(LocalDate.of(2026, 9, 30),
                IncentiveMath.cutoff("2026-09", LocalDate.of(2026, 10, 21)));
        assertEquals(LocalDate.of(2026, 10, 21),
                IncentiveMath.cutoff("2026-10", LocalDate.of(2026, 10, 21)));
        assertEquals(LocalDate.of(2026, 2, 28),
                IncentiveMath.monthEnd("2026-02"));
    }

    @Test
    void percentZeroDenominatorIsZero() {
        assertMoney("0.00", IncentiveMath.percent(BigDecimal.ONE, BigDecimal.ZERO));
    }

    private void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
        assertEquals(2, actual.scale(), "money must keep two decimals");
    }

    private void assertMoneyList(List<String> expected, List<BigDecimal> actual) {
        assertEquals(expected.size(), actual.size());
        for (int i = 0; i < expected.size(); i++) {
            assertMoney(expected.get(i), actual.get(i));
        }
    }
}
