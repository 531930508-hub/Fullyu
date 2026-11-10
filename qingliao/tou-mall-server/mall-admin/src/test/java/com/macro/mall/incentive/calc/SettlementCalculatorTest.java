package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.SettlementResult;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SettlementCalculatorTest {

    private final SettlementCalculator calculator = new SettlementCalculator();

    @Test
    void rainSettlementMatchesV5Chain() {
        SettlementResult result = calculator.calculate(
                new BigDecimal("9720"),
                BigDecimal.ZERO,
                new BigDecimal("500"),
                new BigDecimal("870"),
                new BigDecimal("100"),
                new BigDecimal("18000"),
                new BigDecimal("132"),
                3);

        assertMoney("11090.00", result.getSubtotal());
        assertMoney("11190.00", result.getGross());
        assertMoney("10478.00", result.getPreTax());
        assertMoney("712.00", result.getServiceFeeDifference());
        assertMoney("28478.00", result.getAnnualIncome());
        assertMoney("7782.40", result.getAnnualTaxableIncome());
        assertMoney("3", result.getTaxRate());
        assertMoney("101.47", result.getTax());
        assertMoney("10376.53", result.getNet());
        assertTrue(result.getEstimated());
    }

    @Test
    void negativeGrossNeverCreatesNegativePreTaxOrTax() {
        SettlementResult result = calculator.calculate(
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                new BigDecimal("-1000"), BigDecimal.ZERO, BigDecimal.ZERO, 0);

        assertMoney("0.00", result.getGross());
        assertMoney("0.00", result.getPreTax());
        assertMoney("0.00", result.getTax());
        assertMoney("0.00", result.getNet());
    }

    @Test
    void priorPaidTaxCannotCreateNegativeTax() {
        SettlementResult result = calculator.calculate(
                new BigDecimal("5000"), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, new BigDecimal("20000"), new BigDecimal("99999"), 3);

        assertMoney("0.00", result.getTax());
        assertMoney("4682.00", result.getNet());
    }

    @Test
    void higherTaxableIncomeUsesProgressiveBracket() {
        SettlementResult result = calculator.calculate(
                new BigDecimal("60000"), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, new BigDecimal("80000"), BigDecimal.ZERO, 6);

        assertMoney("136180.00", result.getAnnualIncome());
        assertMoney("78944.00", result.getAnnualTaxableIncome());
        assertMoney("10", result.getTaxRate());
        assertMoney("5374.40", result.getTax());
    }

    private void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }
}
