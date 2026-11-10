package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.TrainingOrder;
import com.macro.mall.incentive.model.TrainingProgress;
import com.macro.mall.incentive.model.TrainingProjectRule;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrainingCalculatorTest {

    private static final Long MASSAGIST = 11L;
    private final TrainingCalculator calculator = new TrainingCalculator();

    @Test
    void countsFromDayAfterPassAndEarnsInCompletionMonth() {
        TrainingProjectRule project = sujin("头部", "头部", 3, "500");
        List<TrainingOrder> orders = orders(
                "2026-02-03", "2026-02-04", "2026-02-05", "2026-02-06");

        TrainingProgress progress = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 2, 3), orders, "2026-02", LocalDate.of(2026, 2, 28));

        assertEquals(LocalDate.of(2026, 2, 4), progress.getStartDate());
        assertEquals(3, progress.getRawCount());
        assertEquals(3, progress.getCount());
        assertEquals(LocalDate.of(2026, 2, 6), progress.getCompletionDate());
        assertEquals("2026-02", progress.getCompletionMonth());
        assertEquals(TrainingCalculator.STATUS_COMPLETED_THIS_MONTH, progress.getStatus());
        assertMoney("500.00", progress.getEarnedAmount());
    }

    @Test
    void oneShortDoesNotEarnAndExactTargetDoes() {
        TrainingProjectRule project = sujin("头部", "头部", 3, "500");
        List<TrainingOrder> orders = orders("2026-02-04", "2026-02-05");

        TrainingProgress active = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 2, 3), orders, "2026-02", LocalDate.of(2026, 2, 28));
        assertEquals(TrainingCalculator.STATUS_ACTIVE, active.getStatus());
        assertEquals(1, active.getRemaining());
        assertNull(active.getCompletionDate());
        assertMoney("0.00", active.getEarnedAmount());

        orders.add(order("2026-02-06", "头部"));
        TrainingProgress completed = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 2, 3), orders, "2026-02", LocalDate.of(2026, 2, 28));
        assertEquals(TrainingCalculator.STATUS_COMPLETED_THIS_MONTH, completed.getStatus());
        assertMoney("500.00", completed.getEarnedAmount());
    }

    @Test
    void monthEndIsIncludedAndNextMonthIsExcluded() {
        TrainingProjectRule project = sujin("头部", "头部", 2, "500");
        List<TrainingOrder> orders = orders("2026-10-31", "2026-11-01");

        TrainingProgress october = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 9, 30), orders, "2026-10", LocalDate.of(2026, 10, 31));
        assertEquals(1, october.getRawCount());
        assertEquals(TrainingCalculator.STATUS_ACTIVE, october.getStatus());

        TrainingProgress november = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 9, 30), orders, "2026-11", LocalDate.of(2026, 11, 30));
        assertEquals(2, november.getRawCount());
        assertEquals(LocalDate.of(2026, 11, 1), november.getCompletionDate());
        assertMoney("500.00", november.getEarnedAmount());
    }

    @Test
    void historicalCompletionIsNotRepeatedLater() {
        TrainingProjectRule project = sujin("头部", "头部", 3, "500");
        List<TrainingOrder> orders = orders("2026-08-01", "2026-08-02", "2026-08-03");

        TrainingProgress august = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 7, 31), orders, "2026-08", LocalDate.of(2026, 8, 31));
        assertMoney("500.00", august.getEarnedAmount());

        TrainingProgress september = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 7, 31), orders, "2026-09", LocalDate.of(2026, 9, 30));
        assertEquals(TrainingCalculator.STATUS_COMPLETED, september.getStatus());
        assertMoney("0.00", september.getEarnedAmount());
    }

    @Test
    void eachProjectKeepsIndependentTargetAndAmount() {
        TrainingProjectRule head = sujin("头部", "头部", 2, "700");
        TrainingProjectRule face = sujin("面部", "面部", 3, "300");
        List<TrainingOrder> orders = new ArrayList<>();
        orders.add(order("2026-02-04", "头部"));
        orders.add(order("2026-02-05", "头部"));
        orders.add(order("2026-02-04", "面部"));
        orders.add(order("2026-02-05", "面部"));

        TrainingProgress headProgress = calculator.calculate(MASSAGIST, head, 1L,
                LocalDate.of(2026, 2, 3), orders, "2026-02", LocalDate.of(2026, 2, 28));
        TrainingProgress faceProgress = calculator.calculate(MASSAGIST, face, 2L,
                LocalDate.of(2026, 2, 3), orders, "2026-02", LocalDate.of(2026, 2, 28));

        assertMoney("700.00", headProgress.getEarnedAmount());
        assertEquals(TrainingCalculator.STATUS_ACTIVE, faceProgress.getStatus());
        assertMoney("0.00", faceProgress.getEarnedAmount());
    }

    @Test
    void uncertifiedProjectNeverAccumulates() {
        TrainingProjectRule project = sujin("手部", "手部", 1, "500");
        List<TrainingOrder> orders = orders("2026-02-04");

        TrainingProgress progress = calculator.calculate(MASSAGIST, project, null,
                null, orders, "2026-02", LocalDate.of(2026, 2, 28));

        assertEquals(TrainingCalculator.STATUS_UNCERTIFIED, progress.getStatus());
        assertEquals(0, progress.getCount());
        assertEquals(0, progress.getRawCount());
        assertMoney("0.00", progress.getEarnedAmount());
    }

    @Test
    void changingPassDateRecalculatesSameOrders() {
        TrainingProjectRule project = sujin("头部", "头部", 2, "500");
        List<TrainingOrder> orders = orders("2026-02-01", "2026-02-05", "2026-02-09");

        TrainingProgress early = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 2, 4), orders, "2026-02", LocalDate.of(2026, 2, 28));
        assertEquals(2, early.getRawCount());
        assertEquals(TrainingCalculator.STATUS_COMPLETED_THIS_MONTH, early.getStatus());

        TrainingProgress late = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 2, 8), orders, "2026-02", LocalDate.of(2026, 2, 28));
        assertEquals(1, late.getRawCount());
        assertEquals(TrainingCalculator.STATUS_ACTIVE, late.getStatus());
        assertMoney("0.00", late.getEarnedAmount());
    }

    @Test
    void cutoffBeforeTargetDoesNotEarnPrematurely() {
        TrainingProjectRule project = sujin("肩部", "肩部", 5, "500");
        List<TrainingOrder> orders = new ArrayList<>();
        for (String date : Arrays.asList(
                "2026-09-10", "2026-09-26", "2026-09-30",
                "2026-10-05", "2026-10-12", "2026-10-18")) {
            orders.add(order(date, "肩部"));
        }

        TrainingProgress before = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 9, 25), orders, "2026-10", LocalDate.of(2026, 10, 17));
        assertEquals(TrainingCalculator.STATUS_ACTIVE, before.getStatus());
        assertEquals(4, before.getCount());
        assertMoney("0.00", before.getEarnedAmount());

        TrainingProgress reached = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 9, 25), orders, "2026-10", LocalDate.of(2026, 10, 18));
        assertEquals(TrainingCalculator.STATUS_COMPLETED_THIS_MONTH, reached.getStatus());
        assertEquals(LocalDate.of(2026, 10, 18), reached.getCompletionDate());
        assertMoney("500.00", reached.getEarnedAmount());
    }

    @Test
    void passTodayIsUpcomingUntilNextDay() {
        TrainingProjectRule project = sujin("头部", "头部", 1, "500");
        List<TrainingOrder> orders = orders("2026-10-21", "2026-10-22");

        TrainingProgress progress = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 10, 21), orders, "2026-10", LocalDate.of(2026, 10, 21));

        assertEquals(LocalDate.of(2026, 10, 22), progress.getStartDate());
        assertEquals(TrainingCalculator.STATUS_UPCOMING, progress.getStatus());
        assertEquals(0, progress.getCount());
    }

    @Test
    void duplicateOrderDetailIsCountedOnceButSameDayOrdersAreSeparate() {
        TrainingProjectRule project = sujin("头部", "头部", 2, "500");
        TrainingOrder first = order("2026-02-04", "头部");
        first.setOrderId(100L);
        TrainingOrder duplicated = order("2026-02-04", "头部");
        duplicated.setOrderId(100L);
        TrainingOrder second = order("2026-02-04", "头部");
        second.setOrderId(101L);

        TrainingProgress progress = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 2, 3), Arrays.asList(first, duplicated, second),
                "2026-02", LocalDate.of(2026, 2, 28));

        assertEquals(2, progress.getRawCount());
        assertEquals(TrainingCalculator.STATUS_COMPLETED_THIS_MONTH, progress.getStatus());
    }

    @Test
    void headSpaMatchesDurationAndSujinMatchesPartAlias() {
        TrainingProjectRule spa60 = headSpa("60", 60);
        TrainingOrder sixty = order("2026-02-04", null);
        sixty.setProjectId(1L);
        sixty.setDuration(60);
        TrainingOrder ninety = order("2026-02-05", null);
        ninety.setProjectId(1L);
        ninety.setDuration(90);

        assertTrue(calculator.matches(spa60, sixty));
        assertFalse(calculator.matches(spa60, ninety));

        TrainingProjectRule shoulder = sujin("肩部", "肩部", 1, "500");
        shoulder.setAliases("肩颈,肩膀");
        TrainingOrder aliasOrder = order("2026-02-04", "肩颈");
        TrainingOrder otherPart = order("2026-02-05", "头部");
        assertTrue(calculator.matches(shoulder, aliasOrder));
        assertFalse(calculator.matches(shoulder, otherPart));
    }

    @Test
    void projectIdMismatchNeverCounts() {
        TrainingProjectRule project = sujin("头部", "头部", 1, "500");
        TrainingOrder order = order("2026-02-04", "头部");
        order.setProjectId(99L);

        TrainingProgress progress = calculator.calculate(MASSAGIST, project, 1L,
                LocalDate.of(2026, 2, 3), Arrays.asList(order),
                "2026-02", LocalDate.of(2026, 2, 28));

        assertEquals(0, progress.getRawCount());
        assertEquals(TrainingCalculator.STATUS_ACTIVE, progress.getStatus());
    }

    private TrainingProjectRule sujin(String name, String part, int target, String amount) {
        TrainingProjectRule project = new TrainingProjectRule();
        project.setProjectKey("sujin-" + name);
        project.setProjectGroup("全感舒筋");
        project.setProjectName(name);
        project.setProjectId(2L);
        project.setPartName(part);
        project.setTargetCount(target);
        project.setAmount(new BigDecimal(amount));
        project.setEnabled(true);
        return project;
    }

    private TrainingProjectRule headSpa(String name, int duration) {
        TrainingProjectRule project = new TrainingProjectRule();
        project.setProjectKey("headspa-" + duration);
        project.setProjectGroup("头部水疗");
        project.setProjectName(name + " 分钟");
        project.setProjectId(1L);
        project.setDurationMinutes(duration);
        project.setTargetCount(1);
        project.setAmount(new BigDecimal("500"));
        project.setEnabled(true);
        return project;
    }

    private TrainingOrder order(String date, String part) {
        TrainingOrder order = new TrainingOrder();
        order.setOrderId(null);
        order.setMassagistId(MASSAGIST);
        order.setShopId(1L);
        order.setProjectId(2L);
        order.setProjectTitle("全感舒筋");
        order.setServiceDate(LocalDate.parse(date));
        order.setParts(part);
        return order;
    }

    private List<TrainingOrder> orders(String... dates) {
        List<TrainingOrder> result = new ArrayList<>();
        for (String date : dates) {
            result.add(order(date, "头部"));
        }
        return result;
    }

    private void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }
}
