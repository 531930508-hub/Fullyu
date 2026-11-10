package com.macro.mall.incentive.dto;

import com.macro.mall.incentive.entity.IncentiveCoefficient;
import com.macro.mall.incentive.entity.IncentiveConfig;
import com.macro.mall.incentive.entity.IncentiveTier;
import com.macro.mall.incentive.entity.TrainingProjectConfig;
import com.macro.mall.incentive.model.IncentiveRule;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 某个月份适用的参数快照，同时供计算与设置页回显。
 */
@Data
public class IncentiveConfigBundle {

    private IncentiveConfig config;

    private IncentiveRule rule;

    private boolean usingDefault;

    private List<IncentiveCoefficient> coefficients = new ArrayList<>();

    private List<IncentiveTier> tiers = new ArrayList<>();

    private List<TrainingProjectConfig> trainingProjects = new ArrayList<>();
}
