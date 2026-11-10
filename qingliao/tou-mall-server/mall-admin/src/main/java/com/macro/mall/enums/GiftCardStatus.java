package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/7/11
 */
@AllArgsConstructor
@Getter
public enum GiftCardStatus {
    EXPIRED(0, "已失效"),
    TO_BE_DISTRIBUTED(1, "待发放"),
    TO_BE_RECEIVED(2, "待领取"),
    RECEIVED(3, "已领取"),
    ;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (GiftCardStatus item : GiftCardStatus.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
