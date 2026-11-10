package com.macro.mall.incentive.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * 去重后的有效到店记录：同一手机号、同一天、同一疗愈师只保留一条。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CustomerVisit {

    private String phone;

    private LocalDate serviceDate;

    private Long massagistId;

    private Long shopId;
}
