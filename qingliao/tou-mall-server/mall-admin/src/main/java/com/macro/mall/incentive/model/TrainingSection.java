package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 培训补贴：列表展示全部项目状态，金额只计入达标当月。
 */
@Data
public class TrainingSection {

    private BigDecimal earnedAmount = BigDecimal.ZERO;

    private Integer completedCount = 0;

    private Integer projectCount = 0;

    private List<TrainingProgress> projects = new ArrayList<>();
}
