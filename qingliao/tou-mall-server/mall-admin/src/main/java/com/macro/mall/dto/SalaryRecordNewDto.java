package com.macro.mall.dto;

import com.alibaba.excel.annotation.ExcelIgnoreUnannotated;
import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.annotation.write.style.ColumnWidth;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 疗愈师薪资Dto
 *
 * @author zkl on 2026/3/15
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder //通过自动生成的构建器模式创建对象
public class SalaryRecordNewDto {
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
    @ExcelProperty(value = "本月税后工资")
    @ColumnWidth(25)
    private double actualIncome;
    @ExcelProperty(value = "平台名称")
    @ColumnWidth(25)
    private String webName;
    @ExcelProperty(value = "银行卡")
    @ColumnWidth(25)
    private String massagistCard;

}
