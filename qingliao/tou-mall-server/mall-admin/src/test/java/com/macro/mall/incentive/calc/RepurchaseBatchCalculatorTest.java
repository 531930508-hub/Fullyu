package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.CustomerVisit;
import com.macro.mall.incentive.model.IncentiveRule;
import com.macro.mall.incentive.model.RepurchaseMetrics;
import com.macro.mall.incentive.model.RepurchaseTier;
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

class RepurchaseBatchCalculatorTest {

    private static final Long TARGET = 1L;
    private static final Long OTHER = 2L;
    private static final Long SHOP = 1L;
    private final RepurchaseBatchCalculator calculator = new RepurchaseBatchCalculator();

    @Test
    void combinesRetentionTierTenDayWeightsAndCrossMonthAttribution() {
        RepurchaseMetrics metrics = calculator.calculate(TARGET, ledger(), null, rule(3),
                "2026-10", LocalDate.of(2026, 11, 30));

        assertEquals(3, metrics.getRetentionSample());
        assertEquals(2, metrics.getRetainedVisits());
        assertMoney("66.67", metrics.getRetentionRate());
        assertTrue(metrics.getRetentionEligible());

        assertEquals(3, metrics.getNewCustomerCount());
        assertTrue(metrics.getConversionSampleSufficient());
        assertMoney("66.67", metrics.getConversionRate());
        assertMoney("20", metrics.getTierRate());
        assertMoney("1500.00", metrics.getTierPotentialAmount());
        assertMoney("1500.00", metrics.getAppliedTierAmount());

        assertEquals(4, metrics.getTenDayHeadCount());
        assertMoney("3.50", metrics.getTenDayWeightedHeads());
        assertMoney("60.00", metrics.getTenDayPotentialAmount());
        assertMoney("60.00", metrics.getAppliedTenDayAmount());
        assertMoney("50.00", metrics.getTenDayNextPrice());
        assertMoney("30.00", metrics.getTenDayRecords().get(3).getAmount());
        assertMoney("30.00", metrics.getTenDayRecords().get(3).getUnitPrice());

        assertMoney("1560.00", metrics.getPotentialAmount());
        assertMoney("1560.00", metrics.getTotalAmount());
    }

    @Test
    void retentionGateBlocksBothRewardsButKeepsPotentialVisible() {
        List<CustomerVisit> visits = ledger();
        // 去掉 B 的 60 天内再访，A 仍有再访、C 本来就没有 → 3 次到店仅 1 次留存 = 33.33%
        removeNextVisit(visits, "13800000002", LocalDate.of(2026, 9, 6));

        RepurchaseMetrics metrics = calculator.calculate(TARGET, visits, null, rule(3),
                "2026-10", LocalDate.of(2026, 11, 30));

        assertFalse(metrics.getRetentionEligible());
        assertMoney("33.33", metrics.getRetentionRate());
        assertMoney("1500.00", metrics.getTierPotentialAmount());
        assertMoney("0.00", metrics.getAppliedTierAmount());
        // 留存是两类复购奖励的共同前提：未达标时 10 天奖励同样不发放，仅保留潜在金额展示
        assertMoney("60.00", metrics.getTenDayPotentialAmount());
        assertMoney("0.00", metrics.getAppliedTenDayAmount());
        assertMoney("1560.00", metrics.getPotentialAmount());
        assertMoney("0.00", metrics.getTotalAmount());
    }

    @Test
    void smallNewSampleOnlyBlocksThirtyDayTier() {
        RepurchaseMetrics metrics = calculator.calculate(TARGET, ledger(), null, rule(4),
                "2026-10", LocalDate.of(2026, 11, 30));

        assertEquals(3, metrics.getNewCustomerCount());
        assertFalse(metrics.getConversionSampleSufficient());
        assertMoney("20", metrics.getTierRate());
        assertMoney("0.00", metrics.getTierPotentialAmount());
        assertMoney("0.00", metrics.getAppliedTierAmount());
        assertMoney("60.00", metrics.getAppliedTenDayAmount());
        assertMoney("60.00", metrics.getTotalAmount());
    }

    @Test
    void exactlySixtyPercentRetentionQualifies() {
        IncentiveRule rule = rule(3);
        List<CustomerVisit> visits = new ArrayList<>();
        LocalDate january = LocalDate.of(2026, 1, 1);
        String a = "13900000001";
        // A 窗口内 3 次到店，前两次 60 天内都有再访，最后一次没有 → 2/3。
        visits.add(visit(a, january, TARGET, SHOP));
        visits.add(visit(a, LocalDate.of(2026, 8, 1), TARGET, SHOP));
        visits.add(visit(a, LocalDate.of(2026, 8, 10), TARGET, SHOP));
        visits.add(visit(a, LocalDate.of(2026, 8, 20), TARGET, SHOP));
        String b = "13900000002";
        // B 窗口内 2 次到店，8/2 之后 8/25 再访，8/25 之后无再访 → 1/2。
        visits.add(visit(b, january, TARGET, SHOP));
        visits.add(visit(b, LocalDate.of(2026, 8, 2), TARGET, SHOP));
        visits.add(visit(b, LocalDate.of(2026, 8, 25), TARGET, SHOP));

        RepurchaseMetrics metrics = calculator.calculate(TARGET, visits, null, rule,
                "2026-10", LocalDate.of(2026, 11, 30));

        assertEquals(5, metrics.getRetentionSample());
        assertEquals(3, metrics.getRetainedVisits());
        assertMoney("60.00", metrics.getRetentionRate());
        assertTrue(metrics.getRetentionEligible());
    }

    @Test
    void dataCutoffBeforeSecondVisitDoesNotCreateTenDayRecord() {
        List<CustomerVisit> visits = ledger();

        RepurchaseMetrics metrics = calculator.calculate(TARGET, visits, null, rule(3),
                "2026-10", LocalDate.of(2026, 10, 31));

        assertEquals(3, metrics.getTenDayHeadCount());
        assertMoney("30.00", metrics.getTenDayPotentialAmount());
        assertMoney("30.00", metrics.getTenDayNextPrice());
    }

    @Test
    void secondVisitByAnotherPartnerStillCounts() {
        RepurchaseMetrics metrics = calculator.calculate(TARGET, ledger(), null, rule(3),
                "2026-10", LocalDate.of(2026, 11, 30));
        // N1 和 N3 的二次到店由 OTHER 完成，仍计入新客 30 天复购。
        assertMoney("66.67", metrics.getConversionRate());
    }

    @Test
    void firstVisitSharedByTwoPartnersGetsHalfWeight() {
        RepurchaseMetrics metrics = calculator.calculate(TARGET, ledger(), null, rule(3),
                "2026-10", LocalDate.of(2026, 11, 30));
        assertEquals(4, metrics.getTenDayHeadCount());
        assertMoney("3.50", metrics.getTenDayWeightedHeads());
        assertMoney("0.50", metrics.getTenDayRecords().get(2).getWeight());
        assertMoney("20.00", metrics.getTenDayRecords().get(2).getUnitPrice());
        assertMoney("10.00", metrics.getTenDayRecords().get(2).getAmount());
    }

    @Test
    void shopScopeOnlyAttributesFirstVisitsAndRetentionAtThatShop() {
        Long otherShop = 2L;
        List<CustomerVisit> visits = new ArrayList<>();
        String oldPhone = "13700000001";
        visits.add(visit(oldPhone, LocalDate.of(2026, 1, 1), TARGET, otherShop));
        // 8 月老客到店中，只有本店那次进入分母；次日跨店到店仍算留存。
        visits.add(visit(oldPhone, LocalDate.of(2026, 8, 5), TARGET, otherShop));
        visits.add(visit(oldPhone, LocalDate.of(2026, 8, 6), TARGET, SHOP));
        visits.add(visit(oldPhone, LocalDate.of(2026, 8, 20), OTHER, otherShop));

        String otherShopNew = "13700000002";
        visits.add(visit(otherShopNew, LocalDate.of(2026, 9, 1), TARGET, otherShop));
        visits.add(visit(otherShopNew, LocalDate.of(2026, 9, 10), OTHER, SHOP));

        String ownShopNew = "13700000003";
        visits.add(visit(ownShopNew, LocalDate.of(2026, 9, 2), TARGET, SHOP));
        visits.add(visit(ownShopNew, LocalDate.of(2026, 9, 20), OTHER, otherShop));

        visits.add(visit("13700000004", LocalDate.of(2026, 10, 1), TARGET, otherShop));
        visits.add(visit("13700000004", LocalDate.of(2026, 10, 4), OTHER, SHOP));
        visits.add(visit("13700000005", LocalDate.of(2026, 10, 2), TARGET, SHOP));
        visits.add(visit("13700000005", LocalDate.of(2026, 10, 6), OTHER, otherShop));

        RepurchaseMetrics metrics = calculator.calculate(TARGET, SHOP, visits, null, rule(1),
                "2026-10", LocalDate.of(2026, 11, 30));

        assertEquals(1, metrics.getRetentionSample());
        assertEquals(1, metrics.getRetainedVisits());
        assertTrue(metrics.getRetentionEligible());
        assertEquals(1, metrics.getNewCustomerCount());
        assertMoney("100.00", metrics.getConversionRate());
        assertEquals(1, metrics.getTenDayHeadCount());
        assertMoney("10.00", metrics.getTenDayPotentialAmount());
    }

    @Test
    void retentionCountsEveryQualifyingVisitAsOnePersonTime() {
        List<CustomerVisit> visits = new ArrayList<>();
        String phone = "13600000001";
        visits.add(visit(phone, LocalDate.of(2026, 1, 1), TARGET, SHOP));
        // 老客 8 月连来 4 次：前三次之后 60 天内都有再访，最后一次没有，按人次应为 3/4。
        visits.add(visit(phone, LocalDate.of(2026, 8, 1), TARGET, SHOP));
        visits.add(visit(phone, LocalDate.of(2026, 8, 10), TARGET, SHOP));
        visits.add(visit(phone, LocalDate.of(2026, 8, 20), TARGET, SHOP));
        visits.add(visit(phone, LocalDate.of(2026, 8, 30), TARGET, SHOP));

        RepurchaseMetrics metrics = calculator.calculate(TARGET, visits, null, rule(3),
                "2026-10", LocalDate.of(2026, 11, 30));

        assertEquals(4, metrics.getRetentionSample());
        assertEquals(3, metrics.getRetainedVisits());
        assertMoney("75.00", metrics.getRetentionRate());
        assertTrue(metrics.getRetentionEligible());
    }

    @Test
    void retentionMergesSplitOrdersOnSameDayIntoOneVisit() {
        List<CustomerVisit> visits = new ArrayList<>();
        String phone = "13600000003";
        visits.add(visit(phone, LocalDate.of(2026, 1, 1), TARGET, SHOP));
        // 8/1 拆成两单，只算一次到店；否则分母会虚高、留存率被稀释。
        visits.add(visit(phone, LocalDate.of(2026, 8, 1), TARGET, SHOP));
        visits.add(visit(phone, LocalDate.of(2026, 8, 1), TARGET, SHOP));
        visits.add(visit(phone, LocalDate.of(2026, 8, 10), TARGET, SHOP));

        RepurchaseMetrics metrics = calculator.calculate(TARGET, visits, null, rule(3),
                "2026-10", LocalDate.of(2026, 11, 30));

        assertEquals(2, metrics.getRetentionSample());
        assertEquals(1, metrics.getRetainedVisits());
        assertMoney("50.00", metrics.getRetentionRate());
    }

    @Test
    void retentionSkipsVisitsWithoutSixtyDayObservation() {
        List<CustomerVisit> visits = new ArrayList<>();
        String phone = "13600000002";
        visits.add(visit(phone, LocalDate.of(2026, 1, 1), TARGET, SHOP));
        visits.add(visit(phone, LocalDate.of(2026, 8, 20), TARGET, SHOP));
        visits.add(visit(phone, LocalDate.of(2026, 8, 25), TARGET, SHOP));

        // 截止 9/1 时 8 月的到店还不满 60 天，应整体剔出分母，避免当月看板“月底补涨”。
        RepurchaseMetrics metrics = calculator.calculate(TARGET, visits, null, rule(3),
                "2026-10", LocalDate.of(2026, 9, 1));

        assertEquals(0, metrics.getRetentionSample());
        assertNull(metrics.getRetentionRate());
        assertFalse(metrics.getRetentionEligible());
    }

    @Test
    void retentionNeedsMinimumVisitSample() {
        IncentiveRule rule = rule(3);
        rule.setMinRetentionSample(30);

        RepurchaseMetrics metrics = calculator.calculate(TARGET, ledger(), null, rule,
                "2026-10", LocalDate.of(2026, 11, 30));

        assertEquals(3, metrics.getRetentionSample());
        assertMoney("66.67", metrics.getRetentionRate());
        assertFalse(metrics.getRetentionEligible());
        assertMoney("0.00", metrics.getAppliedTierAmount());
        assertMoney("0.00", metrics.getAppliedTenDayAmount());
    }

    @Test
    void historicalTenDayCountsSecondVisitInFollowingMonth() {
        RepurchaseMetrics metrics = calculator.calculate(TARGET, null, ledger(), null, rule(3),
                "2026-10", LocalDate.of(2026, 10, 31), LocalDate.of(2026, 11, 10));

        // O4 10/30 首单、11/3 二刷，按“次月仍归首单月”应计入 10 月。
        assertEquals(4, metrics.getTenDayHeadCount());
        assertMoney("3.50", metrics.getTenDayWeightedHeads());
        assertMoney("60.00", metrics.getTenDayPotentialAmount());
        assertMoney("50.00", metrics.getTenDayNextPrice());
    }

    @Test
    void emptyLedgerReturnsNoSampleInsteadOfQualifying() {
        RepurchaseMetrics metrics = calculator.calculate(TARGET, new ArrayList<>(), null, rule(3),
                "2026-10", LocalDate.of(2026, 11, 30));

        assertFalse(metrics.getRetentionEligible());
        assertEquals(0, metrics.getRetentionSample());
        assertNull(metrics.getRetentionRate());
        assertEquals(0, metrics.getNewCustomerCount());
        assertNull(metrics.getConversionRate());
        assertMoney("0.00", metrics.getTotalAmount());
    }

    private IncentiveRule rule(int minNewSample) {
        IncentiveRule rule = new IncentiveRule();
        rule.setRetentionThreshold(new BigDecimal("60"));
        rule.setRetentionMonths(1);
        // 留存窗口结束月 = 当前月往前 2 个月（2026-10 对应 2026-08），与补录数据一致
        rule.setRetentionEndOffset(2);
        rule.setConversionMonths(1);
        rule.setConversionEndOffset(1);
        rule.setConversionDays(30);
        rule.setTenDayDays(10);
        rule.setMinNewSample(minNewSample);
        // 单测数据量小，默认 30 老客门槛会在每条用例里挡住合格判定，单独用 retentionNeedsMinimumCustomerSample 覆盖
        rule.setMinRetentionSample(1);
        rule.setTiers(Arrays.asList(
                new RepurchaseTier(new BigDecimal("10"), new BigDecimal("200")),
                new RepurchaseTier(new BigDecimal("20"), new BigDecimal("1500"))));
        rule.setFibA1(new BigDecimal("10"));
        rule.setFibA2(new BigDecimal("10"));
        rule.setFibCap(new BigDecimal("130"));
        return rule;
    }

    /**
     * 老客 A/B 各在 8 月到店一次，并在 9 月初再次到店（窗口外，不增加分母）；C 没有；
     * 按人次分母 3、留存 2。
     * 新客 N1/N2/N3 在 9 月首单，N1、N3 在 30 天内二刷（N3 跨月）。
     * 10 月首单 O1/O2 完整归属，O3 由两位伙伴共同服务（0.5），O4 次月二刷仍归 10 月。
     */
    private List<CustomerVisit> ledger() {
        List<CustomerVisit> visits = new ArrayList<>();
        String a = "13800000001";
        String b = "13800000002";
        String c = "13800000003";
        String n1 = "13800000011";
        String n2 = "13800000012";
        String n3 = "13800000013";
        String o1 = "13800000021";
        String o2 = "13800000022";
        String o3 = "13800000023";
        String o4 = "13800000024";

        visits.add(visit(a, LocalDate.of(2026, 1, 1), TARGET, SHOP));
        visits.add(visit(b, LocalDate.of(2026, 1, 2), TARGET, SHOP));
        visits.add(visit(c, LocalDate.of(2026, 1, 3), TARGET, SHOP));

        visits.add(visit(a, LocalDate.of(2026, 8, 5), TARGET, SHOP));
        visits.add(visit(a, LocalDate.of(2026, 9, 5), OTHER, SHOP));
        visits.add(visit(b, LocalDate.of(2026, 8, 6), TARGET, SHOP));
        visits.add(visit(b, LocalDate.of(2026, 9, 6), OTHER, SHOP));
        visits.add(visit(c, LocalDate.of(2026, 8, 7), TARGET, SHOP));

        visits.add(visit(n1, LocalDate.of(2026, 9, 1), TARGET, SHOP));
        visits.add(visit(n1, LocalDate.of(2026, 9, 20), OTHER, SHOP));
        visits.add(visit(n2, LocalDate.of(2026, 9, 2), TARGET, SHOP));
        visits.add(visit(n3, LocalDate.of(2026, 9, 3), TARGET, SHOP));
        visits.add(visit(n3, LocalDate.of(2026, 10, 2), OTHER, SHOP));

        visits.add(visit(o1, LocalDate.of(2026, 10, 1), TARGET, SHOP));
        visits.add(visit(o1, LocalDate.of(2026, 10, 5), OTHER, SHOP));
        visits.add(visit(o2, LocalDate.of(2026, 10, 2), TARGET, SHOP));
        visits.add(visit(o2, LocalDate.of(2026, 10, 6), OTHER, SHOP));
        visits.add(visit(o3, LocalDate.of(2026, 10, 3), TARGET, SHOP));
        visits.add(visit(o3, LocalDate.of(2026, 10, 3), OTHER, SHOP));
        visits.add(visit(o3, LocalDate.of(2026, 10, 8), OTHER, SHOP));
        visits.add(visit(o4, LocalDate.of(2026, 10, 30), TARGET, SHOP));
        visits.add(visit(o4, LocalDate.of(2026, 11, 3), OTHER, SHOP));
        return visits;
    }

    private void removeNextVisit(List<CustomerVisit> visits, String phone, LocalDate date) {
        visits.removeIf(v -> phone.equals(v.getPhone())
                && date.equals(v.getServiceDate())
                && !TARGET.equals(v.getMassagistId()));
    }

    private CustomerVisit visit(String phone, LocalDate date, Long massagistId, Long shopId) {
        return new CustomerVisit(phone, date, massagistId, shopId);
    }

    private void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }
}
