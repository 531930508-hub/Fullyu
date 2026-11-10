package com.macro.mall.incentive.service;

import com.macro.mall.incentive.entity.IncentiveCoefficient;
import com.macro.mall.incentive.entity.IncentiveConfig;
import com.macro.mall.incentive.entity.IncentiveTier;
import com.macro.mall.incentive.entity.TrainingProjectConfig;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 代码内置的兜底参数。数据库未配置生效版本时使用，保证看板可见且口径可追溯。
 * 正式上线前应在设置页保存一版参数，之后以数据库版本为准。
 */
public final class IncentiveDefaults {

    private IncentiveDefaults() {
    }

    public static IncentiveConfig config(String month) {
        IncentiveConfig config = new IncentiveConfig();
        config.setEffectiveMonth(month);
        config.setRevision(0);
        config.setStatus(1);
        config.setNewCoefficient(new BigDecimal("0.8"));
        config.setRetentionThreshold(new BigDecimal("60"));
        config.setMinNewSample(30);
        config.setRetentionMonths(6);
        config.setRetentionEndOffset(2);
        config.setConversionMonths(3);
        config.setConversionEndOffset(1);
        config.setConversionDays(30);
        config.setTenDayDays(10);
        config.setFibA1(new BigDecimal("10"));
        config.setFibA2(new BigDecimal("10"));
        config.setFibCap(new BigDecimal("130"));
        config.setRemark("系统默认参数（尚未在设置页保存）");
        return config;
    }

    public static List<IncentiveCoefficient> coefficients() {
        List<IncentiveCoefficient> list = new ArrayList<>();
        list.add(coefficient(0L, "1.0", 1));
        list.add(coefficient(7200L, "1.2", 2));
        list.add(coefficient(8400L, "1.3", 3));
        list.add(coefficient(9600L, "1.5", 4));
        return list;
    }

    public static List<IncentiveTier> tiers() {
        List<IncentiveTier> list = new ArrayList<>();
        list.add(tier("10", "200", 1));
        list.add(tier("12", "400", 2));
        list.add(tier("15", "800", 3));
        list.add(tier("18", "1100", 4));
        list.add(tier("20", "1500", 5));
        return list;
    }

    /**
     * 6 个全感舒筋部位 + 头部水疗 60/90 分钟，共 8 个独立项目。
     * projectId 需在设置页绑定线上真实项目后再用于严格匹配。
     */
    public static List<TrainingProjectConfig> trainingProjects() {
        List<TrainingProjectConfig> list = new ArrayList<>();
        list.add(project("sujin_face", "全感舒筋", "面部", "脸,面部,脸部", null, 1));
        list.add(project("sujin_hand", "全感舒筋", "手部", "手,手部,手臂", null, 2));
        list.add(project("sujin_head", "全感舒筋", "头部", "头,头部,头疗", null, 3));
        list.add(project("sujin_shoulder", "全感舒筋", "肩部", "肩,肩部,肩颈", null, 4));
        list.add(project("sujin_eye", "全感舒筋", "眼部", "眼,眼部,眼睛", null, 5));
        list.add(project("sujin_leg", "全感舒筋", "腿部", "腿,腿部,腿疗", null, 6));
        list.add(project("head_spa_60", "头部水疗", "60 分钟", "水疗,头部水疗", 60, 7));
        list.add(project("head_spa_90", "头部水疗", "90 分钟", "水疗,头部水疗", 90, 8));
        return list;
    }

    private static IncentiveCoefficient coefficient(Long minutes, String coefficient, int sort) {
        IncentiveCoefficient entity = new IncentiveCoefficient();
        entity.setMinMinutes(minutes);
        entity.setCoefficient(new BigDecimal(coefficient));
        entity.setSort(sort);
        return entity;
    }

    private static IncentiveTier tier(String rate, String amount, int sort) {
        IncentiveTier entity = new IncentiveTier();
        entity.setRate(new BigDecimal(rate));
        entity.setAmount(new BigDecimal(amount));
        entity.setSort(sort);
        return entity;
    }

    private static TrainingProjectConfig project(String key,
                                                 String group,
                                                 String name,
                                                 String aliases,
                                                 Integer durationMinutes,
                                                 int sort) {
        TrainingProjectConfig entity = new TrainingProjectConfig();
        entity.setProjectKey(key);
        entity.setProjectGroup(group);
        entity.setProjectName(name);
        entity.setPartName("头部水疗".equals(group) ? "头部水疗" : name);
        entity.setAliases(aliases);
        entity.setDurationMinutes(durationMinutes);
        entity.setTargetCount(5);
        entity.setAmount(new BigDecimal("500"));
        entity.setEnabled(1);
        entity.setSort(sort);
        return entity;
    }

    public static List<String> splitAliases(String aliases) {
        if (aliases == null || aliases.trim().isEmpty()) {
            return new ArrayList<>();
        }
        return new ArrayList<>(Arrays.asList(aliases.split("[,，、/|]")));
    }
}
