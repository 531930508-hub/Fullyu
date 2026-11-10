package com.macro.mall.membercard.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 结算页优惠方案（年卡 / 通用折扣 / 积分 / Full愈券四选一）。
 *
 * @date 2026/11/07
 */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class MemberCardPriceOption {

    /** 1年卡提前价 2年卡当日价 3通用折扣 4积分 5Full愈券 */
    private Integer source;

    private String label;

    /** 现金应付 */
    private BigDecimal payAmount;

    /** 本方案优惠金额 */
    private BigDecimal benefitAmount;

    /** 积分方案消耗积分 */
    private Long pointsCost;

    /** 券方案消耗张数 */
    private Integer couponCost;

    private Boolean recommended = false;

    private Boolean available = true;

    private String unavailableReason;
}
