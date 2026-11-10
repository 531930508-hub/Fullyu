package com.macro.mall.incentive.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 新客 30 天复购率档位。rate 为百分比数值，例如 10 表示 10%。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RepurchaseTier {

    private BigDecimal rate;

    private BigDecimal amount;
}
