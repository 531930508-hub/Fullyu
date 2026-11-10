package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

@AllArgsConstructor
@Getter
public enum GiveGiftState {
    DOING(0, "待领取"),
    FINISHED(1, "已领取"),
    TIMEOUT(2, "已超时"),
    CANCELED(3, "已取消"),
    NO_SEND(-1, "未赠送"),
    ;

    private Integer value;
    private String label;
}
