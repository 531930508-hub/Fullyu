package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.CoefficientBand;
import com.macro.mall.incentive.model.IncentiveRule;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;

class IncentiveCalculatorTest {

    private final IncentiveCalculator calculator = new IncentiveCalculator();

    @Test
    void coefficientJumpsAtStartOfEachBand() {
        IncentiveRule rule = defaultRule();
        assertCoefficient(rule, "0", "1.0");
        assertCoefficient(rule, "7199", "1.0");
        assertCoefficient(rule, "7200", "1.2");
        assertCoefficient(rule, "8399", "1.2");
        assertCoefficient(rule, "8400", "1.3");
        assertCoefficient(rule, "9599", "1.3");
        assertCoefficient(rule, "9600", "1.5");
        assertCoefficient(rule, "12000", "1.5");
    }

    @Test
    void baseRewardUsesSingleBandNotSegmentedSum() {
        IncentiveRule rule = defaultRule();
        assertMoney("7199.00", calculator.baseReward(new BigDecimal("7199"), rule, false));
        assertMoney("8640.00", calculator.baseReward(new BigDecimal("7200"), rule, false));
        assertMoney("9720.00", calculator.baseReward(new BigDecimal("8100"), rule, false));
        assertMoney("10920.00", calculator.baseReward(new BigDecimal("8400"), rule, false));
        assertMoney("14400.00", calculator.baseReward(new BigDecimal("9600"), rule, false));
    }

    @Test
    void newPartnerUsesFlatCoefficient() {
        IncentiveRule rule = defaultRule();
        assertMoney("5760.00", calculator.baseReward(new BigDecimal("7200"), rule, true));
    }

    @Test
    void managerRewardUsesWholeShopActualRevenueAfterTarget() {
        assertMoney("2168.00", calculator.managerReward(true,
                new BigDecimal("216800"), new BigDecimal("200000"), new BigDecimal("1")));
        assertMoney("2000.00", calculator.managerReward(true,
                new BigDecimal("200000"), new BigDecimal("200000"), new BigDecimal("1")));
        assertMoney("0.00", calculator.managerReward(true,
                new BigDecimal("199999.99"), new BigDecimal("200000"), new BigDecimal("1")));
        assertMoney("0.00", calculator.managerReward(false,
                new BigDecimal("216800"), new BigDecimal("200000"), new BigDecimal("1")));
    }

    @Test
    void managerRewardSupportsDecimalRate() {
        assertMoney("1084.00", calculator.managerReward(true,
                new BigDecimal("216800"), new BigDecimal("200000"), new BigDecimal("0.5")));
    }

    private void assertCoefficient(IncentiveRule rule, String minutes, String expected) {
        assertEquals(0, new BigDecimal(expected).compareTo(
                rule.coefficientFor(new BigDecimal(minutes), false)));
    }

    private IncentiveRule defaultRule() {
        IncentiveRule rule = new IncentiveRule();
        rule.setCoefficients(Arrays.asList(
                new CoefficientBand(0, new BigDecimal("1.0")),
                new CoefficientBand(7200, new BigDecimal("1.2")),
                new CoefficientBand(8400, new BigDecimal("1.3")),
                new CoefficientBand(9600, new BigDecimal("1.5"))));
        rule.setNewCoefficient(new BigDecimal("0.8"));
        return rule;
    }

    private void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }
}
