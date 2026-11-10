package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum RefundType {
    CANCEL(0, "取消"),
    REFUND(1, "退款"),
    ;
    private Integer value;
    private String label;
}
