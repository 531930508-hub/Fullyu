package com.macro.mall.service.serviceStatistics;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.DailyRevenueRow;
import com.macro.mall.dto.OperatingRevenueDto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 经营日报：按经营流水「收入」记录的入账时间（finishTime）分日汇总，区间内无流水的日期补 0。
 * 金额口径与经营流水页一致（核券收入按券面实收、其余按支付金额），不在此扣减退款。
 */
public final class DailyRevenueReport {
    public static final int MAX_DAYS = 366;
    private static final String[] WEEKDAYS = {"星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"};

    private DailyRevenueReport() {
    }

    public static List<DailyRevenueRow> build(List<OperatingRevenueDto> rows, LocalDate start, LocalDate end) {
        if (start == null || end == null) throw new BusinessException("请选择导出的日期区间");
        if (end.isBefore(start)) throw new BusinessException("结束日期不能早于开始日期");
        if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_DAYS)
            throw new BusinessException("日报单次最多导出 " + MAX_DAYS + " 天");

        Map<LocalDate, DailyRevenueRow> days = new LinkedHashMap<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            DailyRevenueRow r = new DailyRevenueRow();
            r.setDate(d.toString());
            r.setWeekday(WEEKDAYS[d.getDayOfWeek().getValue() - 1]);
            r.setIncome(BigDecimal.ZERO);
            r.setCount(0);
            days.put(d, r);
        }
        BigDecimal total = BigDecimal.ZERO;
        int totalCount = 0;
        if (rows != null) {
            for (OperatingRevenueDto row : rows) {
                if (!"收入".equals(row.getType()) || row.getFinishTime() == null) continue;
                DailyRevenueRow day = days.get(row.getFinishTime().toLocalDate());
                if (day == null) continue;
                BigDecimal amount = row.getAmount() == null ? BigDecimal.ZERO : row.getAmount();
                day.setIncome(day.getIncome().add(amount));
                day.setCount(day.getCount() + 1);
                total = total.add(amount);
                totalCount++;
            }
        }
        List<DailyRevenueRow> result = new ArrayList<>(days.values());
        result.forEach(r -> r.setIncome(r.getIncome().setScale(2, RoundingMode.HALF_UP)));
        DailyRevenueRow sum = new DailyRevenueRow();
        sum.setDate("合计");
        sum.setWeekday("");
        sum.setIncome(total.setScale(2, RoundingMode.HALF_UP));
        sum.setCount(totalCount);
        result.add(sum);
        return result;
    }
}
