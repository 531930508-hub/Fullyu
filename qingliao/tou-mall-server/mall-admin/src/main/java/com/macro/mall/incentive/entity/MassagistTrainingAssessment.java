package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 内训师考核流水：只追加，作废通过 voided 标记；一人一项目的最新一票参与三人认证。
 */
@Getter
@Setter
@TableName("s_massagist_training_assessment")
public class MassagistTrainingAssessment {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long massagistId;

    private Long shopId;

    private String projectKey;

    private String projectName;

    private LocalDate assessDate;

    /**
     * 1 通过，0 不通过。
     */
    private Integer result;

    private Long trainerMassagistId;

    private String trainerName;

    private Long trainerShopId;

    private Long trainerAdminId;

    private String remark;

    private LocalDateTime submittedAt;

    private Integer voided;

    private Long voidedBy;

    private LocalDateTime voidedAt;

    private String voidReason;

    private LocalDateTime createTime;
}
