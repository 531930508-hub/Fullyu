package com.macro.mall.incentive.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.incentive.calc.IncentiveMath;
import com.macro.mall.incentive.dto.IncentiveConfigBundle;
import com.macro.mall.incentive.dto.IncentiveConfigSaveRequest;
import com.macro.mall.incentive.entity.IncentiveCoefficient;
import com.macro.mall.incentive.entity.IncentiveConfig;
import com.macro.mall.incentive.entity.IncentiveTier;
import com.macro.mall.incentive.entity.TrainingProjectConfig;
import com.macro.mall.incentive.mapper.IncentiveCoefficientMapper;
import com.macro.mall.incentive.mapper.IncentiveConfigMapper;
import com.macro.mall.incentive.mapper.IncentiveTierMapper;
import com.macro.mall.incentive.mapper.TrainingProjectConfigMapper;
import com.macro.mall.incentive.model.CoefficientBand;
import com.macro.mall.incentive.model.IncentiveRule;
import com.macro.mall.incentive.model.RepurchaseTier;
import com.macro.mall.incentive.model.TrainingProjectRule;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class IncentiveConfigService {

    @Autowired
    private IncentiveConfigMapper configMapper;

    @Autowired
    private IncentiveCoefficientMapper coefficientMapper;

    @Autowired
    private IncentiveTierMapper tierMapper;

    @Autowired
    private TrainingProjectConfigMapper projectMapper;

    public IncentiveConfigBundle bundleForMonth(String month) {
        String normalized = IncentiveMath.normalizeMonth(month);
        IncentiveConfig config = configMapper.selectOne(new LambdaQueryWrapper<IncentiveConfig>()
                .eq(IncentiveConfig::getStatus, 1)
                .le(IncentiveConfig::getEffectiveMonth, normalized)
                .orderByDesc(IncentiveConfig::getEffectiveMonth)
                .orderByDesc(IncentiveConfig::getRevision)
                .last("LIMIT 1"));
        if (config == null) {
            return defaultBundle(normalized);
        }

        IncentiveConfigBundle bundle = new IncentiveConfigBundle();
        bundle.setConfig(config);
        bundle.setUsingDefault(false);

        List<IncentiveCoefficient> coefficients = coefficientMapper.selectList(
                new LambdaQueryWrapper<IncentiveCoefficient>()
                        .eq(IncentiveCoefficient::getConfigId, config.getId())
                        .orderByAsc(IncentiveCoefficient::getSort));
        if (CollectionUtils.isEmpty(coefficients)) {
            coefficients = IncentiveDefaults.coefficients();
        }
        List<IncentiveTier> tiers = tierMapper.selectList(new LambdaQueryWrapper<IncentiveTier>()
                .eq(IncentiveTier::getConfigId, config.getId())
                .orderByAsc(IncentiveTier::getSort));
        if (CollectionUtils.isEmpty(tiers)) {
            tiers = IncentiveDefaults.tiers();
        }
        List<TrainingProjectConfig> projects = projectMapper.selectList(
                new LambdaQueryWrapper<TrainingProjectConfig>()
                        .eq(TrainingProjectConfig::getConfigId, config.getId())
                        .orderByAsc(TrainingProjectConfig::getSort));
        if (CollectionUtils.isEmpty(projects)) {
            projects = IncentiveDefaults.trainingProjects();
        }

        bundle.setCoefficients(coefficients);
        bundle.setTiers(tiers);
        bundle.setTrainingProjects(projects);
        bundle.setRule(toRule(config, coefficients, tiers, projects));
        return bundle;
    }

    public List<IncentiveConfig> history() {
        return configMapper.selectList(new LambdaQueryWrapper<IncentiveConfig>()
                .orderByDesc(IncentiveConfig::getEffectiveMonth)
                .orderByDesc(IncentiveConfig::getRevision));
    }

    @Transactional(rollbackFor = Exception.class)
    public IncentiveConfig save(IncentiveConfigSaveRequest request, Long operatorId) {
        validate(request);
        IncentiveMath.requireMonth(request.getEffectiveMonth());
        String month = IncentiveMath.normalizeMonth(request.getEffectiveMonth());

        IncentiveConfig previousSameMonth = configMapper.selectOne(new LambdaQueryWrapper<IncentiveConfig>()
                .eq(IncentiveConfig::getEffectiveMonth, month)
                .orderByDesc(IncentiveConfig::getRevision)
                .last("LIMIT 1"));
        int revision = previousSameMonth == null || previousSameMonth.getRevision() == null
                ? 1 : previousSameMonth.getRevision() + 1;

        configMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<IncentiveConfig>()
                .eq(IncentiveConfig::getEffectiveMonth, month)
                .eq(IncentiveConfig::getStatus, 1)
                .set(IncentiveConfig::getStatus, 0));

        IncentiveConfig config = new IncentiveConfig();
        config.setEffectiveMonth(month);
        config.setRevision(revision);
        config.setStatus(1);
        config.setNewCoefficient(request.getNewCoefficient());
        config.setRetentionThreshold(request.getRetentionThreshold());
        config.setMinNewSample(request.getMinNewSample());
        config.setRetentionMonths(request.getRetentionMonths());
        config.setRetentionEndOffset(request.getRetentionEndOffset());
        config.setConversionMonths(request.getConversionMonths());
        config.setConversionEndOffset(request.getConversionEndOffset());
        config.setConversionDays(request.getConversionDays());
        config.setTenDayDays(request.getTenDayDays());
        config.setFibA1(request.getFibA1());
        config.setFibA2(request.getFibA2());
        config.setFibCap(request.getFibCap());
        config.setRemark(request.getRemark());
        config.setCreateUserId(operatorId);
        configMapper.insert(config);

        for (IncentiveConfigSaveRequest.CoefficientItem item : request.getCoefficients()) {
            IncentiveCoefficient entity = new IncentiveCoefficient();
            entity.setConfigId(config.getId());
            entity.setMinMinutes(item.getMinMinutes());
            entity.setCoefficient(item.getCoefficient());
            entity.setSort(item.getMinMinutes() == null ? 0 : item.getMinMinutes().intValue());
            coefficientMapper.insert(entity);
        }
        int tierSort = 0;
        for (IncentiveConfigSaveRequest.TierItem item : request.getTiers()) {
            IncentiveTier entity = new IncentiveTier();
            entity.setConfigId(config.getId());
            entity.setRate(item.getRate());
            entity.setAmount(item.getAmount());
            entity.setSort(tierSort++);
            tierMapper.insert(entity);
        }
        int projectSort = 0;
        for (IncentiveConfigSaveRequest.ProjectItem item : request.getTrainingProjects()) {
            TrainingProjectConfig entity = new TrainingProjectConfig();
            entity.setConfigId(config.getId());
            entity.setProjectKey(item.getProjectKey().trim());
            entity.setProjectGroup(item.getProjectGroup());
            entity.setProjectName(item.getProjectName());
            entity.setProjectId(item.getProjectId());
            entity.setPartName(item.getPartName());
            entity.setAliases(item.getAliases());
            entity.setDurationMinutes(item.getDurationMinutes());
            entity.setTargetCount(item.getTargetCount());
            entity.setAmount(item.getAmount());
            entity.setEnabled(item.getEnabled() == null ? 1 : item.getEnabled());
            entity.setSort(item.getSort() == null ? projectSort : item.getSort());
            projectSort++;
            projectMapper.insert(entity);
        }
        return config;
    }

    private void validate(IncentiveConfigSaveRequest request) {
        if (request == null) {
            throw new BusinessException("参数不能为空");
        }
        IncentiveMath.requireMonth(request.getEffectiveMonth());
        requirePositive(request.getNewCoefficient(), "新人系数");
        requireRange(request.getRetentionThreshold(), "老客留存门槛", "0", "100");
        requireMin(request.getMinNewSample(), 1, "新客最小样本");
        requireMin(request.getRetentionMonths(), 1, "留存统计月数");
        requireMin(request.getRetentionEndOffset(), 0, "留存截止偏移");
        requireMin(request.getConversionMonths(), 1, "30 天复购统计月数");
        requireMin(request.getConversionEndOffset(), 0, "30 天复购截止偏移");
        requireMin(request.getConversionDays(), 1, "30 天复购天数");
        requireMin(request.getTenDayDays(), 1, "10 天复购天数");
        requirePositive(request.getFibA1(), "数列首项");
        requirePositive(request.getFibA2(), "数列次项");
        requirePositive(request.getFibCap(), "单笔封顶");

        if (CollectionUtils.isEmpty(request.getCoefficients())) {
            throw new BusinessException("至少配置一个时长档位");
        }
        Set<Long> minutes = new HashSet<>();
        boolean zero = false;
        for (IncentiveConfigSaveRequest.CoefficientItem item : request.getCoefficients()) {
            if (item.getMinMinutes() == null || item.getMinMinutes() < 0) {
                throw new BusinessException("时长档位起点不能为负");
            }
            requirePositive(item.getCoefficient(), "基础系数");
            if (!minutes.add(item.getMinMinutes())) {
                throw new BusinessException("时长档位起点重复：" + item.getMinMinutes());
            }
            if (item.getMinMinutes() == 0L) {
                zero = true;
            }
        }
        if (!zero) {
            throw new BusinessException("必须配置 0 分钟起始档位");
        }

        if (CollectionUtils.isEmpty(request.getTiers())) {
            throw new BusinessException("至少配置一个 30 天复购档位");
        }
        Set<BigDecimal> rates = new HashSet<>();
        for (IncentiveConfigSaveRequest.TierItem item : request.getTiers()) {
            requireRange(item.getRate(), "复购档位", "0", "100");
            if (item.getAmount() == null || item.getAmount().compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessException("复购档位金额不能为负");
            }
            if (!rates.add(item.getRate())) {
                throw new BusinessException("复购档位重复：" + item.getRate());
            }
        }

        if (CollectionUtils.isEmpty(request.getTrainingProjects())) {
            throw new BusinessException("至少配置一个培训项目");
        }
        Set<String> keys = new HashSet<>();
        for (IncentiveConfigSaveRequest.ProjectItem item : request.getTrainingProjects()) {
            if (item.getProjectKey() == null || item.getProjectKey().trim().isEmpty()) {
                throw new BusinessException("培训项目编码不能为空");
            }
            if (!keys.add(item.getProjectKey().trim())) {
                throw new BusinessException("培训项目编码重复：" + item.getProjectKey());
            }
            requireMin(item.getTargetCount(), 1, "培训目标次数");
            if (item.getAmount() == null || item.getAmount().compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessException("培训补贴金额不能为负");
            }
        }
    }

    private void requirePositive(BigDecimal value, String label) {
        if (value == null || value.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(label + "必须大于 0");
        }
    }

    private void requireRange(BigDecimal value, String label, String min, String max) {
        if (value == null || value.compareTo(new BigDecimal(min)) < 0
                || value.compareTo(new BigDecimal(max)) > 0) {
            throw new BusinessException(label + "必须在 " + min + "–" + max + " 之间");
        }
    }

    private void requireMin(Integer value, int min, String label) {
        if (value == null || value < min) {
            throw new BusinessException(label + "不能小于 " + min);
        }
    }

    private IncentiveConfigBundle defaultBundle(String month) {
        IncentiveConfig config = IncentiveDefaults.config(month);
        List<IncentiveCoefficient> coefficients = IncentiveDefaults.coefficients();
        List<IncentiveTier> tiers = IncentiveDefaults.tiers();
        List<TrainingProjectConfig> projects = IncentiveDefaults.trainingProjects();
        IncentiveConfigBundle bundle = new IncentiveConfigBundle();
        bundle.setConfig(config);
        bundle.setUsingDefault(true);
        bundle.setCoefficients(coefficients);
        bundle.setTiers(tiers);
        bundle.setTrainingProjects(projects);
        bundle.setRule(toRule(config, coefficients, tiers, projects));
        return bundle;
    }

    private IncentiveRule toRule(IncentiveConfig config,
                                 List<IncentiveCoefficient> coefficients,
                                 List<IncentiveTier> tiers,
                                 List<TrainingProjectConfig> projects) {
        IncentiveConfig fallback = IncentiveDefaults.config(config.getEffectiveMonth());
        IncentiveRule rule = new IncentiveRule();
        rule.setConfigId(config.getId());
        rule.setEffectiveMonth(config.getEffectiveMonth());
        rule.setNewCoefficient(value(config.getNewCoefficient(), fallback.getNewCoefficient()));
        rule.setRetentionThreshold(value(config.getRetentionThreshold(), fallback.getRetentionThreshold()));
        rule.setMinNewSample(config.getMinNewSample() == null ? fallback.getMinNewSample() : config.getMinNewSample());
        rule.setRetentionMonths(config.getRetentionMonths() == null ? fallback.getRetentionMonths() : config.getRetentionMonths());
        rule.setRetentionEndOffset(config.getRetentionEndOffset() == null ? fallback.getRetentionEndOffset() : config.getRetentionEndOffset());
        rule.setConversionMonths(config.getConversionMonths() == null ? fallback.getConversionMonths() : config.getConversionMonths());
        rule.setConversionEndOffset(config.getConversionEndOffset() == null ? fallback.getConversionEndOffset() : config.getConversionEndOffset());
        rule.setConversionDays(config.getConversionDays() == null ? fallback.getConversionDays() : config.getConversionDays());
        rule.setTenDayDays(config.getTenDayDays() == null ? fallback.getTenDayDays() : config.getTenDayDays());
        rule.setFibA1(value(config.getFibA1(), fallback.getFibA1()));
        rule.setFibA2(value(config.getFibA2(), fallback.getFibA2()));
        rule.setFibCap(value(config.getFibCap(), fallback.getFibCap()));

        List<IncentiveCoefficient> bands = new ArrayList<>(coefficients);
        bands.sort(Comparator.comparing(e -> e.getMinMinutes() == null ? Long.MAX_VALUE : e.getMinMinutes()));
        for (IncentiveCoefficient entity : bands) {
            if (entity.getMinMinutes() != null && entity.getCoefficient() != null) {
                rule.getCoefficients().add(new CoefficientBand(entity.getMinMinutes(), entity.getCoefficient()));
            }
        }
        List<IncentiveTier> sortedTiers = new ArrayList<>(tiers);
        sortedTiers.sort(Comparator.comparing(e -> e.getRate() == null ? new BigDecimal("999") : e.getRate()));
        for (IncentiveTier entity : sortedTiers) {
            if (entity.getRate() != null && entity.getAmount() != null) {
                rule.getTiers().add(new RepurchaseTier(entity.getRate(), entity.getAmount()));
            }
        }
        for (TrainingProjectConfig entity : projects) {
            if (entity.getEnabled() != null && entity.getEnabled() == 0) {
                continue;
            }
            TrainingProjectRule project = new TrainingProjectRule();
            project.setId(entity.getId());
            project.setProjectKey(entity.getProjectKey());
            project.setProjectGroup(entity.getProjectGroup());
            project.setProjectName(entity.getProjectName());
            project.setProjectId(entity.getProjectId());
            project.setPartName(entity.getPartName());
            project.setAliases(entity.getAliases());
            project.setDurationMinutes(entity.getDurationMinutes());
            project.setTargetCount(entity.getTargetCount() == null ? 5 : entity.getTargetCount());
            project.setAmount(entity.getAmount() == null ? new BigDecimal("500") : entity.getAmount());
            project.setEnabled(true);
            project.setSort(entity.getSort());
            rule.getTrainingProjects().add(project);
        }
        rule.getTrainingProjects().sort(Comparator.comparing(e -> e.getSort() == null ? Integer.MAX_VALUE : e.getSort()));
        return rule;
    }

    private BigDecimal value(BigDecimal value, BigDecimal fallback) {
        return value == null ? fallback : value;
    }
}
