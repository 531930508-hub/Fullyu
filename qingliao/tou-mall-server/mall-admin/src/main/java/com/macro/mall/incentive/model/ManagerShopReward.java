package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 单个门店的店长奖励。只有被设置为该店店长的疗愈师可见。
 */
@Data
public class ManagerShopReward {

    private Long shopId;

    private String shopName;

    /** 目标指标：0=业绩（actualRevenue 为整店实收），1=复购（actualRevenue 为当月复购金额）。 */
    private Integer metricType = 0;

    /** 指标实际值：业绩目标是整店实收，复购目标是当月复购金额。 */
    private BigDecimal actualRevenue = BigDecimal.ZERO;

    /** 指标目标值，与 metricType 对应。 */
    private BigDecimal targetRevenue = BigDecimal.ZERO;

    private BigDecimal commissionRate = BigDecimal.ZERO;

    private Boolean achieved = false;

    private BigDecimal amount = BigDecimal.ZERO;
}
