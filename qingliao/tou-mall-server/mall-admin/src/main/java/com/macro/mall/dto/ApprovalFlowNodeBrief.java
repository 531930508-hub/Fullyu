package com.macro.mall.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 审批流转节点摘要（待办中心列表展示「提交 → 审批 → 完成」进度用）。
 *
 * @author Full愈
 * @date 2026/11/13
 */
@Data
public class ApprovalFlowNodeBrief {

    /** 审批人类别：1发起人，2审批人 */
    private Integer flowUserType;

    /** 节点名称（历史数据可能为空） */
    private String nodeName;

    private Long targetUserId;

    /** 0已驳回，1待提交，2审批中，3已通过，4已撤回，5已跳过 */
    private Integer state;

    /** ANY 或签 / ALL 会签 */
    private String approveMode;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime finishTime;
}