package com.macro.mall.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class UpdateCustomerCouponDto {
    private List<Long> customerCouponIdList;
    private Integer state;
}
