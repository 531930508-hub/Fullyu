package com.macro.mall.incentive.model;

import lombok.Data;

import java.time.LocalDate;

/**
 * 有效服务订单明细，用于培训项目计数与部位匹配。
 */
@Data
public class TrainingOrder {

    private Long orderId;

    private LocalDate serviceDate;

    private Long massagistId;

    private Long shopId;

    private Long projectId;

    private Integer duration;

    private String projectTitle;

    private String parts;
}
