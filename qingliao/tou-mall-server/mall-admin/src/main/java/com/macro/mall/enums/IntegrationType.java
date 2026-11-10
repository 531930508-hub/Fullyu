package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 积分状态
 *
 * @author jinlong
 * @date 2022/02/17
 */
@AllArgsConstructor
@Getter
public enum IntegrationType {
    SUBTRACT(0, "减"),
    ADD(1, "加"),;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (IntegrationType item : IntegrationType.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
