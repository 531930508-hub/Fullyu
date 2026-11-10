package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 培训补贴项目。全感舒筋按部位拆成独立项目，头部水疗按 60/90 分钟拆分。
 */
@Getter
@Setter
@TableName("s_training_project_config")
public class TrainingProjectConfig extends BaseEntity {

    private Long configId;

    private String projectKey;

    private String projectGroup;

    private String projectName;

    private Long projectId;

    private String partName;

    /**
     * 逗号分隔的别名，命中订单 parts 或项目标题即可。
     */
    private String aliases;

    private Integer durationMinutes;

    private Integer targetCount;

    private BigDecimal amount;

    private Integer enabled;

    private Integer sort;
}
