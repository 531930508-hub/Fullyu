package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.macro.mall.enums.CouponState;
import com.macro.mall.enums.CustomerCouponType;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 客户券
 *
 * @author ST
 * @date 2025/06/03
 */
@Getter
@Setter
@TableName("sms_customer_coupon")
@ApiModel(value = "CustomerCoupon对象", description = "")
public class CustomerCoupon extends BaseEntity {

    @ApiModelProperty("订单id")
    private Long orderId;

    @ApiModelProperty("优惠券id")
    private Long couponId;

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("使用类型：0购买的Full券,1兑换券(暂时不用),2会员卡")
    private Integer useType;

    @ApiModelProperty("")
    private Integer state = CouponState.EFFECTIVE.getValue();

    @ApiModelProperty("有效期起")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate startTime;

    @ApiModelProperty("有效期止(包括当天)")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate endTime;

    @ApiModelProperty("使用的订单id")
    private Long useOrder;

    @ApiModelProperty("使用时间")
    private LocalDateTime useTime;

    private Boolean isCanGift = false;

    @ApiModelProperty("送券申请的id")
    private Long giftCustomerCouponId;

    /**
     * @see CustomerCouponType
     */
    @ApiModelProperty("券类型：0购买的券,1新客赠券,2会员赠券，3普通赠券")
    private Integer type;

    @ApiModelProperty("均价")
    private BigDecimal amount = BigDecimal.ZERO;

    @TableField(exist = false)
    private Coupon coupon;

    @Version
    private Integer version;

    @TableField(exist = false)
    private String code;

    @TableField(exist = false)
    private String typeLabel;

    @TableField(exist = false)
    private String couponTitle;

    @ApiModelProperty("抵扣分钟")
    private Integer minutes;

    private String cardimage;
    private Integer oldData;
    private Integer hebingStatus;
    private Long hebingId;

    @TableField(exist = false)
    private Product product;

    @TableField(exist = false)
    private Integer userCount;//使用的数量

    @TableField(exist = false)
    private Integer allCount;//总共数量

    @TableField(exist = false)
    private List<CustomerCoupon> customerCouponList;//会员卡对应的券

    @TableField(exist = false)
    private boolean displayStatu;//小程序 循环显示的控制
    @TableField(exist = false)
    private String displayStatuName;//小程序 循环显示名字：收起，展开

    private int invoiceState;//是否开票

}
