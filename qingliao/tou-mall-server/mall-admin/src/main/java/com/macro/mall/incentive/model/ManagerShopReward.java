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

    private BigDecimal actualRevenue = BigDecimal.ZERO;

    private BigDecimal targetRevenue = BigDecimal.ZERO;

    private BigDecimal commissionRate = BigDecimal.ZERO;

    private Boolean achieved = false;

    private BigDecimal amount = BigDecimal.ZERO;
}
