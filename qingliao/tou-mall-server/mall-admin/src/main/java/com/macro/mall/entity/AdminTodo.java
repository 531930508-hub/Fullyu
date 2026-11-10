package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 门店待办（后台首页悬浮卡）。
 *
 * @date 2026/11/07
 */
@Getter
@Setter
@TableName("c_admin_todo")
@ApiModel(value = "AdminTodo对象", description = "门店待办")
public class AdminTodo extends BaseEntity {

    public static final int STATUS_PENDING = 0;
    public static final int STATUS_DONE = 1;

    @ApiModelProperty("门店id")
    private Long shopId;

    @ApiModelProperty("待办内容")
    private String content;

    @ApiModelProperty("0待完成 1已完成")
    private Integer status;

    @ApiModelProperty("创建人id")
    private Long creatorId;

    @ApiModelProperty("创建人姓名")
    private String creatorName;

    @ApiModelProperty("完成人id")
    private Long completeId;

    @ApiModelProperty("完成人姓名")
    private String completeName;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("完成时间")
    private LocalDateTime completeTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(value = "update_time", fill = FieldFill.UPDATE)
    @ApiModelProperty(hidden = true)
    private LocalDateTime updateTime;

    @TableField(exist = false)
    @ApiModelProperty("是否逾期未完成")
    private Boolean overdue;

    @TableField(exist = false)
    @ApiModelProperty("创建时间文案")
    private String createTimeText;

    @TableField(exist = false)
    @ApiModelProperty("完成时间文案")
    private String completeTimeText;
}
