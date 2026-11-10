package com.macro.mall.incentive.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
public class TrainingAssessmentRow {

    private Long id;

    private Long massagistId;

    private String massagistName;

    private Long shopId;

    private String shopName;

    private String projectKey;

    private String projectName;

    private LocalDate assessDate;

    private Integer result;

    private Long trainerMassagistId;

    private String trainerName;

    private Long trainerShopId;

    private String trainerShopName;

    private String remark;

    private LocalDateTime submittedAt;

    private Integer voided;

    private String voidReason;
}
