package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 某位伙伴某个培训项目在指定月份的状态。
 */
@Data
public class TrainingProgress {

    private Long certId;

    private String projectKey;

    private String projectGroup;

    private String projectName;

    private Long projectId;

    private String partName;

    private Integer durationMinutes;

    private LocalDate passedAt;

    private LocalDate startDate;

    /**
     * uncertified / upcoming / active / completed-this-month / completed
     */
    private String status;

    /**
     * 展示用进度，最多到目标次数。
     */
    private Integer count;

    /**
     * 实际有效订单数，用于解释已完成项目后续仍有订单。
     */
    private Integer rawCount;

    private Integer target;

    private Integer remaining;

    private BigDecimal progressPercent;

    private LocalDate completionDate;

    private String completionMonth;

    private Boolean completedThisMonth;

    private BigDecimal earnedAmount;

    private BigDecimal configuredAmount;
}
