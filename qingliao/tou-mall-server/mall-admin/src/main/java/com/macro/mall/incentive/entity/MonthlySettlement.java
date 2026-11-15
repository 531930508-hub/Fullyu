package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.macro.mall.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 月度结算单快照。一个疗愈师一个月一条，生成后金额冻结；
 * DRAFT 可重新生成，CONFIRMED/PUBLISHED 只允许查看。
 */
@Getter
@Setter
@TableName("s_monthly_settlement")
public class MonthlySettlement extends BaseEntity {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_CONFIRMED = "CONFIRMED";
    public static final String STATUS_PUBLISHED = "PUBLISHED";

    private String monthCode;

    private Long shopId;

    private String shopName;

    private Long massagistId;

    private String massagistName;

    private String status;

    private Integer configRevision;

    private Boolean usingDefaultConfig;

    private BigDecimal baseAmount;

    private BigDecimal managerAmount;

    private BigDecimal trainingAmount;

    private BigDecimal repurchaseAmount;

    private BigDecimal repurchasePotential;

    private BigDecimal adjustmentAmount;

    private BigDecimal subtotal;

    private BigDecimal gross;

    private BigDecimal preTax;

    private BigDecimal tax;

    private BigDecimal net;

    private BigDecimal countedMinutes;

    private String cooperationStatus;

    /** 生成时的结算警告，JSON 数组字符串。 */
    private String warnings;

    /** 生成时的看板快照（收入构成、复购进度等），JSON。 */
    private String detailJson;

    private String remark;

    private String generatedBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime generatedTime;

    private String confirmedBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime confirmedTime;

    private String publishedBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime publishedTime;

    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    public boolean isDraft() {
        return STATUS_DRAFT.equals(status);
    }

    public boolean isConfirmed() {
        return STATUS_CONFIRMED.equals(status);
    }

    public boolean isPublished() {
        return STATUS_PUBLISHED.equals(status);
    }
}