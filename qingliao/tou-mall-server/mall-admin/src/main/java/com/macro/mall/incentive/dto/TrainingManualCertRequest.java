package com.macro.mall.incentive.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 超管人工特批认证。必须填写原因并写入认证日志。
 */
@Data
public class TrainingManualCertRequest {

    private Long massagistId;

    private String projectKey;

    private LocalDate passedAt;

    private String reason;
}
