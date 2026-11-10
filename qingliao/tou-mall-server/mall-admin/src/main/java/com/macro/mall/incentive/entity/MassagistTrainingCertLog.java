package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

/**
 * 考核记录变更日志，保留调整前后的考核日审计线索。
 */
@Getter
@Setter
@TableName("s_massagist_training_cert_log")
public class MassagistTrainingCertLog extends BaseEntity {

    private Long certId;

    private Long massagistId;

    private Long shopId;

    private String projectKey;

    private String action;

    private LocalDate oldPassedAt;

    private LocalDate newPassedAt;

    private Long operatorId;

    private String operatorName;

    private String remark;
}
