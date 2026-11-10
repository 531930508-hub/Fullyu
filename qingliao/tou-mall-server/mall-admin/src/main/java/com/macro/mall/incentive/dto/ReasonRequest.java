package com.macro.mall.incentive.dto;

import lombok.Data;

/**
 * 需要填写原因的作废/撤销操作。
 */
@Data
public class ReasonRequest {

    private String reason;
}
