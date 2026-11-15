package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.CoefficientBand;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 基础薪资阶梯：当月经项目系数折算后的分钟数 × 当前档位单价（元/分钟）。
 *
 * <p>档位左闭右开，达到起点即刻跳档；整月折算分钟乘同一档位单价，不分段累加。
 * 单价限定在 1.00–1.50 元/分钟（1 元起的阶梯），新人合作期单价单独配置，取值 0.80–1.50 元/分钟。</p>
 */
public final class BaseSalaryLadder {

    /** 基础薪资单价下限（元/分钟）。 */
    public static final BigDecimal MIN_UNIT_PRICE = new BigDecimal("1.00");

    /** 基础薪资单价上限（元/分钟）。 */
    public static final BigDecimal MAX_UNIT_PRICE = new BigDecimal("1.50");

    /** 新人合作期单价下限（元/分钟）。 */
    public static final BigDecimal MIN_NEW_PARTNER_UNIT_PRICE = new BigDecimal("0.80");

    /** 新人合作期单价上限（元/分钟）。 */
    public static final BigDecimal MAX_NEW_PARTNER_UNIT_PRICE = new BigDecimal("1.50");

    private static final BigDecimal MINUTES_PER_HOUR = new BigDecimal("60");

    private final List<CoefficientBand> bands;

    private BaseSalaryLadder(List<CoefficientBand> bands) {
        this.bands = bands;
    }

    public static BaseSalaryLadder of(List<CoefficientBand> bands) {
        List<CoefficientBand> sorted = new ArrayList<>();
        if (bands != null) {
            for (CoefficientBand band : bands) {
                if (band != null && band.getCoefficient() != null) {
                    sorted.add(band);
                }
            }
        }
        // 配置的 sort 与起点可能不一致，这里按起点重排，保证取价只依赖档位本身。
        sorted.sort(Comparator.comparingLong(CoefficientBand::getMinMinutes));
        return new BaseSalaryLadder(sorted);
    }

    public List<CoefficientBand> getBands() {
        return bands;
    }

    /**
     * 当前适用单价。新人合作期直接取单独单价，不参与档位累加。
     */
    public BigDecimal unitPriceFor(BigDecimal minutes, boolean newPartner, BigDecimal newPartnerUnitPrice) {
        if (newPartner) {
            return newPartnerUnitPrice == null ? BigDecimal.ONE : newPartnerUnitPrice;
        }
        if (bands.isEmpty()) {
            return BigDecimal.ONE;
        }
        long value = minutesOf(minutes);
        BigDecimal price = bands.get(0).getCoefficient();
        for (CoefficientBand band : bands) {
            if (value >= band.getMinMinutes()) {
                price = band.getCoefficient();
            } else {
                break;
            }
        }
        return price;
    }

    /**
     * 基础薪资 = 折算分钟 × 当前档位单价，金额保留两位小数。
     */
    public BigDecimal amountFor(BigDecimal minutes, boolean newPartner, BigDecimal newPartnerUnitPrice) {
        BigDecimal value = IncentiveMath.nonNegative(minutes);
        if (value.compareTo(BigDecimal.ZERO) <= 0) {
            return IncentiveMath.money(BigDecimal.ZERO);
        }
        return IncentiveMath.money(value.multiply(unitPriceFor(value, newPartner, newPartnerUnitPrice)));
    }

    /**
     * 已达成的最深档位；分钟数不足第一档起点时返回 null。
     */
    public CoefficientBand currentBand(BigDecimal minutes) {
        long value = minutesOf(minutes);
        CoefficientBand current = null;
        for (CoefficientBand band : bands) {
            if (value >= band.getMinMinutes()) {
                current = band;
            } else {
                break;
            }
        }
        return current;
    }

    /**
     * 下一个未达成档位；已达最高档时返回 null。
     */
    public CoefficientBand nextBand(BigDecimal minutes) {
        long value = minutesOf(minutes);
        for (CoefficientBand band : bands) {
            if (value < band.getMinMinutes()) {
                return band;
            }
        }
        return null;
    }

    public static boolean isUnitPriceInRange(BigDecimal unitPrice) {
        return unitPrice != null
                && unitPrice.compareTo(MIN_UNIT_PRICE) >= 0
                && unitPrice.compareTo(MAX_UNIT_PRICE) <= 0;
    }

    public static boolean isNewPartnerUnitPriceInRange(BigDecimal unitPrice) {
        return unitPrice != null
                && unitPrice.compareTo(MIN_NEW_PARTNER_UNIT_PRICE) >= 0
                && unitPrice.compareTo(MAX_NEW_PARTNER_UNIT_PRICE) <= 0;
    }

    /**
     * 元/分钟换算成元/小时，仅用于页面展示。
     */
    public static BigDecimal hourlyFromUnitPrice(BigDecimal unitPrice) {
        if (unitPrice == null) {
            return BigDecimal.ZERO.setScale(IncentiveMath.MONEY_SCALE);
        }
        return unitPrice.multiply(MINUTES_PER_HOUR).setScale(IncentiveMath.MONEY_SCALE, RoundingMode.HALF_UP);
    }

    private static long minutesOf(BigDecimal minutes) {
        if (minutes == null) {
            return 0L;
        }
        return minutes.setScale(0, RoundingMode.DOWN).longValue();
    }
}