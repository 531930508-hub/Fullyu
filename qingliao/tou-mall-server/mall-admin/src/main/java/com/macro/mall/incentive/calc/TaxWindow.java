package com.macro.mall.incentive.calc;

import java.util.Collection;

/**
 * 个税累计窗口。
 *
 * <p>更换纳税服务商后，累计收入与已缴个税要按新服务商重新起算（例如 2026-08 起算，
 * 8-12 月即为该年度计税区间）。若仍按 1 月开始累计，本月个税会把起算月之前少缴的差额
 * 一次性补扣，技师侧看到的就是「本月税特别多」。</p>
 *
 * <p>规则：配置的起算月只对「起算月及之后」的月份生效；查看起算月之前的历史月份、或跨到
 * 下一年时，自动回到当年 1 月，不影响历史看板与新年度的正常累计。</p>
 */
public final class TaxWindow {

    private TaxWindow() {
    }

    /**
     * month 所属计税年度的起算月（yyyy-MM）。
     *
     * @param month           当前结算月份 yyyy-MM
     * @param configuredStart 配置的累计起算月 yyyy-MM，空或非法时按当年 1 月
     */
    public static String startMonth(String month, String configuredStart) {
        String yearStart = month.substring(0, 4) + "-01";
        if (configuredStart == null || !configuredStart.trim().matches("\\d{4}-\\d{2}")) {
            return yearStart;
        }
        String configured = configuredStart.trim();
        if (!configured.substring(0, 4).equals(month.substring(0, 4)) || configured.compareTo(month) > 0) {
            return yearStart;
        }
        return configured.compareTo(yearStart) > 0 ? configured : yearStart;
    }

    /**
     * 计税月数（含本月）。自「起算月」与首个有效月份中较晚者起，按自然月计到本月，最多 12 个月。
     * 中间空月不扣减月数，与 5000 元/月的任职月份口径一致。
     *
     * @param recordMonths 起算月以来已有薪资记录的月份
     */
    public static int months(Collection<String> recordMonths, String month, String startMonth) {
        String first = month;
        if (recordMonths != null) {
            for (String code : recordMonths) {
                if (code != null && code.compareTo(first) < 0) {
                    first = code;
                }
            }
        }
        if (first.compareTo(startMonth) < 0) {
            first = startMonth;
        }
        int months = 0;
        String cursor = first;
        while (cursor.compareTo(month) <= 0 && months < 12) {
            months++;
            cursor = IncentiveMath.shiftMonth(cursor, 1).toString();
        }
        return Math.max(months, 1);
    }
}