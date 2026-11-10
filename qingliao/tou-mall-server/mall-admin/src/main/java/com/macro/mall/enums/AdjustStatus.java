package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/6/13
 */
@AllArgsConstructor
@Getter
public enum AdjustStatus {
    WAITING(0, "已失效"),
    DOING(1, "生效中"),
    ;
    private Integer value;
    private String label;
}
