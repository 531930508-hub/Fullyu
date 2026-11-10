package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 礼品卡预收台账：发放记正向（面值），作废已发放未领取的卡记负向；同一张卡同一事件只记一次。
 * 领取兑券不再记账（预收在发放时已确认，兑券后按券消费口径走）。
 */
@Getter
@Setter
@TableName("s_gift_card_prepaid_log")
@ApiModel(value = "GiftCardPrepaidLog对象", description = "礼品卡预收台账")
public class GiftCardPrepaidLog extends BaseEntity {
    public static final String DISTRIBUTE = "DISTRIBUTE";
    public static final String VOID = "VOID";

    @ApiModelProperty("礼品卡id")
    private Long giftCardId;

    @ApiModelProperty("礼品卡code")
    private String code;

    @ApiModelProperty("活动id")
    private Long activityId;

    @ApiModelProperty("门店id")
    private Long shopId;

    @ApiModelProperty("事件：DISTRIBUTE 发放 / VOID 作废")
    private String eventType;

    @ApiModelProperty("预收金额（元），发放为正、作废为负")
    private BigDecimal amount;

    @ApiModelProperty("操作人")
    private Long operator;
}
