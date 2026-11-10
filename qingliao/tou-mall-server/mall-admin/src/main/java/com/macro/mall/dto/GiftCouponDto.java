package com.macro.mall.dto;

import com.macro.mall.entity.Coupon;
import lombok.Data;

import java.util.List;

/**
 * Created by oahnus on 2025/6/18
 *
 * @author oahnus
 */
@Data
public class GiftCouponDto {
    private Coupon couponInfo;
    private List<Long> cusCouponIds;
    private Long orderId;

    private Integer state;
}
