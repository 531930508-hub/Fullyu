package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 基础薪资的折算时长拆分：服务单 + 接待单（封顶后）+ 时长调整。
 */
@Data
public class BaseMinutes {

    /** 服务单实际服务分钟（未折算）。 */
    private BigDecimal serviceMinutes = BigDecimal.ZERO;

    /** 服务单按项目系数折算后的分钟。 */
    private BigDecimal serviceWeightedMinutes = BigDecimal.ZERO;

    private Integer serviceOrderCount = 0;

    /** 接待单实际接待分钟（未折算）。 */
    private BigDecimal receptionMinutes = BigDecimal.ZERO;

    /** 接待单计入基础薪资的分钟（未折算，已封顶）。 */
    private BigDecimal receptionCountedMinutes = BigDecimal.ZERO;

    /** 计入基础薪资的接待折算分钟。 */
    private BigDecimal receptionCountedWeightedMinutes = BigDecimal.ZERO;

    /** 超出接待上限、不参与计算基础薪资的分钟（未折算）。 */
    private BigDecimal receptionExcessMinutes = BigDecimal.ZERO;

    /** 接待工时上限分钟数；未封顶时为 0。 */
    private BigDecimal receptionCapMinutes = BigDecimal.ZERO;

    /** 是否按排班时长封顶（无排班时不封顶）。 */
    private Boolean receptionCapApplied = false;

    private Integer receptionOrderCount = 0;

    /** 服务 + 接待计入的折算分钟（不含时长调整）。 */
    public BigDecimal countedWeightedMinutes() {
        return serviceWeightedMinutes.add(receptionCountedWeightedMinutes);
    }
}