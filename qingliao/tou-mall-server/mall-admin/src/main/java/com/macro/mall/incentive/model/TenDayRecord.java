package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 新客 10 天复购的单个名额。名额按第二单日期排序，权重可为 0.5 等分摊值。
 */
@Data
public class TenDayRecord {

    private LocalDate firstVisitDate;

    private LocalDate secondVisitDate;

    private String phoneMasked;

    private BigDecimal weight;

    private BigDecimal unitPrice;

    private BigDecimal amount;
}
