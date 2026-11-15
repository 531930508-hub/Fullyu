package com.macro.mall.crm.brand;

import java.math.BigDecimal;

/**
 * 折扣率 → 展示文案的唯一口径。
 *
 * <p>0.7550 展示为「7.55 折」，0.7500 展示为「7.5 折」；没有折扣率时返回空串，
 * 由页面自行隐藏，不允许落回任何写死的默认折扣。</p>
 */
public final class DiscountText {
    private DiscountText() {
    }

    public static String of(BigDecimal rate) {
        if (rate == null) {
            return "";
        }
        return rate.multiply(BigDecimal.TEN).stripTrailingZeros().toPlainString() + " 折";
    }
}