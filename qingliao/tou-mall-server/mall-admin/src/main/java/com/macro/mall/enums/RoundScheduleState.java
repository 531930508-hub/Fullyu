package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * @author zkl on 2025/8/13
 */
@AllArgsConstructor
@Getter
public enum RoundScheduleState {
    EXCHANGE(-1, "交换"),
    INIT(0, "未排班"),
    SCHEDULED(1, "已排班"),
    CANCEL(2, "取消订单-释放排班"),
    UPDATE(3, "修改订单-释放排班"),
    UPDATE_DATE(4, "修改日期-释放排班"),
    CLOSED(5, "已关闭"),
    ;
    private Integer value;
    private String label;
}
