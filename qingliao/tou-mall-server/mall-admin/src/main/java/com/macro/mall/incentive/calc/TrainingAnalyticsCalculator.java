package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.dto.TrainingAssessmentRow;
import com.macro.mall.incentive.dto.TrainingAssessmentSummary;
import com.macro.mall.incentive.entity.MassagistTrainingCert;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 考核看板纯计算。只做统计，不碰奖励金额。
 */
public class TrainingAnalyticsCalculator {

    private static final int LIST_CAP = 50;

    public TrainingAssessmentSummary compute(String month, List<TrainingAssessmentRow> allRows,
                                             List<MassagistTrainingCert> allCerts) {
        String selected = month == null ? YearMonth.now().toString() : month;
        YearMonth selectedMonth = YearMonth.parse(selected);
        List<TrainingAssessmentRow> rows = safeRows(allRows).stream()
                .filter(r -> r.getAssessDate() != null
                        && YearMonth.from(r.getAssessDate()).equals(selectedMonth))
                .collect(Collectors.toList());
        List<MassagistTrainingCert> certs = safeCerts(allCerts).stream()
                .filter(c -> c.getPassedAt() != null
                        && YearMonth.from(c.getPassedAt()).equals(selectedMonth))
                .collect(Collectors.toList());

        TrainingAssessmentSummary summary = new TrainingAssessmentSummary();
        summary.setMonth(selected);
        summary.setTotal(rows.size());
        long pass = rows.stream().filter(r -> Integer.valueOf(1).equals(r.getResult())).count();
        summary.setPassCount(pass);
        summary.setFailCount(rows.size() - pass);
        summary.setPassRate(rate(pass, rows.size()));

        summary.setCertifiedCount(certs.size());
        summary.setTeamCertifiedCount(certs.stream().filter(c -> "TEAM".equals(c.getSource())).count());
        summary.setManualCertifiedCount(certs.stream().filter(c -> "MANUAL".equals(c.getSource())).count());
        summary.setLegacyCertifiedCount(certs.stream()
                .filter(c -> c.getSource() == null || "LEGACY".equals(c.getSource())).count());

        Map<String, List<TrainingAssessmentRow>> rowsByKey = rows.stream()
                .collect(Collectors.groupingBy(r -> key(r.getMassagistId(), r.getProjectKey()),
                        LinkedHashMap::new, Collectors.toList()));
        Set<String> certifiedKeys = certs.stream().map(c -> key(c.getMassagistId(), c.getProjectKey()))
                .collect(Collectors.toSet());

        summary.setByProject(projectMetrics(rows));
        summary.setByTrainer(trainerMetrics(rows));
        summary.setByShop(shopMetrics(rows, certs));
        summary.setMonthlyTrend(trend(selectedMonth, safeRows(allRows), safeCerts(allCerts)));
        summary.setAvgAttempts(avgAttempts(certs, rowsByKey));
        summary.setAvgDaysToCert(avgDaysToCert(certs, rows));

        List<TrainingAssessmentSummary.TargetMetric> repeated = new ArrayList<>();
        List<TrainingAssessmentSummary.TargetMetric> backlog = new ArrayList<>();
        for (Map.Entry<String, List<TrainingAssessmentRow>> entry : rowsByKey.entrySet()) {
            if (certifiedKeys.contains(entry.getKey())) continue;
            TrainingAssessmentSummary.TargetMetric metric = targetMetric(entry.getValue());
            if (metric == null) continue;
            if (metric.getFailCount() >= 2) repeated.add(metric);
            else backlog.add(metric);
        }
        Comparator<TrainingAssessmentSummary.TargetMetric> comparator =
                Comparator.comparingLong(TrainingAssessmentSummary.TargetMetric::getFailCount).reversed()
                        .thenComparing(TrainingAssessmentSummary.TargetMetric::getLastAssessDate,
                                Comparator.nullsLast(Comparator.reverseOrder()));
        repeated.sort(comparator);
        backlog.sort(comparator);
        summary.setRepeatedTargets(repeated.stream().limit(LIST_CAP).collect(Collectors.toList()));
        summary.setBacklogTargets(backlog.stream().limit(LIST_CAP).collect(Collectors.toList()));
        summary.setRepeatedFailureCount(repeated.stream().map(TrainingAssessmentSummary.TargetMetric::getMassagistId)
                .filter(Objects::nonNull).distinct().count());
        summary.setBacklogCount(backlog.stream().map(TrainingAssessmentSummary.TargetMetric::getMassagistId)
                .filter(Objects::nonNull).distinct().count());
        return summary;
    }

    private List<TrainingAssessmentSummary.ProjectMetric> projectMetrics(List<TrainingAssessmentRow> rows) {
        Map<String, List<TrainingAssessmentRow>> groups = rows.stream()
                .collect(Collectors.groupingBy(r -> r.getProjectKey() == null ? "" : r.getProjectKey(),
                        LinkedHashMap::new, Collectors.toList()));
        List<TrainingAssessmentSummary.ProjectMetric> result = new ArrayList<>();
        for (Map.Entry<String, List<TrainingAssessmentRow>> entry : groups.entrySet()) {
            TrainingAssessmentSummary.ProjectMetric metric = new TrainingAssessmentSummary.ProjectMetric();
            metric.setProjectKey(entry.getKey());
            metric.setProjectName(entry.getValue().get(0).getProjectName());
            metric.setTotal(entry.getValue().size());
            long pass = entry.getValue().stream()
                    .filter(r -> Integer.valueOf(1).equals(r.getResult())).count();
            metric.setPass(pass);
            metric.setFail(entry.getValue().size() - pass);
            metric.setPassRate(rate(pass, entry.getValue().size()));
            result.add(metric);
        }
        result.sort(Comparator.comparing(TrainingAssessmentSummary.ProjectMetric::getProjectName,
                Comparator.nullsLast(Comparator.naturalOrder())));
        return result;
    }

    private List<TrainingAssessmentSummary.TrainerMetric> trainerMetrics(List<TrainingAssessmentRow> rows) {
        Map<Long, List<TrainingAssessmentRow>> groups = rows.stream()
                .filter(r -> r.getTrainerMassagistId() != null)
                .collect(Collectors.groupingBy(TrainingAssessmentRow::getTrainerMassagistId,
                        LinkedHashMap::new, Collectors.toList()));
        List<TrainingAssessmentSummary.TrainerMetric> result = new ArrayList<>();
        for (Map.Entry<Long, List<TrainingAssessmentRow>> entry : groups.entrySet()) {
            TrainingAssessmentSummary.TrainerMetric metric = new TrainingAssessmentSummary.TrainerMetric();
            metric.setTrainerId(entry.getKey());
            metric.setTrainerName(entry.getValue().get(0).getTrainerName());
            metric.setTotal(entry.getValue().size());
            long pass = entry.getValue().stream()
                    .filter(r -> Integer.valueOf(1).equals(r.getResult())).count();
            metric.setPass(pass);
            metric.setFail(entry.getValue().size() - pass);
            metric.setPassRate(rate(pass, entry.getValue().size()));
            metric.setFailRate(rate(entry.getValue().size() - pass, entry.getValue().size()));
            result.add(metric);
        }
        result.sort(Comparator.comparing(TrainingAssessmentSummary.TrainerMetric::getTotal).reversed()
                .thenComparing(TrainingAssessmentSummary.TrainerMetric::getTrainerName,
                        Comparator.nullsLast(Comparator.naturalOrder())));
        return result;
    }

    private List<TrainingAssessmentSummary.ShopMetric> shopMetrics(List<TrainingAssessmentRow> rows,
                                                                   List<MassagistTrainingCert> certs) {
        Map<Long, List<TrainingAssessmentRow>> groups = rows.stream()
                .filter(r -> r.getShopId() != null)
                .collect(Collectors.groupingBy(TrainingAssessmentRow::getShopId,
                        LinkedHashMap::new, Collectors.toList()));
        Map<Long, Long> certByShop = certs.stream().filter(c -> c.getShopId() != null)
                .collect(Collectors.groupingBy(MassagistTrainingCert::getShopId, Collectors.counting()));
        List<TrainingAssessmentSummary.ShopMetric> result = new ArrayList<>();
        for (Map.Entry<Long, List<TrainingAssessmentRow>> entry : groups.entrySet()) {
            TrainingAssessmentSummary.ShopMetric metric = new TrainingAssessmentSummary.ShopMetric();
            metric.setShopId(entry.getKey());
            metric.setShopName(entry.getValue().get(0).getShopName());
            metric.setTotal(entry.getValue().size());
            metric.setCertified(certByShop.getOrDefault(entry.getKey(), 0L));
            result.add(metric);
        }
        result.sort(Comparator.comparing(TrainingAssessmentSummary.ShopMetric::getTotal).reversed());
        return result;
    }

    private List<TrainingAssessmentSummary.TrendMetric> trend(YearMonth selected,
                                                              List<TrainingAssessmentRow> rows,
                                                              List<MassagistTrainingCert> certs) {
        List<TrainingAssessmentSummary.TrendMetric> result = new ArrayList<>();
        for (int i = 5; i >= 0; i--) {
            YearMonth ym = selected.minusMonths(i);
            TrainingAssessmentSummary.TrendMetric metric = new TrainingAssessmentSummary.TrendMetric();
            metric.setMonth(ym.toString());
            for (TrainingAssessmentRow row : rows) {
                if (row.getAssessDate() != null && YearMonth.from(row.getAssessDate()).equals(ym)) {
                    metric.setTotal(metric.getTotal() + 1);
                    if (Integer.valueOf(1).equals(row.getResult())) {
                        metric.setPass(metric.getPass() + 1);
                    }
                }
            }
            for (MassagistTrainingCert cert : certs) {
                if (cert.getPassedAt() != null && YearMonth.from(cert.getPassedAt()).equals(ym)) {
                    metric.setCertified(metric.getCertified() + 1);
                }
            }
            result.add(metric);
        }
        return result;
    }

    private String avgAttempts(List<MassagistTrainingCert> certs,
                               Map<String, List<TrainingAssessmentRow>> rowsByKey) {
        long sum = 0;
        int samples = 0;
        for (MassagistTrainingCert cert : certs) {
            List<TrainingAssessmentRow> rows = rowsByKey.get(key(cert.getMassagistId(), cert.getProjectKey()));
            if (rows == null || rows.isEmpty()) continue;
            Set<Long> trainers = new HashSet<>();
            for (TrainingAssessmentRow row : rows) {
                if (row.getTrainerMassagistId() != null) trainers.add(row.getTrainerMassagistId());
            }
            sum += trainers.size();
            samples++;
        }
        if (samples == 0) return "-";
        return BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(samples), 1, RoundingMode.HALF_UP).toPlainString();
    }

    private String avgDaysToCert(List<MassagistTrainingCert> certs, List<TrainingAssessmentRow> rows) {
        Map<String, LocalDate> earliest = new HashMap<>();
        for (TrainingAssessmentRow row : rows) {
            if (row.getAssessDate() == null) continue;
            String key = key(row.getMassagistId(), row.getProjectKey());
            LocalDate current = earliest.get(key);
            if (current == null || row.getAssessDate().isBefore(current)) {
                earliest.put(key, row.getAssessDate());
            }
        }
        long days = 0;
        int samples = 0;
        for (MassagistTrainingCert cert : certs) {
            LocalDate start = earliest.get(key(cert.getMassagistId(), cert.getProjectKey()));
            if (start == null || cert.getPassedAt() == null) continue;
            long value = ChronoUnit.DAYS.between(start, cert.getPassedAt());
            days += Math.max(0, value);
            samples++;
        }
        if (samples == 0) return "-";
        return BigDecimal.valueOf(days).divide(BigDecimal.valueOf(samples), 1, RoundingMode.HALF_UP).toPlainString();
    }

    private TrainingAssessmentSummary.TargetMetric targetMetric(List<TrainingAssessmentRow> rows) {
        if (rows == null || rows.isEmpty()) return null;
        TrainingAssessmentRow first = rows.get(0);
        TrainingAssessmentSummary.TargetMetric metric = new TrainingAssessmentSummary.TargetMetric();
        metric.setMassagistId(first.getMassagistId());
        metric.setMassagistName(first.getMassagistName());
        metric.setShopName(first.getShopName());
        metric.setProjectKey(first.getProjectKey());
        metric.setProjectName(first.getProjectName());
        metric.setAttemptCount(rows.size());
        metric.setFailCount(rows.stream().filter(r -> Integer.valueOf(0).equals(r.getResult())).count());
        metric.setLastAssessDate(rows.stream().map(TrainingAssessmentRow::getAssessDate)
                .filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null));
        return metric;
    }

    private String rate(long numerator, long denominator) {
        if (denominator <= 0) return "0.0%";
        return BigDecimal.valueOf(numerator * 100)
                .divide(BigDecimal.valueOf(denominator), 1, RoundingMode.HALF_UP)
                .toPlainString() + "%";
    }

    private String key(Long massagistId, String projectKey) {
        return String.valueOf(massagistId) + "|" + projectKey;
    }

    private List<TrainingAssessmentRow> safeRows(List<TrainingAssessmentRow> rows) {
        return rows == null ? new ArrayList<>() : rows;
    }

    private List<MassagistTrainingCert> safeCerts(List<MassagistTrainingCert> certs) {
        return certs == null ? new ArrayList<>() : certs;
    }
}
