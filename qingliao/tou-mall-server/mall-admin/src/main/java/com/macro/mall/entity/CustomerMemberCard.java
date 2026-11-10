package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 客户会员卡权益期。
 *
 * @date 2026/11/07
 */
@Getter
@Setter
@TableName("c_customer_member_card")
@ApiModel(value = "CustomerMemberCard对象", description = "客户会员卡权益期")
public class CustomerMemberCard extends BaseEntity {

    public static final int STATUS_PENDING = 0;
    public static final int STATUS_ACTIVE = 1;
    public static final int STATUS_EXPIRED = 2;
    public static final int STATUS_REFUNDED = 3;

    @ApiModelProperty("卡号")
    private String cardNo;

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("卡类型 month月卡 year年卡 custom自定义")
    private String cardType;

    @ApiModelProperty("开卡名称快照")
    private String cardName;

    @ApiModelProperty("有效期天数快照")
    private Integer validDays;

    @ApiModelProperty("批量发卡批次号")
    private String batchNo;

    @ApiModelProperty("第几个权益期")
    private Integer periodNo;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("开始时间")
    private LocalDateTime startTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("结束时间")
    private LocalDateTime endTime;

    @ApiModelProperty("开卡快照-提前预约折扣率")
    private BigDecimal advanceRate;

    @ApiModelProperty("开卡快照-当日预约折扣率")
    private BigDecimal sameDayRate;

    @ApiModelProperty("实付开卡金额")
    private BigDecimal amount;

    @ApiModelProperty("开卡支付单id")
    private Long payOrderId;

    @ApiModelProperty("1小程序 2后台手工 3预付券包耗尽赠送")
    private Integer channel;

    @ApiModelProperty("耗尽赠会员对应购买订单，数据库唯一约束防重复赠送")
    private Long rewardSourceOrderId;

    @ApiModelProperty("0待生效 1生效 2已过期 3已退款")
    private Integer status;

    @ApiModelProperty("退款金额")
    private BigDecimal refundAmount;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("退款时间")
    private LocalDateTime refundTime;

    @ApiModelProperty("退款原因")
    private String refundReason;

    @ApiModelProperty("操作人")
    private Long operatorId;

    @ApiModelProperty("备注")
    private String remark;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(value = "update_time", fill = FieldFill.UPDATE)
    @ApiModelProperty(hidden = true)
    private LocalDateTime updateTime;

    @TableField(exist = false)
    @ApiModelProperty("剩余天数")
    private Long remainingDays;

    @TableField(exist = false)
    @ApiModelProperty("是否当前生效")
    private Boolean current;

    @ApiModelProperty("状态文案")
    @TableField(exist = false)
    private String statusText;

    @TableField(exist = false)
    @ApiModelProperty("客户昵称（后台返回）")
    private String customerNickname;

    @TableField(exist = false)
    @ApiModelProperty("客户手机号（后台返回）")
    private String customerPhone;
}
