package com.macro.mall.dto;

import com.alibaba.excel.annotation.ExcelIgnoreUnannotated;
import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.annotation.write.style.ColumnWidth;
import lombok.Data;

import java.math.BigDecimal;

/** 经营日报导出行：日期、星期、当日收入、当日笔数（末行为合计）。 */
@Data
@ExcelIgnoreUnannotated
public class DailyRevenueRow {
    @ExcelProperty("日期")
    @ColumnWidth(14)
    private String date;
    @ExcelProperty("星期")
    @ColumnWidth(10)
    private String weekday;
    @ExcelProperty("当日收入（元）")
    @ColumnWidth(16)
    private BigDecimal income;
    @ExcelProperty("当日笔数")
    @ColumnWidth(12)
    private Integer count;
}
