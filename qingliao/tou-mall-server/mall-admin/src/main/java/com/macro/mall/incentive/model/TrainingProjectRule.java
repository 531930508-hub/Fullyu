package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 培训项目规则。全感舒筋按部位拆分，头部水疗按时长拆分。
 */
@Data
public class TrainingProjectRule {

    private Long id;

    private String projectKey;

    private String projectGroup;

    private String projectName;

    /**
     * 生产项目 ID。全感舒筋与头部水疗分别对应 s_project.id。
     */
    private Long projectId;

    /**
     * 全感舒筋的部位名称；头部水疗为空。
     */
    private String partName;

    /**
     * 兼容线上部位文案的别名，逗号分隔。
     */
    private String aliases;

    /**
     * 头部水疗时长（分钟）；全感舒筋为空。
     */
    private Integer durationMinutes;

    private Integer targetCount;

    private BigDecimal amount;

    private Boolean enabled;

    private Integer sort;

    public List<String> aliasList() {
        List<String> result = new ArrayList<>();
        if (aliases == null || aliases.trim().isEmpty()) {
            return result;
        }
        Arrays.stream(aliases.split("[,，、/|]"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .forEach(result::add);
        return result;
    }

    public String displayName() {
        if (projectGroup == null || projectGroup.trim().isEmpty()) {
            return projectName;
        }
        return projectGroup + " · " + projectName;
    }
}
