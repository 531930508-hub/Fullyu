package com.macro.mall.incentive.model;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 有效订单明细行。基础奖励按结束日期归属，培训按支付日期归属。
 */
@Data
public class ServiceDetailRow {

    private Long detailId;

    private Long orderId;

    private Long massagistId;

    private Long shopId;

    private String phone;

    private LocalDate serviceDate;

    private LocalDate payDate;

    private Integer duration;

    private BigDecimal projectCoefficient;

    private Long projectId;

    private String projectTitle;

    private String parts;
}
