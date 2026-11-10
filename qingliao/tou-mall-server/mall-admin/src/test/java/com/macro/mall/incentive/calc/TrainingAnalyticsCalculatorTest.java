package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.dto.TrainingAssessmentRow;
import com.macro.mall.incentive.dto.TrainingAssessmentSummary;
import com.macro.mall.incentive.entity.MassagistTrainingCert;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrainingAnalyticsCalculatorTest {

    private final TrainingAnalyticsCalculator calculator = new TrainingAnalyticsCalculator();

    private TrainingAssessmentRow row(long massagistId, String name, long shopId,
                                      String projectKey, int result, LocalDate assessDate,
                                      long trainerId, String trainerName) {
        TrainingAssessmentRow row = new TrainingAssessmentRow();
        row.setMassagistId(massagistId);
        row.setMassagistName(name);
        row.setShopId(shopId);
        row.setShopName("门店" + shopId);
        row.setProjectKey(projectKey);
        row.setProjectName(projectKey + "名称");
        row.setResult(result);
        row.setAssessDate(assessDate);
        row.setTrainerMassagistId(trainerId);
        row.setTrainerName(trainerName);
        row.setSubmittedAt(LocalDateTime.of(2026, 1, 10, 9, 0));
        row.setVoided(0);
        return row;
    }

    private MassagistTrainingCert cert(long massagistId, long shopId, String projectKey,
                                       String source, LocalDate passedAt) {
        MassagistTrainingCert cert = new MassagistTrainingCert();
        cert.setMassagistId(massagistId);
        cert.setShopId(shopId);
        cert.setProjectKey(projectKey);
        cert.setSource(source);
        cert.setPassedAt(passedAt);
        return cert;
    }

    @Test
    void passRateUsesAllSubmissions() {
        List<TrainingAssessmentRow> rows = Arrays.asList(
                row(1, "甲", 5, "head60", 1, LocalDate.of(2026, 1, 1), 11, "A"),
                row(1, "甲", 5, "head60", 1, LocalDate.of(2026, 1, 2), 12, "B"),
                row(1, "甲", 5, "head60", 0, LocalDate.of(2026, 1, 3), 13, "C"));
        TrainingAssessmentSummary summary = calculator.compute("2026-01", rows, new ArrayList<>());
        assertEquals(3, summary.getTotal());
        assertEquals(2, summary.getPassCount());
        assertEquals(1, summary.getFailCount());
        assertEquals("66.7%", summary.getPassRate());
    }

    @Test
    void repeatedFailureCountsPeopleNotRecordsAndIgnoresCertified() {
        List<TrainingAssessmentRow> rows = Arrays.asList(
                row(1, "甲", 5, "head60", 0, LocalDate.of(2026, 1, 1), 11, "A"),
                row(1, "甲", 5, "head60", 0, LocalDate.of(2026, 1, 2), 12, "B"),
                row(2, "乙", 5, "head60", 0, LocalDate.of(2026, 1, 3), 11, "A"),
                row(2, "乙", 5, "head60", 0, LocalDate.of(2026, 1, 4), 12, "B"));
        List<MassagistTrainingCert> certs = Arrays.asList(
                cert(2, 5, "head60", "TEAM", LocalDate.of(2026, 1, 5)));
        TrainingAssessmentSummary summary = calculator.compute("2026-01", rows, certs);
        assertEquals(1, summary.getRepeatedFailureCount());
        assertEquals(1, summary.getRepeatedTargets().size());
        assertEquals(Long.valueOf(1), summary.getRepeatedTargets().get(0).getMassagistId());
    }

    @Test
    void trainerFailRateHighlightsNeverPassingTrainers() {
        List<TrainingAssessmentRow> rows = Arrays.asList(
                row(1, "甲", 5, "head60", 0, LocalDate.of(2026, 1, 1), 11, "A"),
                row(2, "乙", 5, "head60", 0, LocalDate.of(2026, 1, 2), 11, "A"),
                row(3, "丙", 5, "head60", 0, LocalDate.of(2026, 1, 3), 11, "A"),
                row(4, "丁", 5, "head60", 1, LocalDate.of(2026, 1, 4), 12, "B"),
                row(5, "戊", 5, "head60", 1, LocalDate.of(2026, 1, 5), 12, "B"));
        TrainingAssessmentSummary summary = calculator.compute("2026-01", rows, new ArrayList<>());
        TrainingAssessmentSummary.TrainerMetric a = summary.getByTrainer().stream()
                .filter(m -> Long.valueOf(11L).equals(m.getTrainerId())).findFirst().orElseThrow(AssertionError::new);
        TrainingAssessmentSummary.TrainerMetric b = summary.getByTrainer().stream()
                .filter(m -> Long.valueOf(12L).equals(m.getTrainerId())).findFirst().orElseThrow(AssertionError::new);
        assertEquals("100.0%", a.getFailRate());
        assertEquals("0.0%", b.getFailRate());
    }

    @Test
    void trendKeepsSixMonthsIncludingEmptyOnes() {
        List<TrainingAssessmentRow> rows = Arrays.asList(
                row(1, "甲", 5, "head60", 1, LocalDate.of(2026, 1, 1), 11, "A"));
        TrainingAssessmentSummary summary = calculator.compute("2026-01", rows, new ArrayList<>());
        assertEquals(6, summary.getMonthlyTrend().size());
        assertEquals("2025-08", summary.getMonthlyTrend().get(0).getMonth());
        assertEquals("2026-01", summary.getMonthlyTrend().get(5).getMonth());
        assertTrue(summary.getMonthlyTrend().subList(0, 5).stream()
                .allMatch(m -> m.getTotal() == 0));
    }

    @Test
    void legacyTeamAndManualCertsAreCountedSeparately() {
        List<MassagistTrainingCert> certs = Arrays.asList(
                cert(1, 5, "head60", "TEAM", LocalDate.of(2026, 1, 2)),
                cert(2, 5, "head90", "MANUAL", LocalDate.of(2026, 1, 3)),
                cert(3, 5, "full6", "LEGACY", LocalDate.of(2026, 1, 4)),
                cert(4, 5, "full6", null, LocalDate.of(2026, 1, 5)));
        TrainingAssessmentSummary summary = calculator.compute("2026-01",
                new ArrayList<>(), certs);
        assertEquals(4, summary.getCertifiedCount());
        assertEquals(1, summary.getTeamCertifiedCount());
        assertEquals(1, summary.getManualCertifiedCount());
        assertEquals(2, summary.getLegacyCertifiedCount());
    }

    @Test
    void averageAttemptsAndDaysUseCertifiedProjects() {
        List<TrainingAssessmentRow> rows = Arrays.asList(
                row(1, "甲", 5, "head60", 1, LocalDate.of(2026, 1, 1), 11, "A"),
                row(1, "甲", 5, "head60", 1, LocalDate.of(2026, 1, 2), 12, "B"),
                row(1, "甲", 5, "head60", 1, LocalDate.of(2026, 1, 3), 13, "C"));
        List<MassagistTrainingCert> certs = Arrays.asList(
                cert(1, 5, "head60", "TEAM", LocalDate.of(2026, 1, 5)));
        TrainingAssessmentSummary summary = calculator.compute("2026-01", rows, certs);
        assertEquals("3.0", summary.getAvgAttempts());
        assertEquals("4.0", summary.getAvgDaysToCert());
    }

    @Test
    void noSamplesUsesDash() {
        TrainingAssessmentSummary summary = calculator.compute("2026-01",
                new ArrayList<>(), new ArrayList<>());
        assertEquals("-", summary.getAvgAttempts());
        assertEquals("-", summary.getAvgDaysToCert());
        assertEquals("0.0%", summary.getPassRate());
    }
}
