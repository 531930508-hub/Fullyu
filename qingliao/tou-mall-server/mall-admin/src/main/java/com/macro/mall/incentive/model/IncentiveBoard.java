package com.macro.mall.incentive.model;

import lombok.Data;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 一位疗愈师在某个月份的完整激励看板，PC 明细与手机端共用。
 */
@Data
public class IncentiveBoard {

    private String month;

    private LocalDate asOf;

    private LocalDate cutoff;

    private Boolean currentMonth;

    private Boolean estimated = true;

    private Long massagistId;

    private String massagistName;

    private String avatarUrl;

    private Long shopId;

    private String shopName;

    private LocalDate joinDate;

    private Long joinDays;

    /**
     * 合作中 / 已结束合作。仅作展示，不涉及其它雇傭表述。
     */
    private String cooperationStatus;

    private AchievementSummary achievements = new AchievementSummary();

    private BaseIncentive base = new BaseIncentive();

    private TrainingSection training = new TrainingSection();

    private RepurchaseMetrics repurchase = new RepurchaseMetrics();

    private ManagerIncentive manager = new ManagerIncentive();

    private SettlementResult settlement = new SettlementResult();

    private List<String> warnings = new ArrayList<>();
}
