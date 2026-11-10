package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum AppointmentState {
    WAITING(0, "未到店"),
    DOING(1, "已到店"),
    FINISHED(2, "已完成"),
    CANCELED(3, "已取消"),
    ;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (AppointmentState item : AppointmentState.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
