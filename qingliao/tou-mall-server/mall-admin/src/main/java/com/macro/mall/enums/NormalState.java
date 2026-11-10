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
public enum NormalState {
    INVALID(0, "失效"),
    EFFECTIVE(1, "正常");
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (NormalState item : NormalState.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
