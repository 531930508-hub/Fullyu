package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 状态
 *
 * @author jinlong
 * @date 2022/02/17
 */
@AllArgsConstructor
@Getter
public enum CouponState {
    INVALID(0, "已使用"),
    EFFECTIVE(1, "未使用"),
    EXPIRE(2, "已过期"),
    GIVE(3, "已赠送"),
    REFUND_CANCEL(4, "退款失效"),
    CANCEL(5, "回收"), //后台手动回收
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
