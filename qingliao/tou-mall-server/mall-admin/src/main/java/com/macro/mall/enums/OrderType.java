package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 订单类型
 *
 * @author zkl on 2025/6/13
 */
@AllArgsConstructor
@Getter
public enum OrderType {
    PRODUCT(0, "产品订单"),
    COUPON(1, "优惠券订单"),
    RECEPTION(2, "接待订单");
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (OrderType item : OrderType.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
