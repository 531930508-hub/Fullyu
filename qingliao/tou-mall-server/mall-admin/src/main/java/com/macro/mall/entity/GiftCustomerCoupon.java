package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.macro.mall.consts.NormalConst;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * @author zkl
 * @date 2025/06/20
 */
@Getter
@Setter
@TableName("s_gift_customer_coupon")
@ApiModel(value = "GiftCustomerCoupon对象", description = "")
public class GiftCustomerCoupon extends BaseEntity {

    @ApiModelProperty("审批id")
    private Long approvalId;

    /**
     * @see com.macro.mall.enums.FlowState
     */
    @ApiModelProperty("状态：审批状态")
    private Integer state;

    @ApiModelProperty("优惠券id")
    private Long couponId = NormalConst.GIVE_COUPON_ID;

    @NotBlank(message = "客户手机号不能为空")
    @ApiModelProperty("客户手机号")
    private String phone;

    @ApiModelProperty("客户ID")
    private Long customerId;

    @TableField(exist = false)
    private String customerName;

    @NotNull(message = "赠送数量不能为空")
    @ApiModelProperty("赠送数量")
    private Integer couponNumber;

    @ApiModelProperty("单券价值（元），默认0，不代表新增现金收款")
    private BigDecimal couponAmount = BigDecimal.ZERO;

    @NotNull(message = "有效期起不能为空")
    @ApiModelProperty("有效期起")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate startTime;

    @NotNull(message = "有效期止不能为空")
    @ApiModelProperty("有效期止")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate endTime;

    @ApiModelProperty("使用限制")
    private String limitations;

    @NotNull(message = "门店id不能为空")
    @ApiModelProperty("门店id")
    private Long shopId;

    @NotNull(message = "审批申请人不能为空")
    @ApiModelProperty("创建人（审批申请人）")
    private Long createUser;
}
