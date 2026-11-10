package com.macro.mall.dto;

import com.alibaba.excel.annotation.ExcelIgnoreUnannotated;
import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.annotation.write.style.ColumnWidth;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 疗愈师薪资Dto
 *
 * @author zkl on 2026/3/15
 */
@Data
@ExcelIgnoreUnannotated
public class SalaryRecordDto {
    @ExcelProperty(value = "疗愈师名称")
    @ColumnWidth(25)
    private String massagistName;
    @ExcelProperty(value = "疗愈师真实姓名")
    @ColumnWidth(25)
    private String massagistRealName;
    @ExcelProperty(value = "疗愈师手机号")
    @ColumnWidth(25)
    private String massagistMobile;
    @ExcelProperty(value = "疗愈师身份证")
    @ColumnWidth(25)
    private String massagistSfzCard;
    @ExcelProperty(value = "本月计薪")
    @ColumnWidth(25)
    private String salary;
    @ExcelProperty(value = "本月调整数")
    @ColumnWidth(25)
    private String otherAmount;
    @ExcelProperty(value = "本月税前工资")
    @ColumnWidth(25)
    private String preTaxIncome;
    @ExcelProperty(value = "本月预扣除")
    @ColumnWidth(25)
    private String preDeduction;
    @ExcelProperty(value = "上月退回")
    @ColumnWidth(25)
    private String preDeductionReturned;
    @ExcelProperty(value = "本月个税")
    @ColumnWidth(25)
    private String payableIncomeTax;
    @ExcelProperty(value = "本月税后工资")
    @ColumnWidth(25)
    private String actualIncome;

}
