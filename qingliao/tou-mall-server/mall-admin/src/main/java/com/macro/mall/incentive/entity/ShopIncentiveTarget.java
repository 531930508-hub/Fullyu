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
 * 门店月度业绩目标与店长提点。
 */
@Getter
@Setter
@TableName("s_shop_incentive_target")
public class ShopIncentiveTarget extends BaseEntity {

    private Long shopId;

    private String monthCode;

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
