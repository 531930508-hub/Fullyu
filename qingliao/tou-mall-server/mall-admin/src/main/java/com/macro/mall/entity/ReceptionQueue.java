package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 轮牌队列：当天每店每人一行，「谁排在谁前面」的唯一真相。
 *
 * <p>和 s_round_schedule 的分工：</p>
 * <ul>
 *   <li>本表只回答「现在谁排第几」；</li>
 *   <li>s_round_schedule 只回答「今天排了谁、排了几次、挂在哪一单」，不再参与排序。</li>
 * </ul>
 *
 * @author reception
 * @date 2026/12/08
 */
@Getter
@Setter
@TableName("s_reception_queue")
@ApiModel(value = "ReceptionQueue对象", description = "轮牌队列")
public class ReceptionQueue extends BaseEntity {

    @ApiModelProperty("轮牌日期 yyyy-MM-dd")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate queueDate;

    @ApiModelProperty("门店id")
    private Long shopId;

    /**
     * 服务单轮牌和接待单轮牌是各自独立的一队，互不推进。
     *
     * @see com.macro.mall.service.ReceptionQueueService#KIND_SERVICE
     */
    @ApiModelProperty("轮牌类型 0服务单轮牌 1接待单轮牌")
    private Integer queueKind;

    @ApiModelProperty("疗愈师id")
    private Long massagistId;

    @ApiModelProperty("排序键，越小越靠前（派单唯一依据；点值班/下值班都不动它）")
    private Long seq;

    @ApiModelProperty("结果编号（展示用，1..n）")
    private Integer receiptNo;

    @ApiModelProperty("值班状态 1值班 0休息/未值班")
    private Integer onDuty;

    @ApiModelProperty("最近一次点值班的时间（值班区按它排序：先点的在上）")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime dutyTime;

    @ApiModelProperty("1在轮牌中 0已退出")
    private Integer valid;

    @ApiModelProperty("0初始 1补位 2调店 3手动")
    private Integer source;

    @ApiModelProperty("当天上钟次数")
    private Integer assignCount;

    @ApiModelProperty("最近一次上钟时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastAssignTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(value = "update_time", fill = FieldFill.UPDATE)
    @ApiModelProperty(hidden = true)
    private LocalDateTime updateTime;

}
