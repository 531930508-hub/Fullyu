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
 * <p>接待封顶按「门店比例」分池：比例相同的门店合并成一个额度池，调店/支援期间可以跨店借用，
 * 比例不同的门店各自成池、互不借用。</p>
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
                result.setReceptionMinutes(result.getReceptionMinutes().add(BigDecimal.valueOf(row.getDuration())));
                result.setReceptionOrderCount(result.getReceptionOrderCount() + 1);
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
        // 按门店比例分池：比例一致的门店共用一个额度池（跨店合并），比例不一致则各店独立成池。
        Map<Integer, List<Long>> poolShopIdsByPercent = new LinkedHashMap<>();
        List<Long> uncappedShopIds = new ArrayList<>();
        for (Long shopId : receptionByShop.keySet()) {
            if (schedules.getOrDefault(shopId, 0) <= 0) {
                // 该门店本月无排班（常见于调店未补排班）：本店接待不封顶；
                // 该疗愈师本月完全没有排班时也走这里，避免排班数据缺失导致工资被清零。
                uncappedShopIds.add(shopId);
                continue;
            }
            poolShopIdsByPercent
                    .computeIfAbsent(percents.getOrDefault(shopId, DEFAULT_RECEPTION_CAP_PERCENT),
                            k -> new ArrayList<>())
                    .add(shopId);
        }
        for (Long shopId : uncappedShopIds) {
            for (SalaryDetailRow row : sortedByStartTime(receptionByShop.get(shopId))) {
                countReception(result, row, row.getDuration());
            }
        }
        for (Map.Entry<Integer, List<Long>> entry : poolShopIdsByPercent.entrySet()) {
            int poolCapMinutes = 0;
            List<SalaryDetailRow> poolRows = new ArrayList<>();
            for (Long shopId : entry.getValue()) {
                poolCapMinutes += capMinutes(schedules.getOrDefault(shopId, 0), entry.getKey());
                poolRows.addAll(receptionByShop.get(shopId));
            }
            result.setReceptionCapApplied(true);
            result.setReceptionCapMinutes(result.getReceptionCapMinutes().add(BigDecimal.valueOf(poolCapMinutes)));
            int remaining = poolCapMinutes;
            int excess = 0;
            for (SalaryDetailRow row : sortedByStartTime(poolRows)) {
                int counted = Math.min(row.getDuration(), Math.max(remaining, 0));
                remaining -= counted;
                excess += row.getDuration() - counted;
                countReception(result, row, counted);
            }
            result.setReceptionExcessMinutes(result.getReceptionExcessMinutes().add(BigDecimal.valueOf(excess)));
        }
        return result;
    }

    /** 接待单按开始时间先后计入；跨店合并后同一时刻的单按门店固定顺序，避免结果抖动。 */
    private static List<SalaryDetailRow> sortedByStartTime(List<SalaryDetailRow> rows) {
        List<SalaryDetailRow> sorted = new ArrayList<>(rows);
        sorted.sort(Comparator.comparing(SalaryDetailRow::getStartTime,
                        Comparator.nullsLast(Comparator.<LocalDateTime>naturalOrder()))
                .thenComparing(row -> row.getShopId() == null ? 0L : row.getShopId()));
        return sorted;
    }

    private static void countReception(BaseMinutes result, SalaryDetailRow row, int counted) {
        result.setReceptionCountedMinutes(result.getReceptionCountedMinutes()
                .add(BigDecimal.valueOf(counted)));
        result.setReceptionCountedWeightedMinutes(result.getReceptionCountedWeightedMinutes()
                .add(weighted(row, counted)));
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