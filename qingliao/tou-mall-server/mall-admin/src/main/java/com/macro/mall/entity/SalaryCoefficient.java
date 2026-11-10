package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * @author
 * @date 2025/09/23
 */
@Getter
@Setter
@TableName("s_salary_coefficient")
@ApiModel(value = "SalaryCoefficient对象", description = "")
public class SalaryCoefficient extends BaseEntity {

    @ApiModelProperty("0试用、1正式")
    private Integer type;

    @ApiModelProperty("工作时长")
    private Long workingHours;

    @ApiModelProperty("系数")
    private BigDecimal coefficient;

}
