package com.macro.mall.incentive.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 单个门店当月的复购金额（有效订单中老客订单的实付合计）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ShopRepeatAmount {

    private Long shopId;

    private BigDecimal amount;
}