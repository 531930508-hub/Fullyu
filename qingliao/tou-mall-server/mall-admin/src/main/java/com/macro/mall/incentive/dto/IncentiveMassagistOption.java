package com.macro.mall.incentive.dto;

import lombok.Data;

/**
 * 培训登记与店长选择使用的疗愈师轻量选项。
 */
@Data
public class IncentiveMassagistOption {

    private Long id;

    private String name;

    private Long shopId;

    private String shopName;

    private String cooperationStatus;
}
