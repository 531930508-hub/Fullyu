package com.macro.mall.enums.approval;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 审批节点通过方式。
 *
 * @author Full愈
 * @date 2026/11/09
 */
@Getter
@AllArgsConstructor
public enum ApprovalNodeMode {
    ANY("ANY", "或签"),
    ALL("ALL", "会签"),
    ;

    private final String code;
    private final String label;

    public static ApprovalNodeMode of(String code) {
        if (code == null || code.trim().isEmpty()) return ANY;
        for (ApprovalNodeMode value : values()) {
            if (value.code.equalsIgnoreCase(code.trim())) return value;
        }
        return null;
    }
}
