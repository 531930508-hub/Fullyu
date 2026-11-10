package com.macro.mall.incentive.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class TrainingAssessmentSummary {

    private String month;

    private long total;

    private long passCount;

    private long failCount;

    private String passRate;

    private long certifiedCount;

    private long teamCertifiedCount;

    private long manualCertifiedCount;

    private long legacyCertifiedCount;

    private String avgAttempts;

    private String avgDaysToCert;

    private long repeatedFailureCount;

    private long backlogCount;

    private List<ProjectMetric> byProject = new ArrayList<>();

    private List<TrainerMetric> byTrainer = new ArrayList<>();

    private List<ShopMetric> byShop = new ArrayList<>();

    private List<TrendMetric> monthlyTrend = new ArrayList<>();

    private List<TargetMetric> repeatedTargets = new ArrayList<>();

    private List<TargetMetric> backlogTargets = new ArrayList<>();

    @Getter
    @Setter
    public static class ProjectMetric {
        private String projectKey;
        private String projectName;
        private long total;
        private long pass;
        private long fail;
        private String passRate;
    }

    @Getter
    @Setter
    public static class TrainerMetric {
        private Long trainerId;
        private String trainerName;
        private long total;
        private long pass;
        private long fail;
        private String passRate;
        private String failRate;
    }

    @Getter
    @Setter
    public static class ShopMetric {
        private Long shopId;
        private String shopName;
        private long total;
        private long certified;
    }

    @Getter
    @Setter
    public static class TrendMetric {
        private String month;
        private long total;
        private long pass;
        private long certified;
    }

    @Getter
    @Setter
    public static class TargetMetric {
        private Long massagistId;
        private String massagistName;
        private String shopName;
        private String projectKey;
        private String projectName;
        private long attemptCount;
        private long failCount;
        private LocalDate lastAssessDate;
    }
}
