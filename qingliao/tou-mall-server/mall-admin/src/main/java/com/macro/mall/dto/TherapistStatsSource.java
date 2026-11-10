package com.macro.mall.dto;

import lombok.Data;

import java.time.LocalDateTime;

/** 疗愈师统计的原始明细：一条已完成服务明细 + 所属订单支付方式/部位 + 顾客性别。 */
@Data
public class TherapistStatsSource {
    private Long detailId;
    private Long massagistId;
    private Long orderId;
    private Long customerId;
    /** 1 小程序指定、2 PC 指定，均算点钟。 */
    private Integer specifyType;
    private LocalDateTime startTime;
    /** 0 二维码、1 微信、2 Full愈券、3 美团、4 现金。 */
    private Integer payType;
    /** 订单部位，JSON 数组字符串，如 ["头","肩"]。 */
    private String parts;
    /** 1 男、2 女。 */
    private Integer gender;
}
