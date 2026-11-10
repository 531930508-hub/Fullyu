package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.macro.mall.enums.GiveGiftState;
import com.macro.mall.serializer.ArrayStringDeSerializer;
import com.macro.mall.serializer.ArrayStringSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 赠送礼物
 *
 * @author ST
 * @date 2025/06/03
 */
@Getter
@Setter
@TableName("sms_give_gift")
@ApiModel(value = "GiveGift对象", description = "")
public class GiveGift extends BaseEntity {

    @ApiModelProperty("标题")
    private String title;

    @ApiModelProperty("图片")
    private String image;

    @ApiModelProperty("订单id")
    private Long orderId;

    @ApiModelProperty("来源客户id")
    private Long customerId;

    /**
     * @see GiveGiftState
     */
    @ApiModelProperty("状态")
    private Integer state = GiveGiftState.DOING.getValue();

    @ApiModelProperty("客户券json")
    @JsonSerialize(using = ArrayStringSerializer.class, nullsUsing = ArrayStringSerializer.class)
    @JsonDeserialize(using = ArrayStringDeSerializer.class)
    private String content;

    @ApiModelProperty("送礼时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime sendTime;

    @JsonIgnore
    private String shareCode;

    @ApiModelProperty("订单编号")
    @TableField(exist = false)
    private String code;

    @ApiModelProperty("支付时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(exist = false)
    private LocalDateTime payTime;

    @ApiModelProperty("订单总金额")
    @TableField(exist = false)
    private BigDecimal totalAmount;


    @ApiModelProperty("订单总金额")
    @TableField(exist = false)
    private String couponName;
}
