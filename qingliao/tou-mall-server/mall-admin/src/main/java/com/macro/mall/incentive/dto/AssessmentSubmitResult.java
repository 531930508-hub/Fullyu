package com.macro.mall.incentive.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * 盲考响应：只返回是否已记录、是否刚刚完成认证，不返回票数、其他内训师或失败记录。
 */
@Getter
@Setter
public class AssessmentSubmitResult {

    private boolean recorded = true;

    private boolean certified;

    private String projectKey;

    private String projectName;

    private String message;
}
