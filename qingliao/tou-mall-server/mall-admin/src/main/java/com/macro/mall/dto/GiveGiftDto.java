package com.macro.mall.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class GiveGiftDto {

    @ApiModelProperty("来源客户id")
    private Long giveGiftId;

    @ApiModelProperty("赠予客户id")
    private Long customerId;

    @ApiModelProperty("优惠券id")
    private List<Long> customerCouponIdList;
}
