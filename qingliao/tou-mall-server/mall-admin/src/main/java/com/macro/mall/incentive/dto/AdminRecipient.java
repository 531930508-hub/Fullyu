package com.macro.mall.incentive.dto;

import lombok.Data;

/**
 * 站内消息接收人（含门店范围，用于按门店过滤店长）。
 */
@Data
public class AdminRecipient {

    private Long id;

    private Long shopId;

    /** 形如 "[1,2]"。 */
    private String shopIdArr;
}