package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 审批人类别
 *
 * @author jinlong
 * @date 2019/7/18 10:30
 */
@Getter
@AllArgsConstructor
public enum FlowUserType {
    CREATE(1, "发起人"),
    APPROVAL(2, "审批人"),
    CC(3, "抄送人"),
    ;
    private Integer value;
    private String label;
}