package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 合作结算预估，不写正式结算单。
 */
@Data
public class SettlementResult {

    private BigDecimal baseReward = BigDecimal.ZERO;

    private BigDecimal managerReward = BigDecimal.ZERO;

    private BigDecimal trainingReward = BigDecimal.ZERO;

    private BigDecimal repurchaseReward = BigDecimal.ZERO;

    private BigDecimal adjustment = BigDecimal.ZERO;

    private BigDecimal subtotal = BigDecimal.ZERO;

    private BigDecimal gross = BigDecimal.ZERO;

    private BigDecimal serviceFeeDivisor = new BigDecimal("1.068");

    private BigDecimal preTax = BigDecimal.ZERO;

    private BigDecimal serviceFeeDifference = BigDecimal.ZERO;

    private BigDecimal priorAnnualIncome = BigDecimal.ZERO;

    private BigDecimal annualIncome = BigDecimal.ZERO;

    private Integer continuousMonths = 0;

    private BigDecimal annualTaxableIncome = BigDecimal.ZERO;

    private BigDecimal taxRate = BigDecimal.ZERO;

    private BigDecimal quickDeduction = BigDecimal.ZERO;

    private BigDecimal priorPaidTax = BigDecimal.ZERO;

    private BigDecimal tax = BigDecimal.ZERO;

    private BigDecimal net = BigDecimal.ZERO;

    /**
     * 预览口径，最终以财务结算为准。
     */
    private Boolean estimated = true;
}
