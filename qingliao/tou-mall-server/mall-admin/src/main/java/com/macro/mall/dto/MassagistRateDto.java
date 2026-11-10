package com.macro.mall.dto;

import com.macro.mall.entity.MassagistRate;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class MassagistRateDto {

    @ApiModelProperty("订单id")
    private Long orderId;

    @ApiModelProperty("疗愈师评价")
    private List<MassagistRate> therapistRatings;

    @ApiModelProperty("评价内容")
    private String comment;

    @ApiModelProperty("服务印象")
    private int serviceScore;

    @ApiModelProperty("技师印象")
    private int peopleScore;
}
