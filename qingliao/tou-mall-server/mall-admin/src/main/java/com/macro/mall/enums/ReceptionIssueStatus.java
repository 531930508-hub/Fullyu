package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 轮牌事项状态
 *
 * @author reception
 * @date 2026/12/08
 */
@AllArgsConstructor
@Getter
public enum ReceptionIssueStatus {
    PENDING(0, "待处理"),
    HANDLED(1, "已处理"),
    EXPIRED(2, "已过期"),
    CANCELED(3, "已取消"),
    ;
    private final Integer value;
    private final String label;
}
