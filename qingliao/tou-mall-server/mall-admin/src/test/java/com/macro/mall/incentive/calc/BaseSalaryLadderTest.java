package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.CoefficientBand;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BaseSalaryLadderTest {

    private final BaseSalaryLadder ladder = BaseSalaryLadder.of(Arrays.asList(
            new CoefficientBand(0, new BigDecimal("1.0")),
            new CoefficientBand(7200, new BigDecimal("1.2")),
            new CoefficientBand(8400, new BigDecimal("1.3")),
            new CoefficientBand(9600, new BigDecimal("1.5"))));

    @Test
    void unitPriceUsesCurrentBandOnly() {
        assertPrice("1.00", "0");
        assertPrice("1.00", "7199");
        assertPrice("1.20", "7200");
        assertPrice("1.30", "8400");
        assertPrice("1.50", "9600");
        assertPrice("1.50", "20000");
    }

    @Test
    void amountIsWholeMonthTimesCurrentUnitPrice() {
        // 7199 分钟仍按 1.00 元/分钟，整月一次性折算，不分段累加。
        assertMoney("7199.00", ladder.amountFor(new BigDecimal("7199"), false, null));
        assertMoney("8640.00", ladder.amountFor(new BigDecimal("7200"), false, null));
        // 1.00 元/分钟 × 0.5 分钟的零头保留两位小数。
        assertMoney("0.70", ladder.amountFor(new BigDecimal("0.7"), false, null));
        assertMoney("0.00", ladder.amountFor(BigDecimal.ZERO, false, null));
        assertMoney("0.00", ladder.amountFor(null, false, null));
    }

    @Test
    void newPartnerPriceIgnoresBands() {
        assertMoney("5760.00", ladder.amountFor(new BigDecimal("7200"), true, new BigDecimal("0.8")));
        assertEquals(0, new BigDecimal("0.80").compareTo(
                ladder.unitPriceFor(new BigDecimal("9600"), true, new BigDecimal("0.8"))));
        // 未配置时回落到 1.00，避免新人单价为空导致金额为 0。
        assertEquals(0, BigDecimal.ONE.compareTo(
                ladder.unitPriceFor(new BigDecimal("9600"), true, null)));
    }

    @Test
    void bandsAreSortedByStartSoOrderIrrelevant() {
        BaseSalaryLadder shuffled = BaseSalaryLadder.of(Arrays.asList(
                new CoefficientBand(9600, new BigDecimal("1.5")),
                new CoefficientBand(0, new BigDecimal("1.0")),
                new CoefficientBand(8400, new BigDecimal("1.3")),
                new CoefficientBand(7200, new BigDecimal("1.2"))));
        assertEquals(0, ladder.unitPriceFor(new BigDecimal("8400"), false, null)
                .compareTo(shuffled.unitPriceFor(new BigDecimal("8400"), false, null)));
        assertEquals(7200L, shuffled.getBands().get(1).getMinMinutes());
        assertEquals(9600L, shuffled.getBands().get(3).getMinMinutes());
    }

    @Test
    void currentAndNextBandFollowStartInclusiveRule() {
        assertEquals(0L, ladder.currentBand(new BigDecimal("0")).getMinMinutes());
        assertEquals(7200L, ladder.currentBand(new BigDecimal("7200")).getMinMinutes());
        assertEquals(9600L, ladder.currentBand(new BigDecimal("9600")).getMinMinutes());
        assertNull(ladder.nextBand(new BigDecimal("9600")));
        assertEquals(7200L, ladder.nextBand(new BigDecimal("0")).getMinMinutes());
        assertEquals(8400L, ladder.nextBand(new BigDecimal("7200")).getMinMinutes());
    }

    @Test
    void emptyBandsFallBackToUnitPriceOne() {
        BaseSalaryLadder empty = BaseSalaryLadder.of(Collections.emptyList());
        assertEquals(0, BigDecimal.ONE.compareTo(empty.unitPriceFor(new BigDecimal("7200"), false, null)));
        assertMoney("7200.00", empty.amountFor(new BigDecimal("7200"), false, null));
        assertNull(empty.currentBand(new BigDecimal("7200")));
    }

    @Test
    void unitPriceRangeIsOneToPointFive() {
        assertTrue(BaseSalaryLadder.isUnitPriceInRange(new BigDecimal("1.00")));
        assertTrue(BaseSalaryLadder.isUnitPriceInRange(new BigDecimal("1.50")));
        assertFalse(BaseSalaryLadder.isUnitPriceInRange(new BigDecimal("0.99")));
        assertFalse(BaseSalaryLadder.isUnitPriceInRange(new BigDecimal("1.51")));
        assertFalse(BaseSalaryLadder.isUnitPriceInRange(null));
        assertTrue(BaseSalaryLadder.isNewPartnerUnitPriceInRange(new BigDecimal("0.80")));
        assertFalse(BaseSalaryLadder.isNewPartnerUnitPriceInRange(new BigDecimal("0.79")));
        assertMoney("90.00", BaseSalaryLadder.hourlyFromUnitPrice(new BigDecimal("1.5")));
    }

    private void assertPrice(String expected, String minutes) {
        assertEquals(0, new BigDecimal(expected).compareTo(
                ladder.unitPriceFor(new BigDecimal(minutes), false, null)));
    }

    private void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }
}