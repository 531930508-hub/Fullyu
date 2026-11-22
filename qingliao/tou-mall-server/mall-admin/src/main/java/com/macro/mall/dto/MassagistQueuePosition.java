package com.macro.mall.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 疗愈师在服务队 / 接待队里的位置和今日接单数
 *
 * @author reception
 * @date 2026/12/08
 */
@Getter
@Setter
@ApiModel(value = "MassagistQueuePosition", description = "疗愈师队序与今日接单数")
public class MassagistQueuePosition {

    @ApiModelProperty("疗愈师id")
    private Long massagistId;

    @ApiModelProperty("服务队序（1..n，按 seq，第1位就是下一个接服务单的人；不在队里为空）")
    private Integer serviceNo;

    @ApiModelProperty("今日已接服务单数")
    private Integer serviceAssigned;

    @ApiModelProperty("接待队序（1..n，按 seq；不在队里为空）")
    private Integer receptionNo;

    @ApiModelProperty("今日已接接待单数")
    private Integer receptionAssigned;

}