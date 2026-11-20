package com.macro.mall.incentive;

import com.macro.mall.incentive.calc.TaxWindow;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 个税累计起算：2026-08 换纳税服务商后，累计只从起算月起算，避免本月一次性补扣 1-7 月的差额。
 */
class TaxWindowTest {

    private static final String START = "2026-08";

    @Test
    void startMonthAppliesOnlyFromConfiguredMonth() {
        // 起算月及之后：按 2026-08 累计
        assertEquals("2026-08", TaxWindow.startMonth("2026-08", START));
        assertEquals("2026-08", TaxWindow.startMonth("2026-11", START));
        // 起算月之前：仍是旧纳税服务商，按当年 1 月
        assertEquals("2026-01", TaxWindow.startMonth("2026-07", START));
        // 跨年：新年度回到 1 月
        assertEquals("2027-01", TaxWindow.startMonth("2027-03", START));
        // 未配置或配置非法：按当年 1 月
        assertEquals("2026-01", TaxWindow.startMonth("2026-11", null));
        assertEquals("2026-01", TaxWindow.startMonth("2026-11", " "));
        assertEquals("2026-01", TaxWindow.startMonth("2026-11", "2026/08"));
    }

    @Test
    void monthsCountFromFirstRecordSinceStart() {
        // 柠萌 Mia 口径：8、9、10 月有记录，11 月为计税第 4 个月
        assertEquals(4, TaxWindow.months(Arrays.asList("2026-08", "2026-09", "2026-10"), "2026-11", START));
    }

    @Test
    void monthsNeverReachBeforeStartMonth() {
        // 历史记录跨到起算月之前时，月数仍从起算月算起
        assertEquals(4, TaxWindow.months(Arrays.asList("2026-05", "2026-06", "2026-08", "2026-09", "2026-10"),
                "2026-11", START));
    }

    @Test
    void gapMonthDoesNotReduceDeductionMonths() {
        // 9 月空缺，仍是 8-11 月 4 个任职月份
        assertEquals(4, TaxWindow.months(Arrays.asList("2026-08", "2026-10"), "2026-11", START));
        // 首个记录晚于起算月：从入职月开始算
        assertEquals(3, TaxWindow.months(Arrays.asList("2026-09", "2026-10"), "2026-11", START));
    }

    @Test
    void noHistoryMeansSingleMonth() {
        assertEquals(1, TaxWindow.months(Collections.emptyList(), "2026-11", START));
        assertEquals(1, TaxWindow.months(null, "2026-11", START));
    }

    @Test
    void monthsAreCappedAtTwelve() {
        assertEquals(12, TaxWindow.months(Arrays.asList("2025-12", "2026-01"), "2026-12", "2026-01"));
    }
}