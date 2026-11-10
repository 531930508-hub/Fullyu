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
public enum IntegrationState {
    INVALID(0, "失效"),
    EFFECTIVE(1, "正常"),
    EXPIRE(2, "已过期"),;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (IntegrationState item : IntegrationState.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
