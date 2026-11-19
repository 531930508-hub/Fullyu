package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 轮牌参数（shop_id=0 为全局默认）
 *
 * @author reception
 * @date 2026/12/08
 */
@Getter
@Setter
@TableName("s_reception_config")
@ApiModel(value = "ReceptionConfig对象", description = "轮牌参数")
public class ReceptionConfig extends BaseEntity {

    @ApiModelProperty("门店id，0为全局默认")
    private Long shopId;

    @ApiModelProperty("点值班后/上钟后多少分钟内可抢单")
    private Integer grabWindowMinutes;

    @ApiModelProperty("1开启值班/休息区分 0所有人同一队列")
    private Integer dutySwitch;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(value = "update_time", fill = FieldFill.UPDATE)
    @ApiModelProperty(hidden = true)
    private LocalDateTime updateTime;

}
