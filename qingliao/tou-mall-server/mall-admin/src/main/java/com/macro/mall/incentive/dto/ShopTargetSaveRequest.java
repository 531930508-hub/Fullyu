package com.macro.mall.incentive.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 门店月度目标保存参数。metricType 为空按业绩目标（0）处理。
 */
@Data
public class ShopTargetSaveRequest {

    private Long shopId;

    private String monthCode;

    /** 0=业绩目标（整店实收），1=复购目标（当月复购金额）。 */
    private Integer metricType;

    private BigDecimal targetRevenue;

    private BigDecimal commissionRate;

    private Long managerMassagistId;

    private String remark;
}
