package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 基础薪资时长档位。min_minutes 为左闭边界，达到即跳档；coefficient 为该档单价（元/分钟）。
 */
@Getter
@Setter
@TableName("s_incentive_coefficient")
public class IncentiveCoefficient extends BaseEntity {

    private Long configId;

    private Long minMinutes;

    private BigDecimal coefficient;

    private Integer sort;
}
