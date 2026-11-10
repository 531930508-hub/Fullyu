package com.macro.mall.incentive.calc;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 激励计算的公共精度、月份和数列工具。
 *
 * <p>金额统一保留两位小数并使用 HALF_UP；税前收入按整数元 HALF_UP。
 * 比例展示保留两位小数，但资格判断必须使用未四舍五入的分子分母。</p>
 */
public final class IncentiveMath {

    public static final int MONEY_SCALE = 2;
    public static final RoundingMode MONEY_ROUNDING = RoundingMode.HALF_UP;
    public static final BigDecimal HUNDRED = new BigDecimal("100");

    private static final Pattern MONTH_PATTERN = Pattern.compile("^\\d{4}-(0[1-9]|1[0-2])$");

    private IncentiveMath() {
    }

    public static BigDecimal money(BigDecimal value) {
        return value == null ? BigDecimal.ZERO.setScale(MONEY_SCALE) : value.setScale(MONEY_SCALE, MONEY_ROUNDING);
    }

    public static BigDecimal money(double value) {
        return BigDecimal.valueOf(value).setScale(MONEY_SCALE, MONEY_ROUNDING);
    }

    public static BigDecimal sum(BigDecimal... values) {
        BigDecimal total = BigDecimal.ZERO;
        if (values != null) {
            for (BigDecimal value : values) {
                if (value != null) {
                    total = total.add(value);
                }
            }
        }
        return money(total);
    }

    /**
     * 展示比例，返回百分数值（例如 60.00 表示 60%）。
     */
    public static BigDecimal percent(BigDecimal numerator, BigDecimal denominator) {
        if (numerator == null || denominator == null || denominator.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO.setScale(MONEY_SCALE);
        }
        return numerator.multiply(HUNDRED)
                .divide(denominator, MONEY_SCALE, MONEY_ROUNDING);
    }

    public static boolean ratioAtLeast(BigDecimal numerator, BigDecimal denominator, BigDecimal thresholdPercent) {
        if (numerator == null || denominator == null || thresholdPercent == null
                || denominator.compareTo(BigDecimal.ZERO) <= 0) {
            return false;
        }
        return numerator.multiply(HUNDRED)
                .compareTo(thresholdPercent.multiply(denominator)) >= 0;
    }

    public static YearMonth parseMonth(String month) {
        if (month == null || !MONTH_PATTERN.matcher(month).matches()) {
            throw new IllegalArgumentException("月份格式须为 yyyy-MM");
        }
        try {
            return YearMonth.parse(month);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("月份格式须为 yyyy-MM", e);
        }
    }

    public static void requireMonth(String month) {
        parseMonth(month);
    }

    public static String normalizeMonth(String month) {
        return parseMonth(month).toString();
    }

    public static String currentMonth() {
        return YearMonth.now().toString();
    }

    public static LocalDate monthStart(String month) {
        return parseMonth(month).atDay(1);
    }

    public static LocalDate monthEnd(String month) {
        return parseMonth(month).atEndOfMonth();
    }

    public static YearMonth shiftMonth(String month, int delta) {
        return parseMonth(month).plusMonths(delta);
    }

    /**
     * 历史月份取月末；当前及未来月份最多取到 asOf，避免未来数据。
     */
    public static LocalDate cutoff(String month, LocalDate asOf) {
        LocalDate end = monthEnd(month);
        if (asOf == null) {
            return end;
        }
        return asOf.isBefore(end) ? asOf : end;
    }

    public static LocalDate dataThrough(LocalDate asOf) {
        return asOf == null ? LocalDate.now() : asOf;
    }

    /**
     * 生成 n 个斐波那契单价（单位元）。第 1、2 位取种子，之后每位取前两位之和与 cap 的较小值。
     */
    public static List<BigDecimal> sequence(int count, BigDecimal a1, BigDecimal a2, BigDecimal cap) {
        if (count <= 0) {
            return new ArrayList<>();
        }
        BigDecimal first = money(a1 == null ? BigDecimal.ZERO : a1);
        BigDecimal second = money(a2 == null ? first : a2);
        BigDecimal ceiling = money(cap == null ? BigDecimal.valueOf(Long.MAX_VALUE) : cap);
        List<BigDecimal> prices = new ArrayList<>(count);
        BigDecimal previous2 = first;
        BigDecimal previous1 = second;
        for (int i = 0; i < count; i++) {
            BigDecimal raw;
            if (i == 0) {
                raw = first;
            } else if (i == 1) {
                raw = second;
            } else {
                raw = previous2.add(previous1).min(ceiling);
                previous2 = previous1;
                previous1 = raw;
            }
            prices.add(raw.min(ceiling));
        }
        return prices;
    }

    /**
     * 按权重计算 10 天复购金额；权重只乘单价，不改变整数顺位。
     */
    public static BigDecimal fibonacciAmount(List<BigDecimal> weights, BigDecimal a1, BigDecimal a2, BigDecimal cap) {
        if (weights == null || weights.isEmpty()) {
            return BigDecimal.ZERO.setScale(MONEY_SCALE);
        }
        List<BigDecimal> prices = sequence(weights.size() + 1, a1, a2, cap);
        BigDecimal total = BigDecimal.ZERO;
        for (int i = 0; i < weights.size(); i++) {
            BigDecimal weight = weights.get(i) == null ? BigDecimal.ZERO : weights.get(i);
            total = total.add(weight.multiply(prices.get(i)));
        }
        return money(total);
    }

    public static BigDecimal nextFibonacciPrice(int ordinal, BigDecimal a1, BigDecimal a2, BigDecimal cap) {
        List<BigDecimal> prices = sequence(ordinal + 1, a1, a2, cap);
        return prices.isEmpty() ? BigDecimal.ZERO.setScale(MONEY_SCALE) : prices.get(ordinal);
    }

    public static BigDecimal ceil(BigDecimal value) {
        if (value == null || value.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO.setScale(0);
        }
        return value.setScale(0, RoundingMode.CEILING);
    }

    public static BigDecimal nonNegative(BigDecimal value) {
        if (value == null || value.compareTo(BigDecimal.ZERO) < 0) {
            return BigDecimal.ZERO;
        }
        return value;
    }

    /**
     * 手机号脱敏，仅用于展示和排序后的明细，不用于计价。
     */
    public static String maskPhone(String phone) {
        if (phone == null || phone.trim().isEmpty()) {
            return "";
        }
        String value = phone.trim();
        if (value.length() < 7) {
            return value.length() <= 2 ? "**" : value.charAt(0) + "****";
        }
        return value.substring(0, 3) + "****" + value.substring(value.length() - 4);
    }
}
