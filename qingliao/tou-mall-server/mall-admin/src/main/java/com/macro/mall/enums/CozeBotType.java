package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 扣子机器人分类
 *
 * @author HeDaJiang
 * @date 2025/6/13
 */
@AllArgsConstructor
@Getter
public enum CozeBotType {
    REPLY_MESSAGE(0, "消息回复"),
    SPLIT_WORD(1, "句子拆分"),
    ;
    private Integer value;
    private String label;
}
