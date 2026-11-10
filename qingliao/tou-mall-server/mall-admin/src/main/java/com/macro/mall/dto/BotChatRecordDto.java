package com.macro.mall.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * @author HeDaJiang
 * @date 2024/11/7
 */
@Getter
@Setter
public class BotChatRecordDto {

    @ApiModelProperty("问题")
    private String question;

    @ApiModelProperty("答案")
    private String answer;
}
