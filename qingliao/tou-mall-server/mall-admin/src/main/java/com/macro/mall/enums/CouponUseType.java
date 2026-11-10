package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 券类型
 */
@AllArgsConstructor
@Getter
public enum CouponUseType {
    CASH(0, "代金券"),
    VOUCHER(1, "兑换券"),
    VIP(2, "会员卡"),
    ;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (CouponState item : CouponState.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}

