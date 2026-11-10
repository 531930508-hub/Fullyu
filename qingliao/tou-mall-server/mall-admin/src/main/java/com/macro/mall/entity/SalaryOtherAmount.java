package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 计薪其他调整
 *
 * @author
 * @date 2025/10/09
 */
@Getter
@Setter
@TableName("s_salary_other_amount")
@ApiModel(value = "SalaryOtherAmount对象", description = "")
public class SalaryOtherAmount extends BaseEntity {

    @ApiModelProperty("计薪月份yyyy-MM")
    private String monthCode;

    @ApiModelProperty("技师id")
    private Long massagistId;
    @TableField(exist = false)
    private String massagistName;

    @ApiModelProperty("0减、1加")
    private Integer type;

    @ApiModelProperty("金额")
    private BigDecimal amount;

    @ApiModelProperty("创建人")
    private Long createUser;

    @ApiModelProperty("活动标题")
    private String title;

    @ApiModelProperty("（备用字段）内容")
    private String content;

    @ApiModelProperty("店铺Id")
    private long shopId;

}
