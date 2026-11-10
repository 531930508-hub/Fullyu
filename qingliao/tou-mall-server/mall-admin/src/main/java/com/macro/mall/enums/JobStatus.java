package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/6/20
 */
@AllArgsConstructor
@Getter
public enum JobStatus {
    QUIT(0, "离职"),
    JOB_ING(1, "在职"),
    PENDING(2, "暂挂"),
    ;
    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (JobStatus item : JobStatus.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
