package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.macro.mall.serializer.ArrayStringDeSerializer;
import com.macro.mall.serializer.ArrayStringSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * @author
 * @date 2025/08/13
 */
@Getter
@Setter
@TableName("s_round_schedule")
@ApiModel(value = "RoundSchedule对象", description = "技师排班轮次记录表")
public class RoundSchedule extends BaseEntity {

    @ApiModelProperty("yyyy-MM-dd所属预约日期")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate appointmentDate;

    @ApiModelProperty("轮次值")
    private Long round;

    @ApiModelProperty("技师id")
    private Long massagistId;

    /**
     * @see com.macro.mall.enums.RoundScheduleState
     */
    @ApiModelProperty("状态")
    private Integer state;

    @ApiModelProperty("排班轮次对应订单详情id")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)//允许修改为NULL
    private Long orderDetailId;

    @ApiModelProperty("备注")
    @JsonSerialize(using = ArrayStringSerializer.class, nullsUsing = ArrayStringSerializer.class)
    @JsonDeserialize(using = ArrayStringDeSerializer.class)
    private String comment;

    @ApiModelProperty("店铺id")
    private Long shopId;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(value = "update_time", fill = FieldFill.UPDATE)
    @ApiModelProperty(hidden = true)
    private LocalDateTime updateTime;

    @ApiModelProperty("关联详情")
    @TableField(exist = false)
    private OrderDetail orderDetail;

    @ApiModelProperty("已排轮次")
    @TableField(exist = false)
    private Long roundCount;

    @ApiModelProperty("结果编号（轮牌队列，给人看的号码）")
    @TableField(exist = false)
    private Integer sortNo;

    @ApiModelProperty("值班状态 1值班 0休息/未值班")
    @TableField(exist = false)
    private Integer onDuty;

    @ApiModelProperty("队列排序键")
    @TableField(exist = false)
    private Long queueSeq;

    @ApiModelProperty("是否在服务中")
    @TableField(exist = false)
    private Boolean busy;

    @ApiModelProperty("当前服务预计结束时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(exist = false)
    private LocalDateTime busyUntil;

}
