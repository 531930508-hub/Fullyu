package com.macro.mall.incentive.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 维护疗愈师项目考核日。
 */
@Data
public class TrainingCertSaveRequest {

    private Long massagistId;

    private String projectKey;

    private LocalDate passedAt;

    private String remark;
}
