package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.IncentiveRule;

import java.math.BigDecimal;

/**
 * 基础接单奖励与店长奖励。
 */
public class IncentiveCalculator {

    /**
     * 基础接单奖励 = 当月折算分钟 × 当前档位系数，不分段累加。
     */
    public BigDecimal baseReward(BigDecimal convertedMinutes, IncentiveRule rule, boolean newPartner) {
        if (convertedMinutes == null || convertedMinutes.compareTo(BigDecimal.ZERO) <= 0 || rule == null) {
            return BigDecimal.ZERO.setScale(IncentiveMath.MONEY_SCALE);
        }
        BigDecimal coefficient = rule.coefficientFor(convertedMinutes, newPartner);
        return IncentiveMath.money(convertedMinutes.multiply(coefficient));
    }

    /**
     * 店长奖励：完成整店实际业绩目标后，按全部实际业绩乘配置提点。
     * 未设目标、未达目标或非店长均为 0；刚好达标也计提。
     */
    public BigDecimal managerReward(boolean manager,
                                    BigDecimal actualRevenue,
                                    BigDecimal targetRevenue,
                                    BigDecimal commissionRate) {
        if (!manager
                || actualRevenue == null
                || targetRevenue == null
                || commissionRate == null
                || targetRevenue.compareTo(BigDecimal.ZERO) <= 0
                || actualRevenue.compareTo(targetRevenue) < 0
                || commissionRate.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO.setScale(IncentiveMath.MONEY_SCALE);
        }
        return IncentiveMath.money(actualRevenue.multiply(commissionRate)
                .divide(IncentiveMath.HUNDRED, 8, IncentiveMath.MONEY_ROUNDING));
    }
}
