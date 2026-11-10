package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum ServiceState {
    WAITING(0, "未开始"),
    DOING(1, "进行中"),
    FINISHED(2, "已完成"),
    CANCELED(3, "已取消"),
    ;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (ServiceState item : ServiceState.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
