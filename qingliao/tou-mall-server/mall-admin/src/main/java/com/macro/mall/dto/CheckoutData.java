package com.macro.mall.dto;

import com.macro.mall.entity.Order;
import com.macro.mall.membercard.dto.MemberCardPriceOption;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Created by oahnus on 2025/6/17
 *
 * @author oahnus
 */
@Data
public class CheckoutData {
    private Order order;

    // 可用次数
    private Integer canUseCouponCount;
    // 本次消耗次数
    private Integer costCouponCount;
    // 根据最小值 判断是否用积分支付 luxin20260903
    private Integer useIntegrationState;

    // ===== 批次二：年卡 / 通用折扣 / 积分 / 券 四选一比价 =====
    private BigDecimal baseAmount;
    private String appointmentDate;
    private Boolean advance;
    /** 当前选中的优惠来源 1年卡提前价 2年卡当日价 3通用折扣 4积分 5Full愈券 */
    private Integer selectedPriceSource;
    private BigDecimal benefitAmount;
    private List<MemberCardPriceOption> priceOptions;

    /**
     * 结算页「顺手续年卡」信息（{@code MemberCardService.renewalView}）：
     * hasCard / endTime / annualPrice / advanceText 等；勾选续费后走合并支付。
     */
    private Map<String, Object> memberCard;
}
