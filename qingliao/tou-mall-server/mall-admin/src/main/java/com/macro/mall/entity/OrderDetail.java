package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.macro.mall.enums.AppointmentState;
import com.macro.mall.enums.OrderType;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单详情
 *
 * @author ST
 * @date 2025/05/30
 */
@Getter
@Setter
@TableName("oms_order_detail")
@ApiModel(value = "OrderDetail对象", description = "")
public class OrderDetail extends BaseEntity {

    @ApiModelProperty("订单id")
    private Long orderId;
    @TableField(exist = false)
    private Order order;

    @ApiModelProperty("用户id")
    private Long customerId;
    @TableField(exist = false)
    private Customer customer;

    @ApiModelProperty("门店id")
    private Long shopId;

    @ApiModelProperty("项目id")
    private Long projectId;
    @TableField(exist = false)
    private String projectTitle;

    @ApiModelProperty("房间id")
    private Long roomId;
    @TableField(exist = false)
    private String roomName;

    @ApiModelProperty("床位id")
    private Long bedId;
    @TableField(exist = false)
    private String bedName;
    /**
     * @see com.macro.mall.enums.BedType
     */
    @TableField(exist = false)
    private Integer bedType;

    @ApiModelProperty("疗愈师人员id")
    private Long massagistId;

    /**
     * @see AppointmentState
     */
    @ApiModelProperty("预约状态：0未确认，1进行中，2已完成，3已取消")
    private Integer state = AppointmentState.WAITING.getValue();

    @ApiModelProperty("服务时间(分钟)")
    private Integer duration;

    @ApiModelProperty("预计开始时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @ApiModelProperty("预计结束时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;

    @ApiModelProperty("完成时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime finishTime;

    @ApiModelProperty("备注")
    private String comment;

    /**
     * @see com.macro.mall.enums.SpecifyType
     */
    @ApiModelProperty("指定技师类型1：小程序指定技师")
    private Integer specifyType;

    @ApiModelProperty("是否锁定床位")
    private Boolean isLockBed = false;

    @TableField(exist = false)
    @ApiModelProperty("服务人员")
    private Massagist massagist;

    @TableField(exist = false)
    @ApiModelProperty("床位编号")
    private String bedNumber;

    @TableField(exist = false)
    private Integer type = OrderType.PRODUCT.getValue();

    @TableField(exist = false)
    @ApiModelProperty("系数")
    private BigDecimal coefficient;

    @TableField(exist = false)
    @ApiModelProperty("工时")
    private double workingHours;

    //是否更新排班
    private Boolean isUpdateSort = true;

    private Integer isShare;
    private long fromOrderId;
    private String shareCode;

}
