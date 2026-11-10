package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.macro.mall.enums.NormalState;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 订单折扣
 *
 * @author
 * @date 2025/07/23
 */
@Getter
@Setter
@TableName("s_order_discount")
@ApiModel(value = "OrderDiscount对象", description = "")
public class OrderDiscount extends BaseEntity {

    @ApiModelProperty("折扣")
    private Integer discount;

    @ApiModelProperty("排序")
    private Integer sequence;

    /**
     * @see NormalState
     */
    @ApiModelProperty("状态：0失效，1正常")
    private Integer state = NormalState.EFFECTIVE.getValue();

    @ApiModelProperty("开始时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @ApiModelProperty("结束时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;

    @ApiModelProperty("创建人")
    private Long createUser;

    @ApiModelProperty("所属门店id")
    private Long shopId;

    @ApiModelProperty("使用限制")
    private String useType;

    @ApiModelProperty("备注")
    private String comment;

    @ApiModelProperty("类型")
    private Integer type;

    @ApiModelProperty("服务时间(分钟)")
    private Integer duration;

}
