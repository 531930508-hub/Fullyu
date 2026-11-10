package com.macro.mall.incentive.dto;

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

    private BigDecimal targetRevenue = BigDecimal.ZERO;

    private BigDecimal commissionRate = BigDecimal.ZERO;

    private Long managerMassagistId;

    private String managerName;

    private String remark;
}
