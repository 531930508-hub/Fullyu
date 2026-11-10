package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 复购激励指标。金额分为“理论可得”与“满足老客留存门槛后实际计入”。
 */
@Data
public class RepurchaseMetrics {

    private LocalDate retentionWindowStart;

    private LocalDate retentionWindowEnd;

    private LocalDate conversionWindowStart;

    private LocalDate conversionWindowEnd;

    private Integer retentionSample;

    private Integer retainedVisits;

    private BigDecimal retentionRate;

    private Boolean retentionEligible;

    private BigDecimal retentionThreshold;

    /**
     * 30 天窗口内的新客去重人数，用于判断最小样本。
     */
    private Integer newCustomerCount;

    /**
     * 30 天复购加权人数（分母）。
     */
    private BigDecimal newCustomerWeight;

    /**
     * 30 天内复购加权人数（分子）。
     */
    private BigDecimal repurchaseWeight;

    private BigDecimal conversionRate;

    private Boolean conversionSampleSufficient;

    private Integer minNewSample;

    private BigDecimal tierRate;

    private BigDecimal tierPotentialAmount;

    private BigDecimal appliedTierAmount;

    private BigDecimal nextTierRate;

    private BigDecimal nextTierAmount;

    private BigDecimal neededForNextTier;

    /**
     * 符合条件的 10 天复购记录数（整数顺位）。
     */
    private Integer tenDayHeadCount;

    /**
     * 共同服务分摊后的加权人数，仅用于展示，不用于计算下一位序号。
     */
    private BigDecimal tenDayWeightedHeads;

    private BigDecimal tenDayPotentialAmount;

    private BigDecimal appliedTenDayAmount;

    private BigDecimal tenDayNextPrice;

    private List<BigDecimal> tenDayPrices = new ArrayList<>();

    private List<TenDayRecord> tenDayRecords = new ArrayList<>();

    private BigDecimal potentialAmount;

    private BigDecimal totalAmount;
}
