package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 店长奖励汇总。未担任店长时 manager=false、金额为 0。
 */
@Data
public class ManagerIncentive {

    private Boolean manager = false;

    private BigDecimal totalAmount = BigDecimal.ZERO;

    private List<ManagerShopReward> shops = new ArrayList<>();
}
