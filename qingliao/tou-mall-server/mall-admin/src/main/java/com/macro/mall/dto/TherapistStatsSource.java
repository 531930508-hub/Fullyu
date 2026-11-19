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
    /** 明细对应的线上项目 ID 与项目标题（标题优先取 s_project.title），用于和培训项目同口径归部位。 */
    private Long projectId;
    private String projectTitle;
    /** 服务时长（分钟），培训项目按 60/90 分钟拆分头部水疗。 */
    private Integer duration;
    /** 是否与培训口径的订单范围一致：客户单、已支付、预约正常、非内部账号；否则不计部位。 */
    private Boolean trainingPartEligible;
}
