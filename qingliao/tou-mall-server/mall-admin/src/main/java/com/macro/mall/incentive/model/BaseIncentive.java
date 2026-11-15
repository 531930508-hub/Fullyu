package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 基础薪资及其档位提示。coefficient 为当前档位单价（元/分钟）。
 */
@Data
public class BaseIncentive {

    private BigDecimal minutes = BigDecimal.ZERO;

    /** 当前档位基础薪资单价（元/分钟），字段名为兼容历史接口保留。 */
    private BigDecimal coefficient = BigDecimal.ONE;

    private BigDecimal amount = BigDecimal.ZERO;

    private Boolean newPartner = false;

    private List<CoefficientBand> bands = new ArrayList<>();

    private Long currentBandMinutes;

    private BigDecimal currentBandCoefficient;

    private Long nextBandMinutes;

    private BigDecimal nextBandCoefficient;

    private BigDecimal minutesToNextBand;

    private String nextBandHint;

    /** 服务单：实际服务分钟数（未折算）。 */
    private BigDecimal serviceMinutes = BigDecimal.ZERO;

    /** 服务单：按项目系数折算后的分钟数。 */
    private BigDecimal serviceWeightedMinutes = BigDecimal.ZERO;

    private Integer serviceOrderCount = 0;

    /** 接待单：实际接待分钟数（未折算）。 */
    private BigDecimal receptionMinutes = BigDecimal.ZERO;

    /** 接待单：按接待工时上限计入的分钟数（未折算）。 */
    private BigDecimal receptionCountedMinutes = BigDecimal.ZERO;

    /** 接待单：超出上限、不计入基础薪资的分钟数（未折算）。 */
    private BigDecimal receptionExcessMinutes = BigDecimal.ZERO;

    /** 接待工时上限对应的分钟数；未参与封顶时为 0。 */
    private BigDecimal receptionCapMinutes = BigDecimal.ZERO;

    /** 是否适用接待工时封顶（无排班时不封顶）。 */
    private Boolean receptionCapApplied = false;

    private Integer receptionOrderCount = 0;

    /** 时长调整：加/减的分钟数。 */
    private BigDecimal adjustMinutes = BigDecimal.ZERO;

    /** 调店等门店名，仅在接待封顶按门店拆分时展示。 */
    private String receptionCapHint;
}
