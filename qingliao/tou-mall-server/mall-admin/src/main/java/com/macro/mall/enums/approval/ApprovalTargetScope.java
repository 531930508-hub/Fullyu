package com.macro.mall.enums.approval;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 审批岗位身份的作用范围。
 *
 * @author Full愈
 * @date 2026/11/09
 */
@Getter
@AllArgsConstructor
public enum ApprovalTargetScope {
    SHOP("SHOP", "本店"),
    ALL("ALL", "全部门店"),
    ;

    private final String code;
    private final String label;

    public static ApprovalTargetScope of(String code) {
        if (code == null || code.trim().isEmpty()) return SHOP;
        for (ApprovalTargetScope value : values()) {
            if (value.code.equalsIgnoreCase(code.trim())) return value;
        }
        return null;
    }
}
