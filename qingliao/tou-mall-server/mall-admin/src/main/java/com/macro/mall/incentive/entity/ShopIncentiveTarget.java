package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 门店月度目标与店长提点。目标值按 metricType 取不同指标：
 * {@link #METRIC_REVENUE} 为整店实收，{@link #METRIC_REPEAT} 为当月复购金额。
 */
@Getter
@Setter
@TableName("s_shop_incentive_target")
public class ShopIncentiveTarget extends BaseEntity {

    /** 业绩目标：实际值取整店实收（operatingRevenueTop）。 */
    public static final int METRIC_REVENUE = 0;

    /** 复购目标：实际值取当月复购金额（有效订单中老客订单实付合计）。 */
    public static final int METRIC_REPEAT = 1;

    private Long shopId;

    private String monthCode;

    /** 目标指标：0=业绩（整店实收），1=复购（当月复购金额）。老数据为 0。 */
    private Integer metricType;

    private BigDecimal targetRevenue;

    private BigDecimal commissionRate;

    /**
     * 店长对应的疗愈师 id，用于仅本人可见店长奖励。
     */
    private Long managerMassagistId;

    private Long configId;

    private String remark;

    private Long createUserId;

    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
