package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 新客 30 天复购档位，取满足条件的最高档，不叠加。
 */
@Getter
@Setter
@TableName("s_incentive_tier")
public class IncentiveTier extends BaseEntity {

    private Long configId;

    private BigDecimal rate;

    private BigDecimal amount;

    private Integer sort;
}
