package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 审批状态
 *
 * @author jinlong
 * @date 2019/7/2 16:47
 */
@Getter
@AllArgsConstructor
public enum FlowState {
    REJECTED(0, "已驳回"),
    NOT_SUBMIT(1, "未提交"),
    APPROVING(2, "审批中"),
    PASSED(3, "已通过"),
    WITHDRAW(4, "已撤回"),
    SKIPPED(5, "已跳过"),
    ;
    private Integer value;
    private String label;

    public static String getDescByCode(Integer code) {
        for (FlowState value : FlowState.values()) {
            if (value.value.equals(code)) {
                return value.label;
            }
        }
        return null;
    }
}
