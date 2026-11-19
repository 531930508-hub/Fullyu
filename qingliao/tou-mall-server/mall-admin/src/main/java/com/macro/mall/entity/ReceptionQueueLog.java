package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

/**
 * 轮牌队列流水：谁在什么时候因为什么换了位置。
 *
 * @author reception
 * @date 2026/12/08
 */
@Getter
@Setter
@TableName("s_reception_queue_log")
@ApiModel(value = "ReceptionQueueLog对象", description = "轮牌队列流水")
public class ReceptionQueueLog extends BaseEntity {

    @ApiModelProperty("轮牌日期")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate queueDate;

    @ApiModelProperty("门店id")
    private Long shopId;

    @ApiModelProperty("疗愈师id")
    private Long massagistId;

    /**
     * @see com.macro.mall.enums.ReceptionQueueAction
     */
    @ApiModelProperty("动作")
    private String action;

    @ApiModelProperty("关联订单详情id")
    private Long detailId;

    @ApiModelProperty("变更前seq")
    private Long beforeSeq;

    @ApiModelProperty("变更后seq")
    private Long afterSeq;

    @ApiModelProperty("变更前值班状态")
    private Integer beforeOnDuty;

    @ApiModelProperty("变更后值班状态")
    private Integer afterOnDuty;

    @ApiModelProperty("变更前结果编号")
    private Integer beforeReceiptNo;

    @ApiModelProperty("变更后结果编号")
    private Integer afterReceiptNo;

    @ApiModelProperty("原因/备注")
    private String reason;

    @ApiModelProperty("操作人")
    private String operatorName;

}
