package com.macro.mall.incentive.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 保存一版激励参数。生效月相同则自动生成新修订号，历史月份不受影响。
 */
@Data
public class IncentiveConfigSaveRequest {

    private String effectiveMonth;

    private BigDecimal newCoefficient;

    private BigDecimal retentionThreshold;

    private Integer minNewSample;

    private Integer retentionMonths;

    private Integer retentionEndOffset;

    private Integer conversionMonths;

    private Integer conversionEndOffset;

    private Integer conversionDays;

    private Integer tenDayDays;

    private BigDecimal fibA1;

    private BigDecimal fibA2;

    private BigDecimal fibCap;

    private String remark;

    private List<CoefficientItem> coefficients = new ArrayList<>();

    private List<TierItem> tiers = new ArrayList<>();

    private List<ProjectItem> trainingProjects = new ArrayList<>();

    @Data
    public static class CoefficientItem {
        private Long minMinutes;
        private BigDecimal coefficient;
    }

    @Data
    public static class TierItem {
        private BigDecimal rate;
        private BigDecimal amount;
    }

    @Data
    public static class ProjectItem {
        private String projectKey;
        private String projectGroup;
        private String projectName;
        private Long projectId;
        private String partName;
        private String aliases;
        private Integer durationMinutes;
        private Integer targetCount;
        private BigDecimal amount;
        private Integer enabled;
        private Integer sort;
    }
}
