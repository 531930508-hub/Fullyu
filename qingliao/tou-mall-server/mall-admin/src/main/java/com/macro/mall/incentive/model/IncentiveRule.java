package com.macro.mall.incentive.model;

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

    public BigDecimal coefficientFor(BigDecimal minutes, boolean newPartner) {
        if (newPartner) {
            return newCoefficient;
        }
        if (coefficients == null || coefficients.isEmpty()) {
            return BigDecimal.ONE;
        }
        BigDecimal value = coefficients.get(0).getCoefficient();
        long m = minutes == null ? 0L : minutes.longValue();
        for (CoefficientBand band : coefficients) {
            if (m >= band.getMinMinutes()) {
                value = band.getCoefficient();
            } else {
                break;
            }
        }
        return value;
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
