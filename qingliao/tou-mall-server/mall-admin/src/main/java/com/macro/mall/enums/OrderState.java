package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 订单状态：0未付款，1已付款未评价，2已付款已评价，3超时，4取消，5退款中，6已退款
 */
@AllArgsConstructor
@Getter
public enum OrderState {
    NOT_PAY(0, "未付款"),
    PAID_NOT_COMMENT(1, "已付款未评价"),
    PAID_COMMENTED(2, "已付款已评价"),
    TIMEOUT(3, "已超时"),
    CANCELED(4, "已取消"),
    APPROVAL_REFUNDING(7, "退款审批中"),
    REFUNDING(5, "汇付退款中"),
    REFUNDED(6, "汇付已退款"),
    ;

    private Integer value;
    private String label;

    public static String getLabel(Integer value) {
        for (OrderState item : OrderState.values()) {
            if (item.getValue().equals(value)) {
                return item.getLabel();
            }
        }
        return null;
    }
}
