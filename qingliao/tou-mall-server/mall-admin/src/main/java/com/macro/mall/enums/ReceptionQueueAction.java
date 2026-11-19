package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 轮牌队列动作
 *
 * @author reception
 * @date 2026/12/08
 */
@AllArgsConstructor
@Getter
public enum ReceptionQueueAction {
    INIT("INIT", "当日初始化"),
    ADD("ADD", "补位"),
    JOIN("JOIN", "调店进店"),
    LEAVE("LEAVE", "退出轮牌"),
    ON_DUTY("ON_DUTY", "值班"),
    OFF_DUTY("OFF_DUTY", "下值班"),
    ASSIGN("ASSIGN", "上钟"),
    REVERT("REVERT", "撤销回位"),
    FINISH("FINISH", "接待完成"),
    GRAB("GRAB", "抢单"),
    RENO("RENO", "重排编号"),
    SWAP("SWAP", "交换顺序"),
    ;
    private final String value;
    private final String label;
}
