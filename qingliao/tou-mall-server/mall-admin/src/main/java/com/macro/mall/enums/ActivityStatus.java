package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/7/10
 */
@AllArgsConstructor
@Getter
public enum ActivityStatus {
    WAITING(0, "已禁用"),
    DOING(1, "启用中"),
    ;
    private Integer value;
    private String label;
}
