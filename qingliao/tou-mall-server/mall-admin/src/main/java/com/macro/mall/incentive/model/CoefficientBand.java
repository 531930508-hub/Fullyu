package com.macro.mall.incentive.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 基础接单系数档位：达到 minMinutes 的当刻进入该档（左闭）。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CoefficientBand {

    private long minMinutes;

    private BigDecimal coefficient;
}
