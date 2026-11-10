package com.macro.mall.incentive.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TrainerProfileView {

    private Long trainerId;

    private String trainerName;

    private Long shopId;

    private String shopName;

    private String trainerSince;

    private int monthSubmissions;

    private int todaySubmissions;
}
