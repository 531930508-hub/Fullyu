package com.macro.mall.incentive.calc;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrainingCertificationPolicyTest {

    private final TrainingCertificationPolicy policy = new TrainingCertificationPolicy();
    private final LocalDateTime base = LocalDateTime.of(2026, 1, 10, 9, 0);

    private TrainingCertificationPolicy.Vote vote(long trainerId, int result,
                                                   LocalDate assessDate, int minute, long id) {
        return new TrainingCertificationPolicy.Vote(trainerId, result, assessDate,
                base.plusMinutes(minute), id);
    }

    @Test
    void threeDistinctPassingTrainersCertifyWithLatestAssessDate() {
        TrainingCertificationPolicy.Decision decision = policy.evaluate(Arrays.asList(
                vote(11L, 1, LocalDate.of(2026, 1, 2), 1, 1L),
                vote(12L, 1, LocalDate.of(2026, 1, 5), 2, 2L),
                vote(13L, 1, LocalDate.of(2026, 1, 3), 3, 3L)));
        assertTrue(decision.isCertified());
        assertEquals(LocalDate.of(2026, 1, 5), decision.getPassedAt());
        assertEquals(3, decision.getTrainerIds().size());
    }

    @Test
    void duplicateTrainerVotesCountOnce() {
        TrainingCertificationPolicy.Decision decision = policy.evaluate(Arrays.asList(
                vote(11L, 1, LocalDate.of(2026, 1, 2), 1, 1L),
                vote(11L, 1, LocalDate.of(2026, 1, 3), 2, 2L),
                vote(12L, 1, LocalDate.of(2026, 1, 4), 3, 3L)));
        assertFalse(decision.isCertified());
    }

    @Test
    void latestVotePerTrainerWinsEvenIfEarlierWasPass() {
        TrainingCertificationPolicy.Decision decision = policy.evaluate(Arrays.asList(
                vote(11L, 1, LocalDate.of(2026, 1, 2), 1, 1L),
                vote(12L, 1, LocalDate.of(2026, 1, 2), 2, 2L),
                vote(13L, 1, LocalDate.of(2026, 1, 2), 3, 3L),
                // 内训师 11 后改判不通过，最新票生效。
                vote(11L, 0, LocalDate.of(2026, 1, 8), 4, 4L)));
        assertFalse(decision.isCertified());
    }

    @Test
    void onlyFirstThreePassingVotesDeterminePassDate() {
        TrainingCertificationPolicy.Decision decision = policy.evaluate(Arrays.asList(
                vote(11L, 1, LocalDate.of(2026, 1, 1), 1, 1L),
                vote(12L, 1, LocalDate.of(2026, 1, 2), 2, 2L),
                vote(13L, 1, LocalDate.of(2026, 1, 3), 3, 3L),
                // 第四位内训师补记了更晚的日期，不应改变通过日期。
                vote(14L, 1, LocalDate.of(2026, 1, 20), 4, 4L)));
        assertTrue(decision.isCertified());
        assertEquals(LocalDate.of(2026, 1, 3), decision.getPassedAt());
    }

    @Test
    void emptyOrNullVotesNeverCertify() {
        assertFalse(policy.evaluate(null).isCertified());
        assertFalse(policy.evaluate(Collections.emptyList()).isCertified());
    }
}
