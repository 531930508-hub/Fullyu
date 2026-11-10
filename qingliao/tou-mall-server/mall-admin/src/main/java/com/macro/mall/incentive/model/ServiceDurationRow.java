package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 基础接单奖励的服务时长行。
 */
@Data
public class ServiceDurationRow {

    private Long massagistId;

    private Long shopId;

    private Integer duration;

    private BigDecimal projectCoefficient;
}
