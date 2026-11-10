package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/7/18
 */
@AllArgsConstructor
@Getter
public enum SpecifyType {
    MINI(1, "小程序指定技师"),
    PC(2, "PC指定技师"),
    ;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (SpecifyType item : SpecifyType.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
