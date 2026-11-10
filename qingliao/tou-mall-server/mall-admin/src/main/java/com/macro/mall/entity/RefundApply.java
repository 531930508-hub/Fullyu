package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * @author zkl
 * @date 2025/06/10
 */
@Getter
@Setter
@TableName("refund_apply")
@ApiModel(value = "RefundApply对象", description = "")
public class RefundApply extends BaseEntity {


    private Long orderId;

    private Long shopId;

    private Long customerId;

    private BigDecimal refundAmount;

    private String refundReason;

    /**
     * 记录退款时的订单支付状态
     *
     * @see com.macro.mall.enums.OrderState
     */
    private Integer orderState;

    /**
     * 记录退款时的订单支付状态
     *
     * @see com.macro.mall.enums.AppointmentState
     */
    private Integer appointmentState;
    /**
     * @see com.macro.mall.enums.RefundType
     */
    private Integer type;

    /**
     * @see com.macro.mall.enums.FlowState
     */
    private Integer refundStatus;//审批通过会自动退款

    /**
     * 汇款流水号
     */
    @Deprecated
    private String remittanceStatementNumber;

    private Long approvalId;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime passTime;//算流水时当作流水支付时间

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Deprecated
    private LocalDateTime payTime;

    private Long createUser;

    @TableField(exist = false)
    private String orderCode;

    @TableField(exist = false)
    private Integer cancelOrderType;


}
