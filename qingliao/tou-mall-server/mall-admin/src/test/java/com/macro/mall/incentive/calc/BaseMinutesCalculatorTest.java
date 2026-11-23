package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.BaseMinutes;
import com.macro.mall.incentive.model.SalaryDetailRow;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 基础薪资折算分钟口径：必须与服务费明细（StatisticsService）一致——接待单要算工时，
 * 并按「排班在岗分钟 × 门店比例」封顶。
 */
class BaseMinutesCalculatorTest {

    private static final long SHOP = 1L;

    @Test
    void receptionRowsAreCountedAndCappedBySchedule() {
        // 服务 300 分钟 × 系数 1.2 = 360；接待 240 分钟 × 系数 0.5 = 120
        List<SalaryDetailRow> rows = Arrays.asList(
                row(0, 120, "1.20", "2026-10-01T10:00:00"),
                row(0, 180, "1.20", "2026-10-02T10:00:00"),
                row(2, 120, "0.50", "2026-10-03T10:00:00"),
                row(2, 120, "0.50", "2026-10-04T10:00:00"));
        // 排班 1200 分钟 × 20% = 240 分钟上限，接待刚好 240，全部计入
        BaseMinutes minutes = BaseMinutesCalculator.calculate(rows,
                scheduleByShop(1200), capByShop(20));

        assertMoney("360.00", minutes.getServiceWeightedMinutes());
        assertMoney("300.00", minutes.getServiceMinutes());
        assertEquals(2, minutes.getServiceOrderCount());
        assertMoney("240.00", minutes.getReceptionMinutes());
        assertMoney("240.00", minutes.getReceptionCountedMinutes());
        assertMoney("120.00", minutes.getReceptionCountedWeightedMinutes());
        assertMoney("0.00", minutes.getReceptionExcessMinutes());
        assertMoney("240.00", minutes.getReceptionCapMinutes());
        assertEquals(2, minutes.getReceptionOrderCount());
        assertMoney("480.00", minutes.countedWeightedMinutes());
    }

    @Test
    void receptionOverCapIsCutByServiceOrder() {
        // 排班 300 分钟 × 20% = 60 分钟上限；两条 120 分钟接待按开始时间先后计入第一条 60 分钟
        List<SalaryDetailRow> rows = Arrays.asList(
                row(2, 120, "0.50", "2026-10-03T10:00:00"),
                row(2, 120, "0.50", "2026-10-04T10:00:00"));
        BaseMinutes minutes = BaseMinutesCalculator.calculate(rows,
                scheduleByShop(300), capByShop(20));

        assertMoney("240.00", minutes.getReceptionMinutes());
        assertMoney("60.00", minutes.getReceptionCountedMinutes());
        assertMoney("30.00", minutes.getReceptionCountedWeightedMinutes());
        assertMoney("180.00", minutes.getReceptionExcessMinutes());
        assertTrue(minutes.getReceptionCapApplied());
    }

    @Test
    void receptionIsNotCappedWhenMassagistHasNoSchedule() {
        List<SalaryDetailRow> rows = Arrays.asList(row(2, 120, "0.50", "2026-10-03T10:00:00"));
        BaseMinutes minutes = BaseMinutesCalculator.calculate(rows,
                new HashMap<>(), capByShop(20));

        assertMoney("120.00", minutes.getReceptionMinutes());
        assertMoney("60.00", minutes.getReceptionCountedWeightedMinutes());
        assertMoney("0.00", minutes.getReceptionExcessMinutes());
        assertFalse(minutes.getReceptionCapApplied());
    }

    @Test
    void missingDetailTypeStillCountsAsServiceForOldRows() {
        SalaryDetailRow legacy = row(0, 90, null, "2026-10-05T10:00:00");
        legacy.setDetailType(null);
        BaseMinutes minutes = BaseMinutesCalculator.calculate(Arrays.asList(legacy),
                scheduleByShop(1200), capByShop(20));

        assertMoney("90.00", minutes.getServiceMinutes());
        assertMoney("90.00", minutes.getServiceWeightedMinutes());
        assertMoney("0.00", minutes.getReceptionMinutes());
    }

    /**
     * 跨店合并额度：两家店都是 20%，各自排班上限 60 / 180，合计 240。
     * 接待集中在 A 店（300 分钟，超过 A 店自己的 60 分钟上限），合并后只按 240 封顶。
     */
    @Test
    void receptionCapIsPooledAcrossShopsWithSamePercent() {
        List<SalaryDetailRow> rows = Arrays.asList(
                row(2, SHOP, 120, "0.50", "2026-10-03T10:00:00"),
                row(2, SHOP, 180, "0.50", "2026-10-04T10:00:00"),
                row(2, 2L, 60, "0.50", "2026-10-05T10:00:00"));
        Map<Long, Integer> schedules = new HashMap<>();
        schedules.put(SHOP, 300);
        schedules.put(2L, 900);
        BaseMinutes minutes = BaseMinutesCalculator.calculate(rows, schedules, capByPercent(20, 20));

        assertTrue(minutes.getReceptionCapApplied());
        assertMoney("240.00", minutes.getReceptionCapMinutes());
        assertMoney("360.00", minutes.getReceptionMinutes());
        assertMoney("240.00", minutes.getReceptionCountedMinutes());
        assertMoney("120.00", minutes.getReceptionCountedWeightedMinutes());
        assertMoney("120.00", minutes.getReceptionExcessMinutes());
    }

    /** 比例不同（20% / 30%）时不合并：A 店超出的 60 分钟不能借用 B 店的额度。 */
    @Test
    void receptionCapIsNotPooledWhenPercentsDiffer() {
        List<SalaryDetailRow> rows = Arrays.asList(
                row(2, SHOP, 120, "0.50", "2026-10-03T10:00:00"),
                row(2, 2L, 60, "0.50", "2026-10-05T10:00:00"));
        Map<Long, Integer> schedules = new HashMap<>();
        schedules.put(SHOP, 300);
        schedules.put(2L, 300);
        BaseMinutes minutes = BaseMinutesCalculator.calculate(rows, schedules, capByPercent(20, 30));

        assertMoney("150.00", minutes.getReceptionCapMinutes());
        assertMoney("60.00", minutes.getReceptionCountedMinutes());
        assertMoney("60.00", minutes.getReceptionExcessMinutes());
    }

    /** 该店当月无排班不封顶，且不参与其它门店的合并池。 */
    @Test
    void shopWithoutScheduleStaysUncappedWhileOthersPool() {
        List<SalaryDetailRow> rows = Arrays.asList(
                row(2, SHOP, 120, "0.50", "2026-10-03T10:00:00"),
                row(2, 2L, 120, "0.50", "2026-10-04T10:00:00"),
                row(2, 3L, 90, "0.50", "2026-10-05T10:00:00"));
        Map<Long, Integer> schedules = new HashMap<>();
        schedules.put(SHOP, 300);
        schedules.put(2L, 300);
        BaseMinutes minutes = BaseMinutesCalculator.calculate(rows, schedules, capByPercent(20, 20, 20));

        // A+B 合并上限 60+60=120，实接待 240 → 计入 120；C 店无排班，90 分钟全额计入
        assertMoney("120.00", minutes.getReceptionCapMinutes());
        assertMoney("210.00", minutes.getReceptionCountedMinutes());
        assertMoney("120.00", minutes.getReceptionExcessMinutes());
    }

    @Test
    void salaryDetailsQueryKeepsReceptionOrders() throws Exception {
        String sql = selectSalaryDetailsSql();
        assertTrue(sql.contains("AS detail_type"),
                "selectSalaryDetails 需要把订单类型透出给 BaseMinutesCalculator，否则接待单会被当成服务单");
        assertFalse(sql.contains("o.type = 0"),
                "selectSalaryDetails 不能过滤 o.type = 0，否则接待单（o.type = 2）整体丢失，激励工时小于服务费明细");
        assertFalse(sql.contains("s_stat_internal_account"),
                "基础薪资工时口径与服务费明细一致，内部员工账号的订单也要计入");
    }

    private static String selectSalaryDetailsSql() throws Exception {
        try (InputStream in = BaseMinutesCalculatorTest.class.getResourceAsStream(
                "/com/macro/mall/incentive/mapper/IncentiveQueryMapper.xml")) {
            assertNotNull(in, "IncentiveQueryMapper.xml 应在测试 classpath 上");
            String xml = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))
                    .lines().collect(Collectors.joining("\n"));
            int start = xml.indexOf("<select id=\"selectSalaryDetails\"");
            assertTrue(start >= 0, "未找到 selectSalaryDetails");
            int end = xml.indexOf("</select>", start);
            return xml.substring(start, end);
        }
    }

    private static SalaryDetailRow row(int orderType, int duration, String coefficient, String start) {
        return row(orderType, SHOP, duration, coefficient, start);
    }

    private static SalaryDetailRow row(int orderType, long shopId, int duration, String coefficient, String start) {
        SalaryDetailRow row = new SalaryDetailRow();
        row.setDetailId(System.nanoTime());
        row.setOrderId(System.nanoTime());
        row.setMassagistId(12L);
        row.setShopId(shopId);
        row.setDetailType(orderType);
        row.setDuration(duration);
        row.setProjectCoefficient(coefficient == null ? null : new BigDecimal(coefficient));
        row.setStartTime(LocalDateTime.parse(start));
        row.setEndTime(LocalDateTime.parse(start).plusMinutes(duration));
        return row;
    }

    private static Map<Long, Integer> scheduleByShop(int minutes) {
        Map<Long, Integer> map = new HashMap<>();
        map.put(SHOP, minutes);
        return map;
    }

    private static Map<Long, Integer> capByShop(int percent) {
        return capByPercent(percent);
    }

    /** 按门店顺序（1、2、3 …）配置比例，配合 {@link #row(int, long, int, String, String)} 里的门店号。 */
    private static Map<Long, Integer> capByPercent(int... percents) {
        Map<Long, Integer> map = new HashMap<>();
        for (int i = 0; i < percents.length; i++) {
            map.put(i == 0 ? SHOP : (long) (i + 1), percents[i]);
        }
        return map;
    }

    private static void assertMoney(String expected, BigDecimal actual) {
        assertNotNull(actual);
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                "expected " + expected + " but was " + actual);
    }
}