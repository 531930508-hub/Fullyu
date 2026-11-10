package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/7/15
 */

@AllArgsConstructor
@Getter
public enum AppointmentType {
    AGENT(1, "Agent预约"),
    HAND(2, "手动预约"),//小程序手动预约
    PHONE(3, "电话预约"),//后台预约的就是电话预约
    PHONE_AGENT(4, "电话Agent预约"),//后台预约的就是电话预约
    ;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (AppointmentType item : AppointmentType.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
