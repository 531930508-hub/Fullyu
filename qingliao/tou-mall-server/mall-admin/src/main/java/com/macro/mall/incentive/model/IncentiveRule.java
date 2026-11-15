package com.macro.mall.incentive.model;

import com.macro.mall.incentive.calc.BaseSalaryLadder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 某个生效月份适用的完整激励规则快照。
 */
@Data
public class IncentiveRule {

    private Long configId;

    private String effectiveMonth;

    private List<CoefficientBand> coefficients = new ArrayList<>();

    private BigDecimal newCoefficient = new BigDecimal("0.8");

    private BigDecimal retentionThreshold = new BigDecimal("60");

    private Integer minNewSample = 30;

    /**
     * 老客留存的最小样本（可观察老客到店人次）。低于该值不判合格，避免小样本 100% 直接解锁复购档位。
     */
    private Integer minRetentionSample = 30;

    private List<RepurchaseTier> tiers = new ArrayList<>();

    private BigDecimal fibA1 = new BigDecimal("10");

    private BigDecimal fibA2 = new BigDecimal("10");

    private BigDecimal fibCap = new BigDecimal("130");

    private Integer retentionMonths = 6;

    private Integer retentionEndOffset = 2;

    private Integer conversionMonths = 3;

    private Integer conversionEndOffset = 1;

    private Integer conversionDays = 30;

    private Integer tenDayDays = 10;

    private List<TrainingProjectRule> trainingProjects = new ArrayList<>();

    /**
     * 基础薪资单价（元/分钟）。档位按起点重排后取价，配置排序不影响结果；新人合作期取单独单价。
     */
    public BigDecimal coefficientFor(BigDecimal minutes, boolean newPartner) {
        return BaseSalaryLadder.of(coefficients).unitPriceFor(minutes, newPartner, newCoefficient);
    }

    public TrainingProjectRule findProject(String projectKey) {
        if (projectKey == null || trainingProjects == null) {
            return null;
        }
        for (TrainingProjectRule project : trainingProjects) {
            if (projectKey.equals(project.getProjectKey())) {
                return project;
            }
        }
        return null;
    }
}
