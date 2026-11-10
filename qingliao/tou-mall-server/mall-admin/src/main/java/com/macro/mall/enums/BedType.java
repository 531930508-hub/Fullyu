package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 调整时长类型
 *
 * @author zkl on 2025/6/16
 */
@AllArgsConstructor
@Getter
public enum BedType {
    WET_AREA(1, "湿区"),
    DRY_AREA(2, "干区"),
    ;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (BedType item : BedType.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }

}
