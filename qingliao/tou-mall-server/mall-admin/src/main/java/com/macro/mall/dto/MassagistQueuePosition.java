package com.macro.mall.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 疗愈师在服务队 / 接待队里的位置，以及今天实际接了几单
 *
 * <p>队序来自轮牌队列（seq 顺序），已接单数来自订单明细——两者不是一个东西：
 * 队序回答「下一个轮到谁」，单数回答「今天做了几个」。别拿队列的 assign_count 当单数用，
 * 那只是个「这一队推了几次」的计数器，手工改技师/互换、改期后重新排回来都会让它对不上。</p>
 *
 * @author reception
 * @date 2026/12/08
 */
@Getter
@Setter
@ApiModel(value = "MassagistQueuePosition", description = "疗愈师队序与今日已接单数")
public class MassagistQueuePosition {

    @ApiModelProperty("疗愈师id")
    private Long massagistId;

    @ApiModelProperty("服务队序（1..n，按 seq，第1位就是下一个接服务单的人；不在队里为空）")
    private Integer serviceNo;

    @ApiModelProperty("今日已接服务单数（已到店+已完成的产品订单明细，未到店/已取消不算）")
    private Integer serviceCount;

    @ApiModelProperty("接待队序（1..n，按 seq；不在队里为空）")
    private Integer receptionNo;

    @ApiModelProperty("今日已接接待单数（已到店+已完成的接待订单明细，未到店/已取消不算）")
    private Integer receptionCount;

}