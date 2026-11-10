package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.macro.mall.consts.NormalConst;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 礼品卡表
 *
 * @author zkl
 * @date 2025/07/10
 */
@Getter
@Setter
@TableName("s_gift_card")
@ApiModel(value = "GiftCard对象", description = "礼品卡表")
public class GiftCard extends BaseEntity {

    @ApiModelProperty("活动id")
    private Long activityId;

    @ApiModelProperty("店铺id")
    private Long shopId;

    @ApiModelProperty("新增卡数")
    @TableField(exist = false)
    private Integer cardCount;

    @ApiModelProperty("礼品卡code码（全局唯一，大小写+数字10位）")
    private String code;

    @ApiModelProperty("全局唯一，大小写+数字8位")
    private String password;

    @ApiModelProperty("优惠券id")
    private Long couponId = NormalConst.GIVE_COUPON_ID;

    @ApiModelProperty("可兑换券数量")
    private Integer number;

    @ApiModelProperty("兑换券的有效期(天数)")
    private Integer validDate;

    @ApiModelProperty("面值")
    private BigDecimal amount = BigDecimal.ZERO;

    /**
     * @see com.macro.mall.enums.GiftCardStatus
     */
    @ApiModelProperty("状态0已失效1待发放2待领取3已领取")
    private Integer status;

    /**
     * @see com.macro.mall.enums.GiftCardType
     */
    @ApiModelProperty("1线下礼品卡2商场礼品卡")
    private Integer type;

    @ApiModelProperty("发放时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime distributionTime;

    @ApiModelProperty("发放人")
    private Long distributionUser;

    @ApiModelProperty("领取时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime receiveTime;

    @ApiModelProperty("失效时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime failureTime;

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("客户信息")
    @TableField(exist = false)
    private Customer customer;

    @ApiModelProperty("使用限制")
    private String limitations;

    @ApiModelProperty("创建人")
    private Long createUser;

}
