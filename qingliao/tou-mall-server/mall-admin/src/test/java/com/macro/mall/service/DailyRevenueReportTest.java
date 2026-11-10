package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.DailyRevenueRow;
import com.macro.mall.dto.OperatingRevenueDto;
import com.macro.mall.service.serviceStatistics.DailyRevenueReport;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class DailyRevenueReportTest {

    private OperatingRevenueDto row(String type, String amount, LocalDateTime finish) {
        OperatingRevenueDto d = new OperatingRevenueDto();
        d.setType(type);
        d.setAmount(amount == null ? null : new BigDecimal(amount));
        d.setFinishTime(finish);
        return d;
    }

    @Test
    void groupsIncomeByFinishDateAndFillsMissingDaysWithZero() {
        List<OperatingRevenueDto> rows = Arrays.asList(
                row("收入", "100.50", LocalDateTime.of(2026, 11, 2, 10, 0)),
                row("收入", "49.50", LocalDateTime.of(2026, 11, 2, 23, 59)),
                row("收入", "88", LocalDateTime.of(2026, 11, 4, 9, 0)));

        List<DailyRevenueRow> report = DailyRevenueReport.build(rows, LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 4));

        assertEquals(4, report.size(), "3 天 + 合计行");
        assertEquals("2026-11-02", report.get(0).getDate());
        assertEquals("星期一", report.get(0).getWeekday());
        assertEquals(0, new BigDecimal("150.00").compareTo(report.get(0).getIncome()));
        assertEquals(2, report.get(0).getCount());
        assertEquals("2026-11-03", report.get(1).getDate());
        assertEquals("星期二", report.get(1).getWeekday());
        assertEquals(0, BigDecimal.ZERO.compareTo(report.get(1).getIncome()));
        assertEquals(0, report.get(1).getCount());
        assertEquals("合计", report.get(3).getDate());
        assertEquals(0, new BigDecimal("238.00").compareTo(report.get(3).getIncome()));
        assertEquals(3, report.get(3).getCount());
    }

    @Test
    void ignoresExpenseRowsRowsOutsideRangeAndRowsWithoutFinishTime() {
        List<OperatingRevenueDto> rows = Arrays.asList(
                row("支出", "30", LocalDateTime.of(2026, 11, 2, 10, 0)),
                row("收入", "20", LocalDateTime.of(2026, 11, 1, 23, 59)),
                row("收入", "20", null),
                row("收入", null, LocalDateTime.of(2026, 11, 2, 12, 0)));

        List<DailyRevenueRow> report = DailyRevenueReport.build(rows, LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 2));

        assertEquals(0, BigDecimal.ZERO.compareTo(report.get(0).getIncome()));
        assertEquals(1, report.get(0).getCount(), "金额为空的收入记录仍计 1 笔、按 0 元");
    }

    @Test
    void rejectsReversedOrOverlongRange() {
        assertThrows(BusinessException.class, () -> DailyRevenueReport.build(Collections.emptyList(),
                LocalDate.of(2026, 11, 5), LocalDate.of(2026, 11, 4)));
        assertThrows(BusinessException.class, () -> DailyRevenueReport.build(Collections.emptyList(),
                LocalDate.of(2025, 1, 1), LocalDate.of(2026, 1, 2)));
    }
}
