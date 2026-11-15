package com.macro.mall.incentive.dto;

import lombok.Data;

/**
 * 维护统计排除的内部账号手机号。
 */
@Data
public class InternalAccountSaveRequest {

    private Long id;

    private String phone;

    private Integer enabled;

    private String remark;
}