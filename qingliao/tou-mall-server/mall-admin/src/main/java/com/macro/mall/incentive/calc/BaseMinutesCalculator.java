package com.macro.mall.incentive.calc;

import com.macro.mall.enums.OrderType;
import com.macro.mall.incentive.model.BaseMinutes;
import com.macro.mall.incentive.model.SalaryDetailRow;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 基础薪资折算分钟的计算口径：服务单按项目系数折算，接待单按排班时长比例封顶后折算，
 * 与薪资统计（服务时长）口径保持一致。订单是否计入只看是否有效完成，与客户是否留手机无关。
 */
public final class BaseMinutesCalculator {

    /** 门店未配置时的接待工时上限占比。 */
    public static final int DEFAULT_RECEPTION_CAP_PERCENT = 20;

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private BaseMinutesCalculator() {
    }

    /**
     * @param rows                   该疗愈师本月（截止日）有效订单明细
     * @param scheduleMinutesByShop  该疗愈师在该窗口内的排班分钟，key 为门店
     * @param capPercentByShop       门店接待工时上限百分比，未配置的门店按默认值
     */
    public static BaseMinutes calculate(List<SalaryDetailRow> rows,
                                        Map<Long, Integer> scheduleMinutesByShop,
                                        Map<Long, Integer> capPercentByShop) {
        BaseMinutes result = new BaseMinutes();
        if (rows == null || rows.isEmpty()) {
            return result;
        }
        List<SalaryDetailRow> serviceRows = new ArrayList<>();
        Map<Long, List<SalaryDetailRow>> receptionByShop = new LinkedHashMap<>();
        for (SalaryDetailRow row : rows) {
            if (row == null || row.getDuration() == null || row.getDuration() <= 0) {
                continue;
            }
            if (OrderType.RECEPTION.getValue().equals(row.getDetailType())) {
                receptionByShop
                        .computeIfAbsent(row.getShopId() == null ? 0L : row.getShopId(),
                                k -> new ArrayList<>())
                        .add(row);
            } else {
                serviceRows.add(row);
            }
        }

        for (SalaryDetailRow row : serviceRows) {
            result.setServiceMinutes(result.getServiceMinutes().add(BigDecimal.valueOf(row.getDuration())));
            result.setServiceWeightedMinutes(result.getServiceWeightedMinutes().add(weighted(row, row.getDuration())));
            result.setServiceOrderCount(result.getServiceOrderCount() + 1);
        }

        if (receptionByShop.isEmpty()) {
            return result;
        }
        Map<Long, Integer> schedules = scheduleMinutesByShop == null
                ? new LinkedHashMap<>() : scheduleMinutesByShop;
        Map<Long, Integer> percents = capPercentByShop == null
                ? new LinkedHashMap<>() : capPercentByShop;
        boolean hasSchedule = receptionByShop.keySet().stream()
                .anyMatch(shopId -> schedules.getOrDefault(shopId, 0) > 0);
        for (Map.Entry<Long, List<SalaryDetailRow>> entry : receptionByShop.entrySet()) {
            List<SalaryDetailRow> shopRows = new ArrayList<>(entry.getValue());
            shopRows.sort(Comparator.comparing(SalaryDetailRow::getStartTime,
                    Comparator.nullsLast(Comparator.<LocalDateTime>naturalOrder())));
            int duration = 0;
            int excess = 0;
            for (SalaryDetailRow row : shopRows) {
                duration += row.getDuration();
            }
            if (!hasSchedule) {
                // 该疗愈师本月完全没有排班：不封顶，避免排班数据缺失导致工资被清零。
                for (SalaryDetailRow row : shopRows) {
                    result.setReceptionCountedMinutes(result.getReceptionCountedMinutes()
                            .add(BigDecimal.valueOf(row.getDuration())));
                    result.setReceptionCountedWeightedMinutes(result.getReceptionCountedWeightedMinutes()
                            .add(weighted(row, row.getDuration())));
                    result.setReceptionOrderCount(result.getReceptionOrderCount() + 1);
                }
                result.setReceptionMinutes(result.getReceptionMinutes().add(BigDecimal.valueOf(duration)));
                continue;
            }
            int scheduledMinutes = schedules.getOrDefault(entry.getKey(), 0);
            // 该门店本月无排班（常见于调店未补排班）：本店接待不封顶。
            int remaining = scheduledMinutes <= 0
                    ? Integer.MAX_VALUE
                    : capMinutes(scheduledMinutes, percents.getOrDefault(entry.getKey(),
                    DEFAULT_RECEPTION_CAP_PERCENT));
            if (scheduledMinutes > 0) {
                result.setReceptionCapApplied(true);
                result.setReceptionCapMinutes(result.getReceptionCapMinutes().add(BigDecimal.valueOf(remaining)));
            }
            for (SalaryDetailRow row : shopRows) {
                int counted = Math.min(row.getDuration(), Math.max(remaining, 0));
                int missed = row.getDuration() - counted;
                remaining -= counted;
                excess += missed;
                result.setReceptionCountedMinutes(result.getReceptionCountedMinutes()
                        .add(BigDecimal.valueOf(counted)));
                result.setReceptionCountedWeightedMinutes(result.getReceptionCountedWeightedMinutes()
                        .add(weighted(row, counted)));
                result.setReceptionOrderCount(result.getReceptionOrderCount() + 1);
            }
            result.setReceptionMinutes(result.getReceptionMinutes().add(BigDecimal.valueOf(duration)));
            result.setReceptionExcessMinutes(result.getReceptionExcessMinutes().add(BigDecimal.valueOf(excess)));
        }
        return result;
    }

    private static int capMinutes(int scheduledMinutes, int percent) {
        return BigDecimal.valueOf(scheduledMinutes)
                .multiply(BigDecimal.valueOf(percent))
                .divide(HUNDRED, 0, RoundingMode.DOWN)
                .intValue();
    }

    private static BigDecimal weighted(SalaryDetailRow row, int minutes) {
        BigDecimal coefficient = row.getProjectCoefficient() == null
                ? BigDecimal.ONE : row.getProjectCoefficient();
        return coefficient.multiply(BigDecimal.valueOf(minutes))
                .setScale(IncentiveMath.MONEY_SCALE, RoundingMode.HALF_UP);
    }
}