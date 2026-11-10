package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 疗愈师评分
 *
 * @author ST
 * @date 2025/06/04
 */
@Getter
@Setter
@TableName("s_massagist_rate")
@ApiModel(value = "MassagistRate对象", description = "")
public class MassagistRate extends BaseEntity {

    @ApiModelProperty("订单id")
    private Long orderId;

    @ApiModelProperty("产品id")
    private Long massagistId;

    @ApiModelProperty("评分")
    private BigDecimal rating;

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("评价内容")
    private String comment;

    @ApiModelProperty("低星反馈关联审批，不改变原评分")
    private Long approvalId;

    @ApiModelProperty("低星反馈处理状态，沿用审批状态；空表示无需跟进")
    private Integer reviewState;

    @ApiModelProperty("服务印象")
    private int serviceScore;

    @ApiModelProperty("技师印象")
    private int peopleScore;

    @ApiModelProperty("技师姓名")
    @TableField(exist = false)
    private String massagistName;

}
