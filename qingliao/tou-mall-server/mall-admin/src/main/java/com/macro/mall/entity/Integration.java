package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.macro.mall.enums.NormalState;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

/**
 * 积分
 *
 * @author ST
 * @date 2025/06/04
 */
@Getter
@Setter
@TableName("s_integration")
@ApiModel(value = "Integration对象", description = "")
public class Integration extends BaseEntity {

    @ApiModelProperty("类型：0减，1加")
    private Integer type;

    @ApiModelProperty("积分")
    private Long score;

    @ApiModelProperty("订单id")
    private Long orderId;

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("备注")
    private String comment;

    @ApiModelProperty("分类：1拉新赠送")
    private Long categoryId;

    @ApiModelProperty("新客户id下发拉新积分时设置")
    private Long newCustomerId;

    @ApiModelProperty("积分状态")
    private Integer state = NormalState.EFFECTIVE.getValue();

    @ApiModelProperty("积分可用")
    private Long normalScore;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @ApiModelProperty("积分过期时间")
    private LocalDate endTime;

    @ApiModelProperty("使用的积分归属明细")
    private String useMap;

    @ApiModelProperty("小程序检索已使用和过期积分用")
    @TableField(exist = false)
    private long statemini;
}
