package com.macro.mall.incentive.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 基础薪资档位：达到 minMinutes 的当刻进入该档（左闭）；coefficient 为单价（元/分钟），取值 1.00–1.50。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CoefficientBand {

    private long minMinutes;

    private BigDecimal coefficient;
}
