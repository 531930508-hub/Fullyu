package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.dto.ApprovalFlowTarget;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * 审批流程节点：按 sort_order 顺序推进，每个节点可混合“指定人”和“岗位”，并选择或签/会签。
 *
 * @author Full愈
 * @date 2026/11/09
 */
@Getter
@Setter
@TableName("f_approval_flow_node")
@ApiModel(value = "ApprovalFlowNode对象", description = "审批流程节点")
public class ApprovalFlowNode extends BaseEntity {

    @ApiModelProperty("审批类型id")
    private Long categoryId;

    @ApiModelProperty("节点名称")
    private String nodeName;

    @ApiModelProperty("ANY 或签 / ALL 会签")
    private String approveMode;

    @ApiModelProperty("审批对象JSON")
    private String targetsJson;

    @ApiModelProperty("节点顺序，从0开始")
    private Integer sortOrder;

    @TableField(exist = false)
    private List<ApprovalFlowTarget> targets = new ArrayList<>();
}
