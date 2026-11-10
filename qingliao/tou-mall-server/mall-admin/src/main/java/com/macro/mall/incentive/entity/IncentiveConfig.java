package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 激励参数版本。按月生效，参数调整必须新增版本，禁止回写历史版本。
 */
@Getter
@Setter
@TableName("s_incentive_config")
public class IncentiveConfig extends BaseEntity {

    private String effectiveMonth;

    private Integer revision;

    private Integer status;

    private BigDecimal newCoefficient;

    private BigDecimal retentionThreshold;

    private Integer minNewSample;

    private Integer retentionMonths;

    private Integer retentionEndOffset;

    private Integer conversionMonths;

    private Integer conversionEndOffset;

    private Integer conversionDays;

    private Integer tenDayDays;

    private BigDecimal fibA1;

    private BigDecimal fibA2;

    private BigDecimal fibCap;

    private String remark;

    private Long createUserId;

    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
