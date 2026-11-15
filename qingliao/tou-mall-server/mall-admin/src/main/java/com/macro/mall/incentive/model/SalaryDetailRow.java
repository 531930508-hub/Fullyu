package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 算薪口径的有效订单明细行。与复购口径不同：这里不要求客户手机号，
 * 只要订单支付且明细服务完成，就应计入基础薪资。
 */
@Data
public class SalaryDetailRow {

    private Long detailId;

    private Long orderId;

    private Long massagistId;

    private Long shopId;

    /** 明细分型，对应 OrderType：0 产品、1 优惠券、2 接待。 */
    private Integer detailType;

    private Integer duration;

    private BigDecimal projectCoefficient;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private Long projectId;

    private String projectTitle;
}