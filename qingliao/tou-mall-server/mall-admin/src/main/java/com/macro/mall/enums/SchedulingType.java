package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/6/27
 */
@AllArgsConstructor
@Getter
public enum SchedulingType {
    BED(1, "按床位分组查询"),
    MASSAGIST(2, "按疗愈师分组查询");
    private Integer value;
    private String label;
}
