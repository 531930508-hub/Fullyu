package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 调整时长类型
 *
 * @author zkl on 2025/6/16
 */
@AllArgsConstructor
@Getter
public enum AdjustType {
    DECREASE(0, "减少时长"),
    INCREASE(1, "增加时长"),
    ;
    private Integer value;
    private String label;

}
