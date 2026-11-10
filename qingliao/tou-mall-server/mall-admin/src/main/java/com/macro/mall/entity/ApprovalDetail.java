package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.*;
import lombok.experimental.Accessors;
import org.springframework.util.ObjectUtils;

/**
 * 审批详情
 *
 * @author zkl
 * @date 2025/06/10
 */
@Getter
@Setter
@Builder
@AllArgsConstructor
@NoArgsConstructor
@Accessors(chain = true)
@TableName("f_approval_detail")
@ApiModel(value = "ApprovalDetail对象", description = "审批详情")
public class ApprovalDetail extends BaseEntity {


    @ApiModelProperty("审批记录id")
    private Long approvalId;

    @ApiModelProperty("审批类别")
    private Long categoryId;

    @ApiModelProperty("审批人id")
    private Long targetUserId;

    @ApiModelProperty("审批人类别：1发起人，2审批人，3抄送人")
    private Integer flowUserType;

    @ApiModelProperty("审批层级")
    private Integer level;

    @ApiModelProperty("节点名称（提交时快照，兼容历史数据可为空）")
    private String nodeName;

    @ApiModelProperty("节点审批方式：ANY 或签 / ALL 会签")
    private String approveMode;

    @ApiModelProperty("状态：0已驳回，1待提交，2审批中，3已通过，4已撤回，5已跳过")
    private Integer state;

    @ApiModelProperty("开始时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @ApiModelProperty("结束时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime finishTime;

    @ApiModelProperty("审批用时（单位：秒）")
    private Long takingSeconds;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @ApiModelProperty("审批时需要填备注：0不需要，1驳回时需要，2同意时需要，3都需要")
    private Integer needComment;

    private Long createUser;

    /**
     * 审批中的人的id
     */
    @TableField(exist = false)
    private Long approvingUserId;
    /**
     * 审批信息
     */
    @TableField(exist = false)
    private Approval approval;

    /**
     * 得到下一级审批
     *
     * @return
     */
    public Integer takeNextLevel() {
        if (ObjectUtils.isEmpty(level)) {
            return 0;
        }
        return level + 1;
    }


}
