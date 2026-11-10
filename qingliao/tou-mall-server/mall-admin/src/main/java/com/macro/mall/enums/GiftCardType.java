package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/7/11
 */
@AllArgsConstructor
@Getter
public enum GiftCardType {
    OFFLINE(1, "线下礼品卡"),
    MALL(2, "商场礼品卡"),
    ;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (GiftCardType item : GiftCardType.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
