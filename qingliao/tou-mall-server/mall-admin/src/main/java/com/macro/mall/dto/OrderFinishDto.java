package com.macro.mall.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.List;

/**
 * 订单完成
 */
@Getter
@Setter
public class OrderFinishDto {
    @ApiModelProperty(value = "订单id")
    private Long orderId;

    @ApiModelProperty("应付金额（实际支付金额）")
    private BigDecimal payAmount;

    @ApiModelProperty("优惠券抵扣金额")
    private BigDecimal couponAmount;

    @ApiModelProperty("积分抵扣金额")
    private BigDecimal integrationAmount;

    @ApiModelProperty("使用优惠券张数")
    private Integer couponSize;

    @ApiModelProperty("使用积分")
    private Integer integration;

    @ApiModelProperty("支付方式：1->支付宝；2->微信")
    private Integer payType;
}
