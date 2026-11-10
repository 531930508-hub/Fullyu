package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.enums.FlowState;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * @author zkl
 * @date 2025/06/10
 */
@Getter
@Setter
@TableName("f_approval")
@ApiModel(value = "Approval对象", description = "")
public class Approval extends BaseEntity {


    @ApiModelProperty("订单id")
    private Long orderId;

    @ApiModelProperty("客户id")
    private Long customerId;

    private Long categoryId;

    @ApiModelProperty("审批类别")
    private String categoryTitle;
    /**
     * @see FlowState
     * 状态：0已驳回，1待审批，2审批中，3已通过，4已撤回
     */
    @TableField("state")
    private Integer state;

    @ApiModelProperty("审批处理时长  单位为天")
    private Long takingSeconds;

    @ApiModelProperty("发起人")
    private Long createUser;

    private String rejectReason;

    /**
     * 是否可以重提审批
     * 已撤回或已驳回状态发挥true
     *
     * @return
     */
    public boolean ifReSubmit() {
        return FlowState.REJECTED.getValue().equals(state) || FlowState.WITHDRAW.getValue().equals(state);
    }

}
