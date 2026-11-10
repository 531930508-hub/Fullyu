package com.macro.mall.incentive.dto;

import com.macro.mall.incentive.model.TrainingProgress;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 培训管理页的一行：一位疗愈师的 8 个项目考核状态。
 */
@Data
public class TrainingRecordView {

    private Long massagistId;

    private String massagistName;

    private Long shopId;

    private String shopName;

    private String cooperationStatus;

    private LocalDate entryDay;

    private Integer certifiedCount = 0;

    private List<CertItem> certs = new ArrayList<>();

    private List<TrainingProgress> progress = new ArrayList<>();

    @Data
    public static class CertItem {
        private Long certId;
        private String projectKey;
        private String projectGroup;
        private String projectName;
        private Long projectId;
        private Integer durationMinutes;
        private LocalDate passedAt;
        private String certifierName;
        private String remark;
        private Integer passCount = 0;
        private Integer failCount = 0;
        private Integer attemptCount = 0;
        private LocalDate lastAssessDate;
        private String certSource;
        private LocalDateTime certifiedAt;
        private Integer teamSize = 0;
    }
}
