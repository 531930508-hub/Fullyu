package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 调整疗愈师服务时长表
 *
 * @author zkl
 * @date 2025/06/13
 */
@Getter
@Setter
@TableName("s_adjust")
@ApiModel(value = "Adjust对象", description = "调整疗愈师服务时长表")
public class Adjust extends BaseEntity {

    @ApiModelProperty("店铺id")
    private Long shopId;

    @ApiModelProperty("疗愈师Id")
    private Long massagistId;

    @ApiModelProperty("调整日期")
    private LocalDate adjustDate;

    /**
     * @see com.macro.mall.enums.AdjustType
     */
    @ApiModelProperty("调整类型")
    private Integer type;

    @ApiModelProperty("调整原因")
    private String reason;

    @ApiModelProperty("调整人")
    private Long createUser;

    @ApiModelProperty("调整时长（分钟）")
    private Integer duration;

    /**
     * @see com.macro.mall.enums.AdjustStatus
     */
    @ApiModelProperty("调整状态1生效中0已失效")
    private Integer status;

}
