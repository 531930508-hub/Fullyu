package com.macro.mall.incentive.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
public class TrainerAssessmentView {

    private Long id;

    private String massagistName;

    private String shopName;

    private String projectName;

    private LocalDate assessDate;

    private Integer result;

    private String resultLabel;

    private String remark;

    private LocalDateTime submittedAt;

    /**
     * 有效 / 已作废。
     */
    private String auditStatus;
}
