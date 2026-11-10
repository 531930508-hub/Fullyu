package com.macro.mall.incentive.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class TrainingAssessmentDetail {

    private Long massagistId;

    private String massagistName;

    private String shopName;

    private String projectKey;

    private String projectName;

    private Long certId;

    private LocalDate passedAt;

    private String certSource;

    private LocalDateTime certifiedAt;

    private Integer teamSize;

    private List<VoteView> votes = new ArrayList<>();

    @Getter
    @Setter
    public static class VoteView {
        private Long id;
        private String trainerName;
        private String trainerShopName;
        private LocalDate assessDate;
        private Integer result;
        private LocalDateTime submittedAt;
        private Integer voided;
        private String voidReason;
    }
}
