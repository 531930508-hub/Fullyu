package com.macro.mall.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 提交审批时对流程节点的解析结果（已排除发起人、已去掉空节点）。
 *
 * @author Full愈
 * @date 2026/11/09
 */
@Data
public class ApprovalResolvedNode {

    private String nodeName;

    private String approveMode;

    private List<Long> adminIds = new ArrayList<>();
}
