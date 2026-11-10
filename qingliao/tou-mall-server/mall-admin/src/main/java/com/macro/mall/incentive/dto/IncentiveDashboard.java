package com.macro.mall.incentive.dto;

import com.macro.mall.incentive.model.IncentiveBoard;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * PC 管理端看板：门店目标、汇总与疗愈师明细。
 */
@Data
public class IncentiveDashboard {

    private String month;

    private LocalDate asOf;

    private LocalDate cutoff;

    private Boolean currentMonth;

    private Long shopId;

    private String shopName;

    private BigDecimal targetRevenue = BigDecimal.ZERO;

    private BigDecimal actualRevenue = BigDecimal.ZERO;

    private BigDecimal achievementRate = BigDecimal.ZERO;

    private BigDecimal managerAmount = BigDecimal.ZERO;

    private String managerName;

    private BigDecimal totalBase = BigDecimal.ZERO;

    private BigDecimal totalManager = BigDecimal.ZERO;

    private BigDecimal totalTraining = BigDecimal.ZERO;

    private BigDecimal totalRepurchase = BigDecimal.ZERO;

    private BigDecimal totalPotential = BigDecimal.ZERO;

    private BigDecimal totalSettlement = BigDecimal.ZERO;

    private Integer therapistCount = 0;

    private Boolean usingDefaultConfig = false;

    private List<IncentiveBoard> therapists = new ArrayList<>();

    private List<String> warnings = new ArrayList<>();
}
