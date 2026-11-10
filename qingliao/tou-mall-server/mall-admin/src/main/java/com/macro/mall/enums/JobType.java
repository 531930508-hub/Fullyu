package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/9/23
 */
@AllArgsConstructor
@Getter
public enum JobType {
    TRIAL(0, "试用"),
    FORMAL(1, "正式"),
    ;
    private Integer value;
    private String label;
}
