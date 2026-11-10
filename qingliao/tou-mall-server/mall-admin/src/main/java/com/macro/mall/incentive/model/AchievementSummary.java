package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 累计成就，统计截止到所选月份的月末或今日。
 */
@Data
public class AchievementSummary {

    private LocalDate joinDate;

    private Long joinDays;

    private BigDecimal totalServiceMinutes = BigDecimal.ZERO;

    private Integer customerCount;

    private String topFanMasked;

    private Integer topFanVisits;

    private LocalDate asOf;
}
