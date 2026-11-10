package com.macro.mall.incentive.calc;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 三人认证计票：每位内训师只看最新一次提交；按提交顺序取最早三个通过票。
 * 通过日期取这三票中最大的考核日期，保证补记不会把认证日推到未来或提前。
 */
public class TrainingCertificationPolicy {

    public static final int REQUIRED_TRAINERS = 3;

    public Decision evaluate(List<Vote> votes) {
        if (votes == null || votes.isEmpty()) {
            return Decision.rejected();
        }
        List<Vote> ordered = new ArrayList<>(votes);
        ordered.sort(Comparator.comparing(Vote::getSubmittedAt).reversed()
                .thenComparing(Vote::getId, Comparator.nullsLast(Comparator.<Long>reverseOrder())));
        Map<Long, Vote> latestByTrainer = new LinkedHashMap<>();
        for (Vote vote : ordered) {
            if (!latestByTrainer.containsKey(vote.getTrainerId())) {
                latestByTrainer.put(vote.getTrainerId(), vote);
            }
        }
        List<Vote> passing = latestByTrainer.values().stream()
                .filter(v -> Integer.valueOf(1).equals(v.getResult()))
                .sorted(Comparator.comparing(Vote::getSubmittedAt)
                        .thenComparing(Vote::getId, Comparator.nullsLast(Comparator.<Long>naturalOrder())))
                .collect(Collectors.toList());
        if (passing.size() < REQUIRED_TRAINERS) {
            return Decision.rejected();
        }
        List<Vote> firstThree = passing.subList(0, REQUIRED_TRAINERS);
        LocalDate passedAt = firstThree.stream().map(Vote::getAssessDate)
                .filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);
        if (passedAt == null) {
            return Decision.rejected();
        }
        return new Decision(true, passedAt,
                firstThree.stream().map(Vote::getTrainerId).collect(Collectors.toList()));
    }

    public static class Vote {
        private final Long trainerId;
        private final Integer result;
        private final LocalDate assessDate;
        private final LocalDateTime submittedAt;
        private final Long id;

        public Vote(Long trainerId, Integer result, LocalDate assessDate,
                    LocalDateTime submittedAt, Long id) {
            this.trainerId = trainerId;
            this.result = result;
            this.assessDate = assessDate;
            this.submittedAt = submittedAt;
            this.id = id;
        }

        public Long getTrainerId() {
            return trainerId;
        }

        public Integer getResult() {
            return result;
        }

        public LocalDate getAssessDate() {
            return assessDate;
        }

        public LocalDateTime getSubmittedAt() {
            return submittedAt;
        }

        public Long getId() {
            return id;
        }
    }

    public static class Decision {
        private final boolean certified;
        private final LocalDate passedAt;
        private final List<Long> trainerIds;

        private Decision(boolean certified, LocalDate passedAt, List<Long> trainerIds) {
            this.certified = certified;
            this.passedAt = passedAt;
            this.trainerIds = trainerIds;
        }

        static Decision rejected() {
            return new Decision(false, null, Collections.emptyList());
        }

        public boolean isCertified() {
            return certified;
        }

        public LocalDate getPassedAt() {
            return passedAt;
        }

        public List<Long> getTrainerIds() {
            return trainerIds;
        }
    }
}
