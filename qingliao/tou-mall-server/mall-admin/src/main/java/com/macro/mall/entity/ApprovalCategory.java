package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 审批类型
 *
 * @author zkl
 * @date 2025/06/10
 */
@Getter
@Setter
@TableName("f_approval_category")
@ApiModel(value = "ApprovalCategory对象", description = "审批类型")
public class ApprovalCategory extends BaseEntity {


    @ApiModelProperty("标题")
    private String title;

    @ApiModelProperty("编号：系统内置、唯一")
    private String code;

    @ApiModelProperty("关联业务的bean的id")
    private String beanId;

    @ApiModelProperty("审批人/角色id，json数组")
    private String approvalIds;
    @TableField(exist = false)
    private List<Long> approvalIdList;

    @ApiModelProperty("抄送人/角色id，json数组")
    private String ccIds;
    @TableField(exist = false)
    private List<Long> ccIdList;

    @ApiModelProperty("审批处理时长  单位为天")
    private Integer processingTime;

    @ApiModelProperty("发起人")
    private Long createUser;

    private Long shopId;

    @ApiModelProperty("审批流程节点（按顺序执行）")
    @TableField(exist = false)
    private List<ApprovalFlowNode> nodes;

}
