package com.macro.mall.membercard.calc;

import com.macro.mall.membercard.dto.MemberCardPriceOption;
import lombok.Data;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 会员年卡结算比价引擎。
 *
 * <p>四种优惠互斥、不叠加；默认选中现金最低的一种，同价按
 * 年卡（提前价 &gt; 当日价）→ 通用折扣 → 积分 → 券 的顺序，
 * 避免无谓消耗积分和券。</p>
 *
 * @date 2026/11/07
 */
public final class MemberCardPriceEngine {

    public static final int SOURCE_CARD_ADVANCE = 1;
    public static final int SOURCE_CARD_SAME_DAY = 2;
    public static final int SOURCE_DISCOUNT = 3;
    public static final int SOURCE_POINTS = 4;
    public static final int SOURCE_COUPON = 5;

    private MemberCardPriceEngine() {
    }

    /**
     * 比价输入。
     */
    @Data
    public static class Input {
        private BigDecimal baseAmount = BigDecimal.ZERO;
        private LocalDate appointmentDate;
        private LocalDate today = LocalDate.now();
        private boolean hasActiveCard;
        private BigDecimal advanceRate;
        private BigDecimal sameDayRate;
        /** 通用折扣（含新客折扣）应付金额；无折扣传 null */
        private BigDecimal discountPayAmount;
        private String discountLabel;
        private Long points = 0L;
        private Integer canUseCouponCount = 0;
        private Integer couponCostCount = 0;
    }

    /**
     * 比价结果。
     */
    @Data
    public static class Result {
        private BigDecimal baseAmount = BigDecimal.ZERO;
        private LocalDate appointmentDate;
        private boolean advance;
        private Integer selectedSource;
        private List<MemberCardPriceOption> options = new ArrayList<>();
    }

    public static Result compute(Input input) {
        Result result = new Result();
        BigDecimal base = scale(input.getBaseAmount() == null ? BigDecimal.ZERO : input.getBaseAmount());
        result.setBaseAmount(base);

        LocalDate today = input.getToday() == null ? LocalDate.now() : input.getToday();
        LocalDate serviceDate = input.getAppointmentDate() == null ? today : input.getAppointmentDate();
        result.setAppointmentDate(serviceDate);

        // 以服务开始日期与今天比较：今天约今天为当日价，明天及以后为提前价
        boolean advance = serviceDate.isAfter(today);
        result.setAdvance(advance);

        List<MemberCardPriceOption> options = new ArrayList<>();

        if (input.isHasActiveCard()) {
            if (advance && input.getAdvanceRate() != null) {
                options.add(cardOption(SOURCE_CARD_ADVANCE, base, input.getAdvanceRate(),
                        "年卡提前价（" + discountText(input.getAdvanceRate()) + "）"));
            } else if (!advance && input.getSameDayRate() != null) {
                options.add(cardOption(SOURCE_CARD_SAME_DAY, base, input.getSameDayRate(),
                        "年卡当日价（" + discountText(input.getSameDayRate()) + "）"));
            }
        }

        if (input.getDiscountPayAmount() != null) {
            BigDecimal discountPay = scale(input.getDiscountPayAmount());
            if (discountPay.compareTo(base) < 0) {
                MemberCardPriceOption option = new MemberCardPriceOption();
                option.setSource(SOURCE_DISCOUNT);
                option.setLabel(input.getDiscountLabel() == null || input.getDiscountLabel().isEmpty()
                        ? "通用折扣" : input.getDiscountLabel());
                option.setPayAmount(discountPay);
                option.setBenefitAmount(benefit(base, discountPay));
                options.add(option);
            }
        }

        long points = input.getPoints() == null ? 0L : Math.max(0L, input.getPoints());
        if (points > 0) {
            long pointsCost = Math.min(points, base.setScale(0, RoundingMode.CEILING).longValue());
            BigDecimal pointsPay = base.subtract(BigDecimal.valueOf(pointsCost)).max(BigDecimal.ZERO);
            MemberCardPriceOption option = new MemberCardPriceOption();
            option.setSource(SOURCE_POINTS);
            option.setLabel("积分抵扣（" + pointsCost + "积分）");
            option.setPayAmount(scale(pointsPay));
            option.setBenefitAmount(benefit(base, pointsPay));
            option.setPointsCost(pointsCost);
            options.add(option);
        }

        int couponCost = input.getCouponCostCount() == null ? 0 : input.getCouponCostCount();
        if (couponCost > 0) {
            int canUse = input.getCanUseCouponCount() == null ? 0 : input.getCanUseCouponCount();
            MemberCardPriceOption option = new MemberCardPriceOption();
            option.setSource(SOURCE_COUPON);
            option.setLabel("Full愈券支付（" + couponCost + "张）");
            option.setPayAmount(scale(BigDecimal.ZERO));
            option.setBenefitAmount(benefit(base, BigDecimal.ZERO));
            option.setCouponCost(couponCost);
            if (canUse < couponCost) {
                option.setAvailable(false);
                option.setUnavailableReason("还差 " + (couponCost - canUse) + " 张券");
            }
            options.add(option);
        }

        Integer selected = null;
        for (MemberCardPriceOption option : options) {
            if (!Boolean.TRUE.equals(option.getAvailable())) {
                continue;
            }
            if (selected == null) {
                selected = option.getSource();
                continue;
            }
            MemberCardPriceOption current = find(options, selected);
            int compare = option.getPayAmount().compareTo(current.getPayAmount());
            if (compare < 0 || (compare == 0 && option.getSource() < current.getSource())) {
                selected = option.getSource();
            }
        }
        if (selected != null) {
            find(options, selected).setRecommended(true);
        }

        result.setOptions(options);
        result.setSelectedSource(selected);
        return result;
    }

    private static MemberCardPriceOption cardOption(int source, BigDecimal base, BigDecimal rate, String label) {
        BigDecimal pay = scale(base.multiply(rate));
        MemberCardPriceOption option = new MemberCardPriceOption();
        option.setSource(source);
        option.setLabel(label);
        option.setPayAmount(pay);
        option.setBenefitAmount(benefit(base, pay));
        return option;
    }

    private static MemberCardPriceOption find(List<MemberCardPriceOption> options, int source) {
        for (MemberCardPriceOption option : options) {
            if (option.getSource() == source) {
                return option;
            }
        }
        return null;
    }

    private static BigDecimal benefit(BigDecimal base, BigDecimal pay) {
        BigDecimal value = base.subtract(pay);
        return scale(value.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : value);
    }

    private static BigDecimal scale(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * 0.7800 → "7.8折"
     */
    public static String discountText(BigDecimal rate) {
        if (rate == null) {
            return "";
        }
        return rate.multiply(BigDecimal.TEN).stripTrailingZeros().toPlainString() + "折";
    }
}
