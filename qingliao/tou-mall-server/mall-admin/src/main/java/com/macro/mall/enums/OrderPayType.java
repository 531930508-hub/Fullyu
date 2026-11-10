package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/6/18
 */
@AllArgsConstructor
@Getter
public enum OrderPayType {
    QR_CODE(0, "二维码支付"),
    WECHAT(1, "微信支付"),
    COUPON(2, "Full愈券"),
    MEITUAN(3, "美团点评"),
    CASH(4, "现金支付");
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (OrderPayType item : OrderPayType.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
