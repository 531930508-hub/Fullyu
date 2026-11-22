package com.macro.mall.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 某个疗愈师某天的已接单数（服务单/接待单分开算），直接给看板卡片用
 *
 * @author reception
 * @date 2026/12/08
 */
@Getter
@Setter
@ApiModel(value = "MassagistServedCount", description = "疗愈师今日已接单数")
public class MassagistServedCount {

    @ApiModelProperty("疗愈师id")
    private Long massagistId;

    @ApiModelProperty("服务单数")
    private Integer serviceCount;

    @ApiModelProperty("接待单数")
    private Integer receptionCount;

}