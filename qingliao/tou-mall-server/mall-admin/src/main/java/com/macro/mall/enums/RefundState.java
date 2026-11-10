package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum RefundState {
    ERROR(-1, "退款失败"),
    DOING(0, "退款进行中"),
    SUCCESS(1, "退款成功"),
    ;
    private Integer value;
    private String label;
}
