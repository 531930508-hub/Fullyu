package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.SettlementResult;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 合作结算预估金额链，不写入正式结算单。
 *
 * <pre>
 * 结算基数 = 基础 + 店长 + 培训 + 已满足条件的复购 + 其他调整
 * 税前收入 = max(0, HALF_UP(结算基数 / 1.068, 0))
 * 年度应纳税所得额 = max(0, (历史年度收入 + 本月税前) × 0.8 − 连续合作月数 × 5000)
 * 本月个税 = max(0, 年度应纳税所得额 × 税率 − 速算扣除 − 已缴个税)
 * 税后收入 = 税前收入 − 本月个税
 * </pre>
 */
public class SettlementCalculator {

    private static final BigDecimal SERVICE_FEE_DIVISOR = new BigDecimal("1.068");
    private static final BigDecimal ANNUAL_DISCOUNT = new BigDecimal("0.8");
    private static final BigDecimal MONTHLY_DEDUCTION = new BigDecimal("5000");

    /**
     * 计算合作结算预览。
     *
     * @param priorAnnualIncome 本年度此前已计入的税前收入
     * @param priorPaidTax      本年度此前已缴个税
     * @param continuousMonths  连续合作月数（含本月）
     */
    public SettlementResult calculate(BigDecimal baseReward,
                                      BigDecimal managerReward,
                                      BigDecimal trainingReward,
                                      BigDecimal repurchaseReward,
                                      BigDecimal adjustment,
                                      BigDecimal priorAnnualIncome,
                                      BigDecimal priorPaidTax,
                                      Integer continuousMonths) {
        SettlementResult result = new SettlementResult();
        BigDecimal base = IncentiveMath.money(nonNull(baseReward));
        BigDecimal manager = IncentiveMath.money(nonNull(managerReward));
        BigDecimal training = IncentiveMath.money(nonNull(trainingReward));
        BigDecimal repurchase = IncentiveMath.money(nonNull(repurchaseReward));
        BigDecimal adjust = IncentiveMath.money(nonNull(adjustment));

        BigDecimal subtotal = IncentiveMath.sum(base, manager, training, repurchase);
        BigDecimal gross = IncentiveMath.money(subtotal.add(adjust));
        // 负向调整不应把结算基数打到 0 以下
        if (gross.compareTo(BigDecimal.ZERO) < 0) {
            gross = BigDecimal.ZERO.setScale(IncentiveMath.MONEY_SCALE);
        }
        BigDecimal preTax = gross.divide(SERVICE_FEE_DIVISOR, 0, RoundingMode.HALF_UP);
        if (preTax.compareTo(BigDecimal.ZERO) < 0) {
            preTax = BigDecimal.ZERO.setScale(0);
        }

        BigDecimal priorIncome = IncentiveMath.money(nonNull(priorAnnualIncome));
        BigDecimal priorTax = IncentiveMath.money(nonNull(priorPaidTax));
        int months = continuousMonths == null ? 0 : Math.max(0, continuousMonths);
        BigDecimal annual = IncentiveMath.money(priorIncome.add(preTax));
        BigDecimal taxable = IncentiveMath.money(
                annual.multiply(ANNUAL_DISCOUNT)
                        .subtract(MONTHLY_DEDUCTION.multiply(BigDecimal.valueOf(months))));
        if (taxable.compareTo(BigDecimal.ZERO) < 0) {
            taxable = BigDecimal.ZERO.setScale(IncentiveMath.MONEY_SCALE);
        }

        TaxBracket bracket = bracketFor(taxable);
        BigDecimal tax = BigDecimal.ZERO.setScale(IncentiveMath.MONEY_SCALE);
        if (taxable.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal calculated = taxable.multiply(bracket.rate)
                    .divide(IncentiveMath.HUNDRED, 8, IncentiveMath.MONEY_ROUNDING)
                    .subtract(bracket.quickDeduction)
                    .subtract(priorTax);
            tax = IncentiveMath.money(calculated.max(BigDecimal.ZERO));
        }
        BigDecimal net = IncentiveMath.money(preTax.subtract(tax));

        result.setBaseReward(base);
        result.setManagerReward(manager);
        result.setTrainingReward(training);
        result.setRepurchaseReward(repurchase);
        result.setAdjustment(adjust);
        result.setSubtotal(subtotal);
        result.setGross(gross);
        result.setServiceFeeDivisor(SERVICE_FEE_DIVISOR);
        result.setPreTax(preTax);
        result.setServiceFeeDifference(IncentiveMath.money(gross.subtract(preTax)));
        result.setPriorAnnualIncome(priorIncome);
        result.setAnnualIncome(annual);
        result.setContinuousMonths(months);
        result.setAnnualTaxableIncome(taxable);
        result.setTaxRate(bracket.rate);
        result.setQuickDeduction(bracket.quickDeduction);
        result.setPriorPaidTax(priorTax);
        result.setTax(tax);
        result.setNet(net);
        result.setEstimated(true);
        return result;
    }

    private BigDecimal nonNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private TaxBracket bracketFor(BigDecimal taxable) {
        if (taxable.compareTo(BigDecimal.ZERO) <= 0) {
            return new TaxBracket(BigDecimal.ZERO, BigDecimal.ZERO);
        }
        if (taxable.compareTo(new BigDecimal("36000")) <= 0) {
            return new TaxBracket(new BigDecimal("3"), BigDecimal.ZERO);
        }
        if (taxable.compareTo(new BigDecimal("144000")) <= 0) {
            return new TaxBracket(new BigDecimal("10"), new BigDecimal("2520"));
        }
        if (taxable.compareTo(new BigDecimal("300000")) <= 0) {
            return new TaxBracket(new BigDecimal("20"), new BigDecimal("16920"));
        }
        if (taxable.compareTo(new BigDecimal("420000")) <= 0) {
            return new TaxBracket(new BigDecimal("25"), new BigDecimal("31920"));
        }
        if (taxable.compareTo(new BigDecimal("660000")) <= 0) {
            return new TaxBracket(new BigDecimal("30"), new BigDecimal("52920"));
        }
        if (taxable.compareTo(new BigDecimal("960000")) <= 0) {
            return new TaxBracket(new BigDecimal("35"), new BigDecimal("85920"));
        }
        return new TaxBracket(new BigDecimal("45"), new BigDecimal("181920"));
    }

    private static class TaxBracket {
        private final BigDecimal rate;
        private final BigDecimal quickDeduction;

        TaxBracket(BigDecimal rate, BigDecimal quickDeduction) {
            this.rate = rate;
            this.quickDeduction = quickDeduction;
        }
    }
}
