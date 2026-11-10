package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * coze机器人
 *
 * @author zkl
 * @date 2025/06/13
 */
@Getter
@Setter
@TableName("t_chat_bot")
@ApiModel(value = "ChatBot对象", description = "coze机器人")
public class ChatBot  {


    @TableId(value = "id", type = IdType.AUTO)
    private Integer id;

    private String botId;

    private String secretToken;

    @ApiModelProperty("标题")
    private String title;

    @ApiModelProperty("功能描述")
    private String content;

    private Integer state;

    @ApiModelProperty("分类：0消息回复，1句子拆分")
    private Integer type;

    @ApiModelProperty("应用的品牌：coze")
    private String brand;

    private LocalDateTime createTime;

    private String version;

    @ApiModelProperty("是否需要拆分：0不需要，1需要")
    private Integer needSplit;


}
