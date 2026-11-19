package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 轮牌事项类型
 *
 * @author reception
 * @date 2026/12/08
 */
@AllArgsConstructor
@Getter
public enum ReceptionIssueType {
    DUTY_INTENT(1, "值班意向"),
    NO_DUTY_ASSIGNED(2, "无值班可接待"),
    NOT_ACCEPTED_TIMEOUT(3, "超时未接待"),
    QUEUE_ABNORMAL(4, "轮牌异常"),
    ;
    private final Integer value;
    private final String label;
}
