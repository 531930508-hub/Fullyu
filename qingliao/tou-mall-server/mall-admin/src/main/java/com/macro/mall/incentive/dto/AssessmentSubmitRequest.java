package com.macro.mall.incentive.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class AssessmentSubmitRequest {

    private Long massagistId;

    private String projectKey;

    private LocalDate assessDate;

    /**
     * 1 通过，0 不通过。
     */
    private Integer result;

    private String remark;
}
