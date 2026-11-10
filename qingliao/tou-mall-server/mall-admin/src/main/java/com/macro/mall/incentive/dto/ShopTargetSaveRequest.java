package com.macro.mall.incentive.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 门店月度目标保存参数。
 */
@Data
public class ShopTargetSaveRequest {

    private Long shopId;

    private String monthCode;

    private BigDecimal targetRevenue;

    private BigDecimal commissionRate;

    private Long managerMassagistId;

    private String remark;
}
