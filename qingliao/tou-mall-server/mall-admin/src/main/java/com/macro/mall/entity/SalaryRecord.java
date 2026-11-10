package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.List;

/**
 * @author
 * @date 2025/09/23
 */
@Getter
@Setter
@TableName("s_salary_record")
@ApiModel(value = "SalaryRecord对象", description = "")
public class SalaryRecord extends BaseEntity {

    @ApiModelProperty("年度")
    private String year;

    @ApiModelProperty("计薪月份yyyy-MM")
    private String monthCode;

    @ApiModelProperty("技师id")
    private Long massagistId;

    @ApiModelProperty("本月时长")
    private double totalDuration;

    @ApiModelProperty("系数")
    private BigDecimal coefficient;

    @ApiModelProperty("本月计薪")
    private BigDecimal salary;

    @ApiModelProperty("税前收入（扣除6.2%服务费，即本月计薪÷1.062）")
    private BigDecimal preTaxIncome;

    @ApiModelProperty("其他调整")
    private BigDecimal otherAmount = BigDecimal.ZERO;

    @ApiModelProperty("本月扣除（按照国家规定，本月收入按照1.06%扣除增值税附加税，若本月总收入不超过10万则次月退回）")
    private BigDecimal preDeduction;

    @ApiModelProperty("取上月的本月扣除")
    private BigDecimal preDeductionReturned = BigDecimal.ZERO;

    @ApiModelProperty("本月应缴个人所得税")
    private BigDecimal payableIncomeTax;

    @ApiModelProperty("本月实际收入")
    private BigDecimal actualIncome;

    @ApiModelProperty("年度累计劳务报酬")
    @TableField(exist = false)
    private BigDecimal totalSalary;

    @ApiModelProperty("年度应纳税所得额")
    @TableField(exist = false)
    private BigDecimal totalAnnualTaxableIncome;

    @ApiModelProperty("预扣税率")
    @TableField(exist = false)
    private BigDecimal taxRate;

    @ApiModelProperty("速算扣除数")
    @TableField(exist = false)
    private BigDecimal quickDeduction;

    @ApiModelProperty("本年应缴纳税额")
    @TableField(exist = false)
    private BigDecimal totalAnnualTax = BigDecimal.ZERO;

    @ApiModelProperty("本年已缴纳税额")
    @TableField(exist = false)
    private BigDecimal totalPaidTax;

    @ApiModelProperty("其他调整")
    @TableField(exist = false)
    private List<SalaryOtherAmount> salaryOtherAmountList;

    @ApiModelProperty("本月接待时长（分钟，未封顶）")
    @TableField(exist = false)
    private Integer receptionDuration;

    @ApiModelProperty("本月计入工时的接待时长（分钟，已封顶）")
    @TableField(exist = false)
    private Integer receptionCountedDuration;

    @ApiModelProperty("超过封顶、不计工时的接待时长（分钟）")
    @TableField(exist = false)
    private Integer receptionExcessDuration;

    @ApiModelProperty("本月接待封顶上限（分钟）")
    @TableField(exist = false)
    private Integer receptionCapMinutes;

    @ApiModelProperty("是否应用了接待工时封顶")
    @TableField(exist = false)
    private Boolean receptionCapApplied;

}
