package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 轮牌事项：需要人处理、有生命周期的轮牌问题。
 *
 * <p>技师点了值班但当下排不上、或者前台把单排给了休息区的人，
 * 都在这里留一条，带截止时间，过期自动失效，事后可追。</p>
 *
 * @author reception
 * @date 2026/12/08
 */
@Getter
@Setter
@TableName("s_reception_issue")
@ApiModel(value = "ReceptionIssue对象", description = "轮牌事项")
public class ReceptionIssue extends BaseEntity {

    @ApiModelProperty("业务日期")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate issueDate;

    @ApiModelProperty("门店id")
    private Long shopId;

    @ApiModelProperty("疗愈师id")
    private Long massagistId;

    /**
     * @see com.macro.mall.enums.ReceptionIssueType
     */
    @ApiModelProperty("类型 1值班意向 2无值班可接待 3超时未接待 4轮牌异常")
    private Integer type;

    /**
     * @see com.macro.mall.enums.ReceptionIssueStatus
     */
    @ApiModelProperty("状态 0待处理 1已处理 2已过期 3已取消")
    private Integer status;

    @ApiModelProperty("关联订单详情id")
    private Long detailId;

    @ApiModelProperty("截止时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime deadline;

    @ApiModelProperty("处理时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime handledTime;

    @ApiModelProperty("处理人")
    private String handlerName;

    @ApiModelProperty("说明")
    private String remark;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(value = "update_time", fill = FieldFill.UPDATE)
    @ApiModelProperty(hidden = true)
    private LocalDateTime updateTime;

}
