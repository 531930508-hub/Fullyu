package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 扣子对话记录
 *
 * @author zkl
 * @date 2025/06/13
 */
@Getter
@Setter
@TableName("t_bot_chat_record")
@ApiModel(value = "BotChatRecord对象", description = "扣子对话记录")
public class BotChatRecord  {


    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @ApiModelProperty("扣子的botid")
    private String botId;

    @ApiModelProperty("扣子会话id")
    private String conversationId;

    @ApiModelProperty("扣子对话id")
    private String chatId;

    @ApiModelProperty("状态：0对话未完成，1对话已完成")
    private Integer state;

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("问题")
    private String question;

    @ApiModelProperty("答案")
    private String answer;

    private String botVersion;

    private LocalDateTime createTime;

    private Long shopId;

    @ApiModelProperty("语音文件地址")
    private String fileUrl;

    @ApiModelProperty("语音文件时长（秒）")
    private Integer voiceDuration;
    
    private Long orderId;

    @TableField(exist = false)
    private String agentParams;


}
