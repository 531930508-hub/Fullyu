package com.macro.mall.incentive.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TrainerProjectOption {

    private String projectKey;

    private String projectGroup;

    private String projectName;

    private Integer durationMinutes;

    /**
     * PENDING / CERTIFIED。盲考只暴露状态，不暴露票数或其他内训师。
     */
    private String status;

    private String statusLabel;
}
