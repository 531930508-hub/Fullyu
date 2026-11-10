package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 基础接单奖励及其档位提示。
 */
@Data
public class BaseIncentive {

    private BigDecimal minutes = BigDecimal.ZERO;

    private BigDecimal coefficient = BigDecimal.ONE;

    private BigDecimal amount = BigDecimal.ZERO;

    private Boolean newPartner = false;

    private List<CoefficientBand> bands = new ArrayList<>();

    private Long currentBandMinutes;

    private BigDecimal currentBandCoefficient;

    private Long nextBandMinutes;

    private BigDecimal nextBandCoefficient;

    private BigDecimal minutesToNextBand;

    private String nextBandHint;
}
