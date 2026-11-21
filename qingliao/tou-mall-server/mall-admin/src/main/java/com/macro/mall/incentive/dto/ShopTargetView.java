package com.macro.mall.incentive.dto;

import com.macro.mall.incentive.entity.ShopIncentiveTarget;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 门店目标回显，附带门店与店长名称。
 */
@Data
public class ShopTargetView {

    private Long id;

    private Long shopId;

    private String shopName;

    private String monthCode;

    /** 0=业绩目标（整店实收），1=复购目标（当月复购金额）。 */
    private Integer metricType = ShopIncentiveTarget.METRIC_REVENUE;

    private BigDecimal targetRevenue = BigDecimal.ZERO;

    private BigDecimal commissionRate = BigDecimal.ZERO;

    private Long managerMassagistId;

    private String managerName;

    private String remark;
}
