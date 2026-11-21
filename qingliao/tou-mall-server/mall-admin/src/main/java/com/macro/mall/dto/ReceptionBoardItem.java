package com.macro.mall.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 轮牌看板一行
 *
 * @author reception
 * @date 2026/12/08
 */
@Getter
@Setter
@ApiModel(value = "ReceptionBoardItem", description = "轮牌看板")
public class ReceptionBoardItem {

    @ApiModelProperty("轮牌类型 0服务单轮牌 1接待单轮牌")
    private Integer queueKind;

    @ApiModelProperty("疗愈师id")
    private Long massagistId;

    @ApiModelProperty("疗愈师姓名")
    private String massagistName;

    @ApiModelProperty("结果编号（给人看的号码）")
    private Integer receiptNo;

    @ApiModelProperty("排序键（派单的唯一依据）")
    private Long seq;

    @ApiModelProperty("1值班 0休息/未值班")
    private Integer onDuty;

    @ApiModelProperty("值班区序号（1..n，按点值班先后；不在值班区为空）")
    private Integer dutyNo;

    @ApiModelProperty("派单顺序（1..n，按 seq；下一个接单的人 = 1）")
    private Integer dispatchNo;

    @ApiModelProperty("最近一次点值班的时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime dutyTime;

    @ApiModelProperty("是否在服务中")
    private Boolean busy;

    @ApiModelProperty("当前服务预计结束时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime busyUntil;

    @ApiModelProperty("当前在服务的订单详情id")
    private Long currentDetailId;

    @ApiModelProperty("今天已上钟次数")
    private Integer assignCount;

    @ApiModelProperty("最近一次上钟时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastAssignTime;

    @ApiModelProperty("该单是否已过接待确认时限（此时其他人可抢）")
    private Boolean grabbable;

    @ApiModelProperty("抢单截止时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime grabDeadline;

}
