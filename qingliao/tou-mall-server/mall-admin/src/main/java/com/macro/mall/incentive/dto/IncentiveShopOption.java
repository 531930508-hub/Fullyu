package com.macro.mall.incentive.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 激励页面可选择的门店，仅返回名称与 ID，避免暴露门店敏感字段。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class IncentiveShopOption {

    private Long id;

    private String name;
}
