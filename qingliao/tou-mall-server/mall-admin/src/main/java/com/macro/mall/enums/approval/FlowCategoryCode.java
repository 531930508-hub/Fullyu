package com.macro.mall.enums.approval;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 审批分类code
 *
 * @author zkl
 * @date 2022/01/13
 */
@AllArgsConstructor
@Getter
public enum FlowCategoryCode {
    REFUND("refund", "退款"),
    GIFT_COUPON("giftCoupon", "送券"),
    ASK_FOR_LEAVE("askForLeave", "请假"),
    LOW_RATING("lowRating", "低星服务反馈"),
    ;
    private String code;
    private String desc;
}
