package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 券类型：0购买的券,1新客赠券,2会员赠券，3普通赠券
 *
 * @author jinlong
 * @date 2019/7/2 16:47
 */
@Getter
@AllArgsConstructor
public enum CustomerCouponType {
    PAID(0, "购买的券"),// 客户自己买的
    NEW_CUSTOMER(1, "新客赠券"), // （注册就送的）
    VIP(2, "会员赠券"), // （消费后送的）
    NORMAL(3, "普通赠券"), // （后台审批送的）
    GIFT_CARD(4, "礼品卡兑换"), // （后台审批送的）
    ;
    private Integer value;
    private String label;

    public static String valueToLabel(Integer value) {
        if (value == null) {
            return null;
        }
        for (CustomerCouponType t : CustomerCouponType.values()) {
            if (value.equals(t.getValue())) {
                return t.getLabel();
            }
        }
        return null;
    }
}
